import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useNotify } from '@/lib/useNotify';
import { createOwnerCashInjection } from '@/services/cashRegisterService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Banknote, CheckCircle2, Loader2, X } from 'lucide-react';
import { format } from 'date-fns';

const REASONS = [
  'Cash Shortage Coverage',
  'Operational Funding',
  'Supplier Payment',
  'Emergency Fund',
  'Salary Coverage',
  'Other',
];

export default function OwnerCashInjectionForm({ onSuccess, onCancel, shortageId, shortageAmount, defaultBranch }) {
  const { user } = useAuth();
  const { branches, allBranches, activeRestaurantId } = useTenant();
  const { currency } = useLanguage();
  const notif = useNotify();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    branch: defaultBranch || (branches[0]?.key || ''),
    amount: shortageAmount ? String(shortageAmount) : '',
    reason: shortageId ? 'Cash Shortage Coverage' : 'Operational Funding',
    notes: '',
  });

  const mutation = useMutation({
    mutationFn: () => {
      // Resolve branch UUID for RLS
      const branchObj = [...(allBranches || [])].find(
        b => b.key === form.branch || b.branch_key === form.branch
      );
      const branchId = branchObj?.id || null;
      return createOwnerCashInjection({
        date: form.date,
        branch: form.branch,
        branchId,
        restaurantId: activeRestaurantId,
        amount: Number(form.amount),
        reason: form.reason,
        notes: form.notes,
        createdBy: user?.email,
        createdByName: user?.full_name || user?.email,
        shortageId: shortageId || null,
      });
    },
    onSuccess: (data) => {
      notif.success(`Cash injection of ${currency}${Number(form.amount).toLocaleString()} recorded successfully.`);
      qc.invalidateQueries({ queryKey: ['daily_cash_settlements'] });
      qc.invalidateQueries({ queryKey: ['cash_shortages'] });
      qc.invalidateQueries({ queryKey: ['owner_cash_injections'] });
      qc.invalidateQueries({ queryKey: ['cash_movements'] });
      if (onSuccess) onSuccess(data);
    },
    onError: (err) => {
      notif.error('Failed to record cash injection: ' + (err?.message || 'Unknown error'));
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.branch) return notif.error('Please select a branch.');
    if (!form.amount || Number(form.amount) <= 0) return notif.error('Please enter a valid amount.');
    mutation.mutate();
  };

  return (
    <Card className="border-green-200 bg-green-50/30">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <Banknote className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Owner Cash Injection</CardTitle>
              <p className="text-xs text-muted-foreground">Inject cash into branch register</p>
            </div>
          </div>
          {onCancel && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
        {shortageId && (
          <Badge variant="outline" className="mt-2 text-xs bg-red-50 text-red-700 border-red-200 w-fit">
            Resolving Shortage: {currency}{Number(shortageAmount || 0).toLocaleString()}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Date */}
          <div className="space-y-1">
            <Label className="text-xs font-medium">Date</Label>
            <Input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="h-9 text-sm"
            />
          </div>

          {/* Branch */}
          <div className="space-y-1">
            <Label className="text-xs font-medium">Branch</Label>
            <Select value={form.branch} onValueChange={v => setForm(f => ({ ...f, branch: v }))}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map(b => (
                  <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-1">
            <Label className="text-xs font-medium">Amount ({currency})</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currency}</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="h-9 text-sm pl-8"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-1">
            <Label className="text-xs font-medium">Reason</Label>
            <Select value={form.reason} onValueChange={v => setForm(f => ({ ...f, reason: v }))}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs font-medium">Notes (optional)</Label>
            <Textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="text-sm min-h-[60px] resize-none"
              placeholder="Additional notes..."
            />
          </div>

          {/* Summary */}
          {form.amount && Number(form.amount) > 0 && (
            <div className="rounded-lg bg-green-100 border border-green-200 p-3 text-sm">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span className="font-medium">
                  {currency}{Number(form.amount).toLocaleString()} will be added to{' '}
                  <strong>{form.branch}</strong> cash register
                </span>
              </div>
              <p className="text-xs text-green-600 mt-1 ml-6">
                Owner Capital account will be increased. Treasury record will be created.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {onCancel && (
              <Button type="button" variant="outline" className="flex-1 h-10 text-sm" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              className="flex-1 h-10 text-sm bg-green-600 hover:bg-green-700"
              disabled={mutation.isPending || !form.amount || Number(form.amount) <= 0}
            >
              {mutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
              ) : (
                <><Banknote className="w-4 h-4 mr-2" /> Inject Cash</>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
