import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, WalletCards, ArrowUpCircle, ArrowDownCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useSalesSources } from '@/hooks/useSalesSources';
import { newReceivableRequestId, recordCustomerReceivablePayment, invalidateCustomerReceivableQueries, createCustomerReceivable, customerDebtPaymentErrorMessage } from '@/lib/debt/customerReceivableRepository';
import { normalizeCanonicalCustomer } from '@/lib/closing/CanonicalCustomerLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const safeAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
};

const money = (value, currency) => `${currency}${safeAmount(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CustomerCreditTransactionPanel({
  value = [],
  onChange,
  compact = false,
  disabled = false,
  paymentMethod = 'cash',
  onPaymentMethodChange,
}) {
  const { currency, dir } = useLanguage();
  const { activeRestaurantId, branches = [] } = useTenant();
  const { selectedBranchId, selectedBranchKey, isAllBranches } = useBranchScope();
  const qc = useQueryClient();
  const { sources = [] } = useSalesSources();
  const [search, setSearch] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentCustomerId, setPaymentCustomerId] = useState('');
  const [busy, setBusy] = useState(false);

  const branch = useMemo(() => {
    if (!selectedBranchId) return null;
    return branches.find((item) => String(item.id) === String(selectedBranchId)) || null;
  }, [branches, selectedBranchId]);

  const branchId = branch?.id || selectedBranchId || null;
  const branchKey = branch?.key || branch?.branch_key || selectedBranchKey || '';

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['canonical_customer_credit_options', activeRestaurantId, branchId, search.trim()],
    queryFn: async () => {
      if (!activeRestaurantId || !branchId || isAllBranches) return [];
      const { data, error } = await supabase.rpc('erp_list_customer_credit_options', {
        p_restaurant_id: activeRestaurantId,
        p_branch_id: branchId,
        p_search: search.trim() || null,
        p_limit: 50,
      });
      if (error) throw error;
      return (data || []).map(normalizeCanonicalCustomer).filter(Boolean);
    },
    enabled: Boolean(activeRestaurantId && branchId && !isAllBranches),
    staleTime: 30000,
    gcTime: 120000,
  });

  const selectedCustomerId = value?.[0]?.customer_id || '';
  const selectedCustomer = customers.find((customer) => String(customer.id) === String(selectedCustomerId)) || null;
  const creditAmount = safeAmount(value?.[0]?.today_credit ?? value?.[0]?.amount);
  const selectedPaymentCustomer = customers.find((customer) => String(customer.id) === String(paymentCustomerId)) || null;
  const payment = safeAmount(paymentAmount);

  useEffect(() => {
    if (!selectedCustomerId && value?.length) onChange?.([]);
  }, [onChange, selectedCustomerId, value]);

  const afterCredit = selectedCustomer ? safeAmount(selectedCustomer.outstanding_balance) + creditAmount : 0;
  const afterPayment = selectedPaymentCustomer ? Math.max(0, safeAmount(selectedPaymentCustomer.outstanding_balance) - payment) : 0;

  const chooseCustomer = (id) => {
    const customer = customers.find((item) => String(item.id) === String(id));
    if (!customer) return;
    onChange?.([{
      customer_id: customer.id,
      customer_name_snapshot: customer.name,
      customer_phone: customer.phone || '',
      today_credit: creditAmount,
      amount: creditAmount,
    }]);
  };

  const setCredit = (raw) => {
    const amount = safeAmount(raw);
    if (!selectedCustomer) return;
    const remainingCapacity = Math.max(0, safeAmount(selectedCustomer.available_credit));
    onChange?.([{
      customer_id: selectedCustomer.id,
      customer_name_snapshot: selectedCustomer.name,
      customer_phone: selectedCustomer.phone || '',
      today_credit: amount,
      amount,
      available_credit_before: remainingCapacity,
    }]);
  };

  const recordPayment = async () => {
    if (!selectedPaymentCustomer || payment <= 0 || !activeRestaurantId || !branchId || !branchKey) return;
    if (payment > safeAmount(selectedPaymentCustomer.outstanding_balance)) {
      window.alert(`Payment cannot exceed outstanding debt (${money(selectedPaymentCustomer.outstanding_balance, currency)}).`);
      return;
    }
    try {
      setBusy(true);
      await recordCustomerReceivablePayment({
        restaurantId: activeRestaurantId,
        branchId,
        branch: branchKey,
        customerId: selectedPaymentCustomer.id,
        amount: payment,
        date: format(new Date(), 'yyyy-MM-dd'),
        paymentMethod,
        requestId: newReceivableRequestId(),
      });
      setPaymentAmount('');
      setPaymentCustomerId('');
      invalidateCustomerReceivableQueries(qc);
      await qc.invalidateQueries({ queryKey: ['canonical_customer_credit_options', activeRestaurantId, branchId] });
    } catch (error) {
      window.alert(customerDebtPaymentErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const selectSource = sources.find((source) => source?.system_key === 'credit' || source?.default_payment_method === 'credit');
  const creditLabel = selectSource?.name_en || 'Customer Credit';

  return (
    <section dir={dir} className={`w-full min-w-0 overflow-hidden rounded-2xl border border-blue-200 bg-white ${compact ? 'p-3' : 'p-4 sm:p-5'}`}>
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><WalletCards className="h-5 w-5" /></div>
          <div className="min-w-0"><h3 className="truncate text-sm font-bold text-slate-950">CUSTOMER CREDIT</h3><p className="text-xs text-slate-500">Debt is the only financial source.</p></div>
        </div>
        <span className="shrink-0 rounded-full bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">{creditLabel}</span>
      </div>

      <div className="min-w-0 space-y-4">
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-slate-600">Search customer...</Label>
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search customer or phone"
              className="h-11 min-w-0 pl-9 text-[16px]"
              disabled={disabled || isAllBranches}
            />
          </div>
          <Select value={selectedCustomerId} onValueChange={chooseCustomer} disabled={disabled || isLoading || isAllBranches}>
            <SelectTrigger className="h-11 min-w-0 text-[16px]">
              <SelectValue placeholder={isAllBranches ? 'Select a single branch first' : (isLoading ? 'Loading customers…' : 'Select customer')} />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-24px)]">
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={String(customer.id)}>
                  <span className="flex min-w-0 items-center gap-2"><span className="truncate font-medium">{customer.name}</span>{customer.phone ? <span className="shrink-0 text-xs text-slate-500">{customer.phone}</span> : null}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedCustomer && (
          <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
            <div className="grid min-w-0 grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-3">
              <div className="min-w-0"><div className="text-[11px] font-medium text-slate-500">Customer</div><div className="truncate text-sm font-bold text-slate-950">{selectedCustomer.name}</div><div className="truncate text-xs text-slate-500">{selectedCustomer.phone || '—'}</div></div>
              <div><div className="text-[11px] font-medium text-slate-500">Outstanding Debt</div><div className="text-sm font-bold tabular-nums text-slate-950">{money(selectedCustomer.outstanding_balance, currency)}</div></div>
              <div><div className="text-[11px] font-medium text-slate-500">Credit Limit</div><div className="text-sm font-bold tabular-nums text-slate-950">{money(selectedCustomer.credit_limit, currency)}</div></div>
            </div>
            <div className="mt-2 border-t border-slate-200 pt-2"><div className="text-[11px] font-medium text-slate-500">Available Credit</div><div className="text-base font-black tabular-nums text-blue-700">{money(selectedCustomer.available_credit, currency)}</div></div>
          </div>
        )}

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 sm:p-4">
          <div className="flex items-center gap-2"><ArrowUpCircle className="h-4 w-4 text-emerald-700" /><h4 className="text-sm font-bold text-slate-950">CREDIT SALE</h4></div>
          <p className="mt-1 text-xs text-slate-500">Creates receivable. Does not increase cash.</p>
          <Input type="number" min="0" step="0.01" inputMode="decimal" value={creditAmount ? String(creditAmount) : ''} onChange={(event) => setCredit(event.target.value)} placeholder="0.00" className="mt-3 h-11 text-[16px]" disabled={disabled || !selectedCustomer} />
          {selectedCustomer && <div className="mt-2 text-xs text-slate-500">After this credit sale: <span className="font-semibold text-slate-800">{money(afterCredit, currency)}</span></div>}
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 sm:p-4">
          <div className="flex items-center gap-2"><ArrowDownCircle className="h-4 w-4 text-amber-700" /><h4 className="text-sm font-bold text-slate-950">DEBT PAYMENT</h4></div>
          <p className="mt-1 text-xs text-slate-500">Reduces existing receivable. Does not create sales revenue.</p>
          <div className="mt-3 space-y-2">
            <Select value={paymentCustomerId} onValueChange={setPaymentCustomerId} disabled={disabled || isLoading || isAllBranches}>
              <SelectTrigger className="h-11 text-[16px]"><SelectValue placeholder="Customer" /></SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-24px)]">{customers.filter((customer) => safeAmount(customer.outstanding_balance) > 0).map((customer) => <SelectItem key={customer.id} value={String(customer.id)}><span className="truncate">{customer.name}</span></SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="0.00" className="h-11 text-[16px]" disabled={disabled || !selectedPaymentCustomer} />
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="min-w-0"><Label className="text-xs text-slate-600">Payment Method</Label><Select value={paymentMethod} onValueChange={onPaymentMethodChange} disabled={disabled}><SelectTrigger className="mt-1 h-11 text-[16px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="bank_transfer">Bank Transfer</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="wallet">Wallet</SelectItem></SelectContent></Select></div>
              <div className="flex items-end"><Button type="button" onClick={recordPayment} disabled={busy || disabled || !selectedPaymentCustomer || payment <= 0} className="h-11 w-full text-sm font-bold">{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Record Payment'}</Button></div>
            </div>
            {selectedPaymentCustomer && <div className="text-xs text-slate-500">After this payment: <span className="font-semibold text-slate-800">{money(afterPayment, currency)}</span></div>}
          </div>
        </div>
      </div>
    </section>
  );
}

export default CustomerCreditTransactionPanel;
