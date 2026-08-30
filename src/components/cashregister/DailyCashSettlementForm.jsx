import React, { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useNotify } from '@/lib/useNotify';
import {
  getOrCreateSettlement,
  computeExpectedClosing,
  submitSettlement,
  approveSettlement,
  rejectSettlement,
} from '@/services/cashRegisterService';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  ArrowDownRight, ArrowUpRight, CheckCircle2, XCircle, AlertTriangle,
  Loader2, Send, Clock, Banknote, TrendingDown, TrendingUp,
  ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import OwnerCashInjectionForm from './OwnerCashInjectionForm';

// ── Numeric Keypad ────────────────────────────────────────────────────────────
function NumericKeypad({ value, onChange }) {
  const handleKey = (key) => {
    if (key === 'C') { onChange(''); return; }
    if (key === '⌫') { onChange(String(value).slice(0, -1)); return; }
    if (key === '.' && String(value).includes('.')) return;
    onChange(String(value) + key);
  };

  const keys = ['7','8','9','4','5','6','1','2','3','C','0','.','⌫'];

  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {keys.map(k => (
        <button
          key={k}
          type="button"
          onClick={() => handleKey(k)}
          className={`
            h-14 rounded-xl text-lg font-semibold transition-all active:scale-95
            ${k === 'C' ? 'bg-red-100 text-red-700 hover:bg-red-200' :
              k === '⌫' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' :
              'bg-muted hover:bg-muted/80 text-foreground'}
          `}
        >
          {k}
        </button>
      ))}
      {/* Full-width confirm button */}
      <button
        type="button"
        onClick={() => {}}
        className="col-span-3 h-12 rounded-xl bg-primary text-primary-foreground text-base font-semibold hover:bg-primary/90 transition-all active:scale-95"
      >
        Confirm Count
      </button>
    </div>
  );
}

