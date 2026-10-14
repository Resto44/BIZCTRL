import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44, supabase } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';
import { toast } from 'sonner';
import { useLanguage } from '@/lib/LanguageContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Settings2, Pencil } from 'lucide-react';

// DB columns: rule_name, applies_to, deduction_type, amount, late_threshold
const RULE_TYPES = { late: 'Late Arrival', absent: 'Absence', half_day: 'Half Day' };
const DED_TYPES = { fixed: 'Fixed Amount', daily_fraction: 'Fraction of Daily Salary' };

const emptyRule = {
  rule_name: '',
  applies_to: 'late',
  deduction_type: 'fixed',
  amount: '',
  late_threshold: 15,
  // UI-only helper for daily_fraction mode
  _fraction: '1',
};

export default function DeductionRulesSettings() {
  const { currency, translateLiteral } = useLanguage();
  const { activeRestaurant } = useTenant();
  const [editingId, setEditingId] = useState(null);
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyRule);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: rules = [], isError: rulesError } = useQuery({
    queryKey: ['payroll-deduction-rules', activeRestaurant?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('deduction_rules').select('*')
        .eq('restaurant_id', activeRestaurant.id).order('created_date').limit(2000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeRestaurant?.id,
  });

  const createMut = useMutation({
    mutationFn: d => editingId ? base44.entities.DeductionRule.update(editingId, d) : base44.entities.DeductionRule.create(d),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['payroll-deduction-rules'] });
      qc.invalidateQueries({ queryKey: ['payroll-rules'] });
      qc.invalidateQueries({ queryKey: ['payroll-dashboard-rules'] });
      setShowForm(false);
      setForm(emptyRule);
      setEditingId(null);
      toast.success(translateLiteral('Deduction rule saved'));
    },
    onError: (error) => {
      toast.error(error?.message || translateLiteral('Unable to save deduction rule'));
      console.error('DEDUCTION ERROR', error);
    },
  });

  const deleteMut = useMutation({
    mutationFn: id => base44.entities.DeductionRule.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-deduction-rules'] });
      qc.invalidateQueries({ queryKey: ['payroll-rules'] });
      qc.invalidateQueries({ queryKey: ['payroll-dashboard-rules'] });
      toast.success(translateLiteral('Deduction rule deleted'));
    },
    onError: error => toast.error(error?.message || translateLiteral('Unable to delete deduction rule')),
  });

  const handleSave = () => {
    if (!form.rule_name?.trim() || !form.applies_to || !activeRestaurant?.id) {
      toast.error(translateLiteral('Select a business and enter a rule name'));
      return;
    }
    const numeric = Number(form.deduction_type === 'daily_fraction' ? form._fraction : form.amount);
    if (!Number.isFinite(numeric) || numeric <= 0 ||
        (form.deduction_type === 'daily_fraction' && numeric > 1)) {
      toast.error(translateLiteral('Fixed amount must be positive. Daily fraction must be between 0 and 1.'));
      return;
    }

    // Build payload using exact DB column names only.
    // The deduction_rules table has: rule_name, applies_to, deduction_type, amount, late_threshold
    // There is NO is_active, name, type, or fraction column.
    const payload = {
      rule_name: form.rule_name.trim(),
      applies_to: form.applies_to,
      deduction_type: form.deduction_type,
      amount: numeric,
      restaurant_id: activeRestaurant.id,
      late_threshold: Math.max(0, Number(form.late_threshold) || 0),
    };

    createMut.mutate(payload);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">Deduction Rules</h3>
          <p className="text-xs text-muted-foreground">Configure how absences, late arrivals, and half-days affect salary</p>
        </div>
        <Button size="sm" onClick={() => { setEditingId(null); setForm(emptyRule); setShowForm(true); }}><Plus className="w-3.5 h-3.5 mr-1" /> Add Rule</Button>
      </div>

      {rulesError && <Card className="border-red-200 p-3 text-sm text-red-700">
        {translateLiteral('Unable to load deduction rules. Check access and try again.')}
      </Card>}
      {rulesError ? null : rules.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Settings2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No deduction rules configured</p>
          <p className="text-xs">Add rules to auto-calculate deductions in payroll</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(r => (
            <Card key={r.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {/* DB stores rule_name and applies_to */}
                  <p className="font-medium text-sm">{r.rule_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {RULE_TYPES[r.applies_to] || r.applies_to} →{' '}
                    {r.deduction_type === 'fixed'
                      ? `${currency} ${r.amount} per occurrence`
                      : `${r.amount} of daily salary per occurrence`}
                    {r.applies_to === 'late' && ` (threshold: ${r.late_threshold ?? 15} min)`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {r.deduction_type === 'daily_fraction' && !(Number(r.amount) > 0 && Number(r.amount) <= 1)
                    && <span className="text-xs text-red-600">{translateLiteral('Invalid fraction')}</span>}
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    aria-label="Edit deduction rule"
                    onClick={() => {
                      setEditingId(r.id);
                      setForm({
                        rule_name: r.rule_name || '',
                        applies_to: r.applies_to || 'late',
                        deduction_type: r.deduction_type || 'fixed',
                        amount: String(r.amount ?? ''),
                        late_threshold: r.late_threshold ?? 15,
                        _fraction: String(r.amount ?? 1),
                      });
                      setShowForm(true);
                    }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="text-destructive h-7 w-7" onClick={() => deleteMut.mutate(r.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-3 bg-muted/40 text-xs text-muted-foreground space-y-1">
        <p className="font-medium">How deductions work:</p>
        <p>• <strong>Fixed amount</strong>: deducts a flat amount per each occurrence (e.g. SAR 50 per absence)</p>
        <p>• <strong>Daily fraction</strong>: deducts a fraction of the daily salary (base ÷ 26 working days) per occurrence</p>
        <p>• Late rules only apply when the employee's attendance status is "Late"</p>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{translateLiteral(editingId ? 'Edit Deduction Rule' : 'Add Deduction Rule')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Rule Name</Label>
              <Input value={form.rule_name} onChange={e => set('rule_name', e.target.value)} placeholder="e.g. Absence Deduction" />
            </div>
            <div>
              <Label className="text-xs">Applies To</Label>
              <Select value={form.applies_to} onValueChange={v => set('applies_to', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(RULE_TYPES).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Deduction Type</Label>
              <Select value={form.deduction_type} onValueChange={v => set('deduction_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(DED_TYPES).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{form.deduction_type === 'daily_fraction'
                ? translateLiteral('Daily Salary Fraction (0–1)') : `${translateLiteral('Amount')} (${currency})`}</Label>
              {form.deduction_type === 'daily_fraction'
                ? <Input type="number" min="0.01" max="1" step="0.01" value={form._fraction}
                    onChange={e => set('_fraction', e.target.value)} placeholder="0.5" />
                : <Input type="number" min="0" step="0.01" value={form.amount}
                    onChange={e => set('amount', e.target.value)} placeholder="0" />}
            </div>
            {form.applies_to === 'late' && (
              <div>
                <Label className="text-xs">Late Threshold (minutes)</Label>
                <Input type="number" value={form.late_threshold} onChange={e => set('late_threshold', e.target.value)} />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave} disabled={createMut.isPending || !activeRestaurant?.id}>Save Rule</Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
