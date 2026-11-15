import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { readDebtHistory, collectionActionPayload } from '@/lib/debtCollection';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseISO, isPast } from 'date-fns';
import { useAuth } from '@/lib/AuthContext';
import { Phone } from 'lucide-react';
import { useDebtI18n } from '@/lib/debtI18n';

export default function DebtDetailSheet({ debt, open, onClose, onUpdated }) {
  const { user } = useAuth();
  const d = useDebtI18n();

  const ACTION_TYPES = [
    { value: 'call', label: d.action_call },
    { value: 'message', label: d.action_message },
    { value: 'visit', label: d.action_visit },
    { value: 'promise', label: d.action_promise },
    { value: 'settlement_offer', label: d.action_settlement },
    { value: 'written_off', label: d.action_written_off },
  ];

  const [payments, setPayments] = useState([]);
  const [actions, setActions] = useState([]);
  const [showActionForm, setShowActionForm] = useState(false);
  const [actionForm, setActionForm] = useState({ action_type: 'call', outcome: '', next_follow_up: '', promise_amount: '', promise_date: '' });
  const [saving, setSaving] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    setPayments([]); setActions([]); setLoadError(false); setSaveError(false);
    setShowActionForm(false);
    setActionForm({ action_type: 'call', outcome: '', next_follow_up: '', promise_amount: '', promise_date: '' });
    if (!debt || !open) return;
    setLoading(true);
    readDebtHistory(supabase, debt).then(([p, a]) => {
      if (live) { setPayments(p); setActions(a); }
    }).catch(() => { if (live) setLoadError(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [debt?.id, debt?.restaurant_id, open, reload]);

  const submitAction = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true); setSaveError(false);
    try {
      const promiseNote = actionForm.action_type === 'promise'
        ? d.promise_label(actionForm.promise_amount || '0', actionForm.promise_date || '—') : '';
      const created = await base44.entities.CollectionAction.create(
        collectionActionPayload(debt, actionForm, user?.email, promiseNote),
      );
      setActions(current => [created, ...current].slice(0, 20));
      setShowActionForm(false);
      setActionForm({ action_type: 'call', outcome: '', next_follow_up: '', promise_amount: '', promise_date: '' });
      if (actionForm.action_type === 'written_off') {
        await base44.entities.DebtRecord.update(debt.id, { status: 'written_off' });
        onUpdated?.();
      }
    } catch { setSaveError(true); }
    finally { setSaving(false); }
  };

  if (!debt) return null;

  const isOverdue = debt.due_date && debt.status !== 'paid' && isPast(parseISO(debt.due_date));

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="pb-2">
          <SheetTitle>{d.debt_detail(debt.party_name)}</SheetTitle>
        </SheetHeader>

        {/* Summary */}
        <div className={`rounded-xl p-4 mb-4 ${isOverdue ? 'bg-red-50 border border-red-200' : 'bg-slate-50'}`}>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-muted-foreground">{d.total}</div>
              <div className="text-lg font-bold">{debt.total_amount?.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{d.paid}</div>
              <div className="text-lg font-bold text-green-600">{(debt.paid_amount || 0)?.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{d.remaining}</div>
              <div className={`text-lg font-bold ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                {(debt.remaining_amount || 0)?.toLocaleString()}
              </div>
            </div>
          </div>
          {debt.party_phone && (
            <a href={`tel:${debt.party_phone}`} className="mt-3 flex items-center justify-center gap-2 text-sm text-primary">
              <Phone className="w-4 h-4" /> {debt.party_phone}
            </a>
          )}
        </div>

        {loading && <p role="status">{d.history_loading}</p>}
        {loadError && <div role="alert" className="rounded-xl border border-red-300 p-3 text-sm">
          {d.history_error} <Button type="button" variant="outline" onClick={() => setReload(n => n + 1)}>{d.retry}</Button>
        </div>}
        {saveError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{d.action_error}</p>}
        {/* Payment History */}
        <div className="mb-4">
          <h3 className="font-semibold text-sm mb-2">{d.payment_history}</h3>
          {(loading || loadError) ? null : payments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">{d.no_payments}</p>
          ) : (
            <div className="space-y-2">
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold text-green-700">+{p.amount?.toLocaleString()} {d.currency}</div>
                    <div className="text-xs text-muted-foreground">{p.payment_method} — {p.recorded_by_name || p.recorded_by}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{p.date}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Collection Actions */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">{d.collection_actions}</h3>
            <Button size="sm" variant="outline" className="min-h-11 text-xs" disabled={loading || loadError || saving} onClick={() => setShowActionForm(v => !v)}>
              {d.add_action}
            </Button>
          </div>

          {showActionForm && (
            <form onSubmit={submitAction} className="bg-slate-50 rounded-xl p-3 mb-3 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">{d.action_type}</Label>
                <Select value={actionForm.action_type} onValueChange={v => setActionForm(f => ({ ...f, action_type: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{d.outcome_label}</Label>
                <Textarea rows={2} className="text-sm" value={actionForm.outcome} onChange={e => setActionForm(f => ({ ...f, outcome: e.target.value }))} placeholder={d.outcome_placeholder} />
              </div>
              {actionForm.action_type === 'promise' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{d.promise_amount}</Label>
                    <Input type="number" className="h-8 text-sm" value={actionForm.promise_amount} onChange={e => setActionForm(f => ({ ...f, promise_amount: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{d.promise_date}</Label>
                    <Input type="date" className="h-8 text-sm" value={actionForm.promise_date} onChange={e => setActionForm(f => ({ ...f, promise_date: e.target.value }))} />
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">{d.follow_up}</Label>
                <Input type="date" className="h-8 text-sm" value={actionForm.next_follow_up} onChange={e => setActionForm(f => ({ ...f, next_follow_up: e.target.value }))} />
              </div>
              <Button type="submit" size="sm" disabled={saving} className="w-full h-8 text-xs">
                {saving ? d.saving : d.save_action}
              </Button>
            </form>
          )}

          {(loading || loadError) ? null : actions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">{d.no_actions}</p>
          ) : (
            <div className="space-y-2">
              {actions.map(a => (
                <div key={a.id} className="bg-slate-50 rounded-lg px-3 py-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{ACTION_TYPES.find(t => t.value === a.action_type)?.label || a.action_type}</span>
                    <span className="text-muted-foreground">{a.created_date?.slice(0, 10)}</span>
                  </div>
                  {a.notes && <div className="text-xs text-slate-600 mt-1">{a.notes}</div>}
                  {a.promise_date && <div className="text-xs text-amber-600 mt-1">{d.promise_label(a.promise_amount?.toLocaleString(), a.promise_date)}</div>}
                  {a.next_action_date && <div className="text-xs text-blue-600 mt-1">{d.followup_label(a.next_action_date)}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}