// ── Cash Line Item ────────────────────────────────────────────────────────────
function CashLineItem({ label, value, direction, color, bold }) {
  const { currency } = useLanguage();
  const fmt = (n) => `${currency}${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return (
    <div className={`flex items-center justify-between py-2 border-b border-border last:border-0 ${bold ? 'font-semibold' : ''}`}>
      <div className="flex items-center gap-2">
        {direction === 'in' && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
        {direction === 'out' && <ArrowDownRight className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
        <span className={`text-sm ${bold ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
      </div>
      <span className={`text-sm font-medium ${color || (direction === 'in' ? 'text-emerald-600' : direction === 'out' ? 'text-red-600' : 'text-foreground')}`}>
        {direction === 'in' ? '+' : direction === 'out' ? '-' : ''}{fmt(value)}
      </span>
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const config = {
    Draft:      { color: 'bg-gray-100 text-gray-700 border-gray-200',     icon: Clock },
    Submitted:  { color: 'bg-blue-100 text-blue-700 border-blue-200',     icon: Send },
    Approved:   { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
    Rejected:   { color: 'bg-red-100 text-red-700 border-red-200',        icon: XCircle },
  };
  const c = config[status] || config.Draft;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.color}`}>
      <Icon className="w-3 h-3" />{status}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DailyCashSettlementForm({ branch, date, onSettlementChange }) {
  const { user } = useAuth();
  const { activeRestaurantId } = useTenant();
  const { currency } = useLanguage();
  const notif = useNotify();
  const qc = useQueryClient();

  const d = date || format(new Date(), 'yyyy-MM-dd');
  const fmt = (n) => `${currency}${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const [cashCounted, setCashCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [showKeypad, setShowKeypad] = useState(false);
  const [showInjection, setShowInjection] = useState(false);
  const [showDetails, setShowDetails] = useState(true);

  // Load settlement for this branch/date
  const { data: settlements = [], isLoading, refetch } = useQuery({
    queryKey: ['daily_cash_settlements', d, branch, user?.email],
    queryFn: () => base44.entities.DailyCashSettlement.filter({
      date: d,
      branch,
      created_by: user?.email,
    }, '-created_date', 5),
    enabled: !!branch && !!user?.email,
    staleTime: 15000,
  });

  const settlement = settlements[0] || null;

  // Load today's cash movements for this branch
  const { data: movements = [] } = useQuery({
    queryKey: ['cash_movements', d, branch, user?.email],
    queryFn: () => base44.entities.CashMovement.filter({
      date: d,
      branch,
      created_by: user?.email,
      is_reversed: false,
    }, '-posted_at', 200),
    enabled: !!branch && !!user?.email,
    staleTime: 15000,
  });

  // Compute expected closing from current settlement data
  const computed = useMemo(() => {
    if (!settlement) return { expected_closing_cash: 0, difference: 0, shortage: 0, overage: 0 };
    return computeExpectedClosing({
      ...settlement,
      cash_counted: Number(cashCounted) || Number(settlement.cash_counted) || 0,
    });
  }, [settlement, cashCounted]);

  const isEditable = !settlement || settlement.status === 'Draft' || settlement.status === 'Rejected';
  const isOwner = user?.role === 'owner';

  // ── Submit Settlement ──────────────────────────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: async () => {
      let s = settlement;
      if (!s) {
        s = await getOrCreateSettlement({
          date: d,
          branch,
          createdBy: user?.email,
          restaurantId: activeRestaurantId,
        });
      }
      return submitSettlement({
        settlementId: s.id,
        cashCounted: Number(cashCounted) || 0,
        notes,
        manager: user?.email,
        managerName: user?.full_name || user?.email,
      });
    },
    onSuccess: (data) => {
      notif.success('Settlement submitted successfully.');
      qc.invalidateQueries({ queryKey: ['daily_cash_settlements'] });
      qc.invalidateQueries({ queryKey: ['cash_shortages'] });
      // Refresh dashboard and live summary
      qc.invalidateQueries({ queryKey: ['sales_today'] });
      qc.invalidateQueries({ queryKey: ['sales_month'] });
      qc.invalidateQueries({ queryKey: ['sales_today_live'] });
      qc.invalidateQueries({ queryKey: ['sales_yesterday_live'] });
      qc.invalidateQueries({ queryKey: ['sales_month_live'] });
      qc.invalidateQueries({ queryKey: ['wallet_transactions_dash'] });
      if (onSettlementChange) onSettlementChange(data);
    },
    onError: (err) => notif.error('Failed to submit: ' + (err?.message || 'Unknown error')),
  });

  // ── Approve Settlement ─────────────────────────────────────────────────────
  const approveMutation = useMutation({
    mutationFn: () => approveSettlement({ settlementId: settlement.id, approvedBy: user?.email }),
    onSuccess: () => {
      notif.success('Settlement approved.');
      qc.invalidateQueries({ queryKey: ['daily_cash_settlements'] });
      qc.invalidateQueries({ queryKey: ['sales_today'] });
      qc.invalidateQueries({ queryKey: ['sales_today_live'] });
      qc.invalidateQueries({ queryKey: ['sales_month_live'] });
      qc.invalidateQueries({ queryKey: ['wallet_transactions_dash'] });
    },
    onError: (err) => notif.error('Failed to approve: ' + (err?.message || 'Unknown error')),
  });

  // ── Reject Settlement ──────────────────────────────────────────────────────
  const rejectMutation = useMutation({
    mutationFn: () => rejectSettlement({ settlementId: settlement.id, rejectedBy: user?.email, notes }),
    onSuccess: () => {
      notif.success('Settlement rejected.');
      qc.invalidateQueries({ queryKey: ['daily_cash_settlements'] });
    },
    onError: (err) => notif.error('Failed to reject: ' + (err?.message || 'Unknown error')),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const diffColor = computed.difference < 0 ? 'text-red-600' : computed.difference > 0 ? 'text-amber-600' : 'text-emerald-600';

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">{format(new Date(d), 'EEEE, MMMM d')}</h3>
          <p className="text-xs text-muted-foreground">{branch}</p>
        </div>
        <div className="flex items-center gap-2">
          {settlement && <StatusBadge status={settlement.status} />}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Cash Flow Summary */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Cash Flow Summary</CardTitle>
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="text-muted-foreground hover:text-foreground"
            >
              {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </CardHeader>
        {showDetails && (
          <CardContent className="px-4 pb-3">
            {/* Opening */}
            <CashLineItem label="Opening Cash" value={settlement?.opening_cash || 0} color="text-blue-600" bold />
            <div className="mt-1 mb-1">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide mb-1">Cash In</p>
              <CashLineItem label="Cash Sales" value={settlement?.cash_sales || 0} direction="in" />
              <CashLineItem label="Customer Debt Collection" value={settlement?.customer_debt_collection || 0} direction="in" />
              <CashLineItem label="Owner Injection" value={settlement?.owner_injection || 0} direction="in" />
              <CashLineItem label="Cash Transfer In" value={settlement?.cash_transfer_in || 0} direction="in" />
              <CashLineItem label="Supplier Refunds" value={settlement?.supplier_refunds || 0} direction="in" />
            </div>
            <div className="mt-1 mb-1">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide mb-1">Cash Out</p>
              <CashLineItem label="Cash Purchases" value={settlement?.cash_purchases || 0} direction="out" />
              <CashLineItem label="Cash Expenses" value={settlement?.cash_expenses || 0} direction="out" />
              <CashLineItem label="Supplier Payments" value={settlement?.supplier_payments || 0} direction="out" />
              <CashLineItem label="Cash Transfer Out" value={settlement?.cash_transfer_out || 0} direction="out" />
              <CashLineItem label="Customer Refunds" value={settlement?.cash_refunds_out || 0} direction="out" />
            </div>
            <Separator className="my-2" />
            <CashLineItem label="Expected Closing Cash" value={computed.expected_closing_cash} color="text-foreground" bold />
          </CardContent>
        )}
      </Card>

      {/* Cash Count Section */}
      {isEditable && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Banknote className="w-4 h-4 text-primary" />
              Count Cash
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Actual Cash Counted ({currency})</Label>
              <div
                className="relative cursor-pointer"
                onClick={() => setShowKeypad(!showKeypad)}
              >
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currency}</span>
                <div className="h-14 pl-8 pr-4 flex items-center text-2xl font-bold rounded-xl border-2 border-primary/30 bg-primary/5 text-primary">
                  {cashCounted || <span className="text-muted-foreground/50 text-lg">Tap to count</span>}
                </div>
              </div>

              {/* Mobile Numeric Keypad */}
              {showKeypad && (
                <NumericKeypad value={cashCounted} onChange={setCashCounted} />
              )}

              {/* Difference Preview */}
              {cashCounted !== '' && Number(cashCounted) >= 0 && (
                <div className={`rounded-lg p-3 border ${computed.difference < 0 ? 'bg-red-50 border-red-200' : computed.difference > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {computed.difference < 0 ? (
                        <TrendingDown className="w-4 h-4 text-red-600" />
                      ) : computed.difference > 0 ? (
                        <TrendingUp className="w-4 h-4 text-amber-600" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      )}
                      <span className={`text-sm font-semibold ${diffColor}`}>
                        {computed.difference < 0 ? 'Shortage' : computed.difference > 0 ? 'Overage' : 'Balanced'}
                      </span>
                    </div>
                    <span className={`text-sm font-bold ${diffColor}`}>
                      {computed.difference !== 0 ? (computed.difference > 0 ? '+' : '') : ''}
                      {fmt(computed.difference)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                    <div>Expected: <span className="font-medium text-foreground">{fmt(computed.expected_closing_cash)}</span></div>
                    <div>Counted: <span className="font-medium text-foreground">{fmt(cashCounted)}</span></div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="text-sm min-h-[60px] resize-none"
                  placeholder="Manager notes..."
                />
              </div>

              {/* Submit Button */}
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending || cashCounted === ''}
                className="w-full h-12 text-base font-semibold"
              >
                {submitMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
                ) : (
                  <><Send className="w-4 h-4 mr-2" /> Submit Settlement</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submitted — Awaiting Owner Approval */}
      {settlement?.status === 'Submitted' && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <p className="text-sm font-medium text-blue-700">Awaiting Owner Approval</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div>Expected: <span className="font-semibold">{fmt(settlement.expected_closing_cash)}</span></div>
              <div>Counted: <span className="font-semibold">{fmt(settlement.cash_counted)}</span></div>
              <div>Difference: <span className={`font-semibold ${diffColor}`}>{fmt(settlement.difference)}</span></div>
              <div>Submitted by: <span className="font-semibold">{settlement.manager_name || settlement.manager}</span></div>
            </div>
            {settlement.difference !== 0 && (
              <div className={`rounded-lg p-2 mb-3 ${settlement.difference < 0 ? 'bg-red-100 border border-red-200' : 'bg-amber-100 border border-amber-200'}`}>
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className={`w-3.5 h-3.5 ${settlement.difference < 0 ? 'text-red-600' : 'text-amber-600'}`} />
                  <span className={`text-xs font-semibold ${settlement.difference < 0 ? 'text-red-700' : 'text-amber-700'}`}>
                    {settlement.difference < 0 ? 'Cash Shortage' : 'Cash Overage'}: {fmt(Math.abs(settlement.difference))}
                  </span>
                </div>
              </div>
            )}
            {/* Owner Approval Actions */}
            {isOwner && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700 text-xs"
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-9 border-red-200 text-red-700 hover:bg-red-50 text-xs"
                  onClick={() => rejectMutation.mutate()}
                  disabled={rejectMutation.isPending}
                >
                  {rejectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3 mr-1" />}
                  Reject
                </Button>
              </div>
            )}
            {/* Owner Injection Button for Shortage */}
            {isOwner && settlement.difference < 0 && (
              <Button
                size="sm"
                variant="outline"
                className="w-full h-9 mt-2 border-green-200 text-green-700 hover:bg-green-50 text-xs"
                onClick={() => setShowInjection(!showInjection)}
              >
                <Banknote className="w-3 h-3 mr-1" />
                Inject Cash to Cover Shortage
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Approved */}
      {settlement?.status === 'Approved' && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <p className="text-sm font-medium text-emerald-700">Settlement Approved</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Approved by {settlement.approved_by} at {settlement.approved_at ? format(new Date(settlement.approved_at), 'HH:mm') : ''}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Owner Cash Injection Form */}
      {showInjection && (
        <OwnerCashInjectionForm
          defaultBranch={branch}
          shortageId={settlement?.shortage_record_id}
          shortageAmount={settlement ? Math.abs(settlement.difference) : 0}
          onSuccess={() => {
            setShowInjection(false);
            qc.invalidateQueries({ queryKey: ['daily_cash_settlements'] });
          }}
          onCancel={() => setShowInjection(false)}
        />
      )}

      {/* Cash Movement Log */}
      {movements.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Cash Movement Log ({movements.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {movements.slice(0, 20).map((m) => (
                <div key={m.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    {m.direction === 'in' ? (
                      <ArrowUpRight className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3 text-red-500 flex-shrink-0" />
                    )}
                    <span className="text-muted-foreground truncate max-w-[160px]">{m.description || m.movement_type}</span>
                  </div>
                  <span className={`font-medium ${m.direction === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {m.direction === 'in' ? '+' : '-'}{currency}{Number(m.amount).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
