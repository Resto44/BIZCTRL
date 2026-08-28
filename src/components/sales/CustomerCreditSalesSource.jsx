import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ExternalLink,
  Loader2,
  Search,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TRANSACTION_TYPES = {
  CREDIT_SALE: 'credit_sale',
  DEBT_PAYMENT: 'debt_payment',
};

const amount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const money = (currency, value) => `${currency} ${amount(value).toLocaleString(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})}`;

const FALLBACK_PAYMENT_METHODS = [
  { code: 'cash', name_en: 'Cash' },
  { code: 'card', name_en: 'Card' },
  { code: 'bank_transfer', name_en: 'Bank Transfer' },
  { code: 'online', name_en: 'Online' },
  { code: 'wallet', name_en: 'Wallet' },
];

function Metric({ label, value, currency, tone = 'text-slate-950' }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-2.5 py-2.5 ring-1 ring-inset ring-slate-200">
      <div className="truncate text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:text-[10px]">{label}</div>
      <div className={`mt-0.5 truncate text-xs font-black tabular-nums sm:text-sm ${tone}`} dir="ltr">
        {money(currency, value)}
      </div>
    </div>
  );
}

function TransactionTypeButton({ active, disabled, icon: Icon, label, helper, tone, onClick }) {
  const toneClasses = tone === 'payment'
    ? active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-transparent text-slate-600 hover:bg-white hover:text-emerald-700'
    : active ? 'border-blue-600 bg-blue-600 text-white' : 'border-transparent text-slate-600 hover:bg-white hover:text-blue-700';

  return (
    <button
      type="button"
      className={`min-w-0 rounded-lg border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${toneClasses}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-xs font-black sm:text-sm">{label}</span>
          <span className={`block truncate text-[9px] sm:text-[10px] ${active ? 'text-white/80' : 'text-slate-400'}`}>{helper}</span>
        </span>
      </span>
    </button>
  );
}

export default function CustomerCreditSalesSource({
  entry,
  idx,
  onRemove,
  onUpdate,
  customers = [],
  currency = 'SAR',
  customerSearch = '',
  onCustomerSearch,
  onSelectCustomer,
  onRecordPayment,
  isRecordingPayment = false,
  paymentMethods = [],
  disabled = false,
}) {
  const [localSearch, setLocalSearch] = useState(customerSearch || '');
  const [searchOpen, setSearchOpen] = useState(Boolean(customerSearch.trim()));
  const selectedCustomer = customers.find((customer) => String(customer.id) === String(entry.customer_id));
  const hasSelectedCustomer = Boolean(entry.customer_id);
  const customerName = selectedCustomer?.customer_name || selectedCustomer?.name || entry.customer_name_snapshot || '';
  const customerIdentifier = selectedCustomer?.phone || selectedCustomer?.customer_code || entry.customer_phone || '';
  const outstanding = amount(selectedCustomer?.outstanding_balance ?? entry.previous_outstanding_debt);
  const creditLimit = amount(selectedCustomer?.credit_limit ?? entry.credit_limit);
  const available = amount(selectedCustomer?.available_credit ?? entry.available_credit ?? Math.max(0, creditLimit - outstanding));
  const transactionType = entry.transaction_type === TRANSACTION_TYPES.DEBT_PAYMENT
    ? TRANSACTION_TYPES.DEBT_PAYMENT
    : TRANSACTION_TYPES.CREDIT_SALE;
  const isPayment = transactionType === TRANSACTION_TYPES.DEBT_PAYMENT;
  const transactionAmount = amount(isPayment ? entry.payment_amount : entry.amount);
  const saleExceedsLimit = !isPayment && transactionAmount > available;
  const paymentExceedsDebt = isPayment && transactionAmount > outstanding;
  const afterTransaction = isPayment
    ? Math.max(0, outstanding - Math.min(transactionAmount, outstanding))
    : outstanding + transactionAmount;

  const activePaymentMethods = useMemo(() => {
    const configured = paymentMethods
      .filter((method) => method?.is_active !== false)
      .map((method) => ({
        code: method.code || method.id,
        label: method.name_en || method.name || method.code || method.id,
      }))
      .filter((method) => method.code);
    return configured.length
      ? configured
      : FALLBACK_PAYMENT_METHODS.map((method) => ({ code: method.code, label: method.name_en }));
  }, [paymentMethods]);
  const selectedPaymentMethod = activePaymentMethods.some((method) => method.code === entry.payment_method)
    ? entry.payment_method
    : activePaymentMethods[0]?.code || 'cash';

  const matches = useMemo(() => {
    const query = localSearch.trim().toLowerCase();
    return customers.filter((customer) => {
      if (!query) return true;
      const haystack = [customer.name, customer.customer_name, customer.phone, customer.customer_code]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    }).slice(0, 30);
  }, [localSearch, customers]);

  const updateSearch = (value) => {
    setLocalSearch(value);
    setSearchOpen(true);
    onCustomerSearch?.(value);
  };

  const clearCustomer = () => {
    setLocalSearch('');
    setSearchOpen(true);
    onCustomerSearch?.('');
    onUpdate(entry.id, {
      customer_id: '',
      customer_name_snapshot: '',
      customer_phone: '',
      previous_outstanding_debt: 0,
      credit_limit: 0,
      available_credit: 0,
      transaction_type: TRANSACTION_TYPES.CREDIT_SALE,
      amount: '',
      payment_amount: '',
    });
  };

  const selectCustomer = (customer) => {
    onUpdate(entry.id, {
      customer_id: customer.id,
      customer_name_snapshot: customer.customer_name || customer.name || '',
      customer_phone: customer.phone || customer.customer_code || '',
      previous_outstanding_debt: amount(customer.outstanding_balance),
      credit_limit: amount(customer.credit_limit),
      available_credit: amount(customer.available_credit ?? Math.max(0, amount(customer.credit_limit) - amount(customer.outstanding_balance))),
      transaction_type: TRANSACTION_TYPES.CREDIT_SALE,
      amount: '',
      payment_amount: '',
    });
    setLocalSearch('');
    setSearchOpen(false);
    onCustomerSearch?.('');
    onSelectCustomer?.();
  };

  const changeTransactionType = (nextType) => {
    if (nextType === transactionType) return;
    onUpdate(entry.id, {
      transaction_type: nextType,
      amount: '',
      payment_amount: '',
      ...(nextType === TRANSACTION_TYPES.DEBT_PAYMENT ? { payment_method: selectedPaymentMethod } : {}),
    });
  };

  const updateAmount = (value) => {
    onUpdate(entry.id, isPayment ? 'payment_amount' : 'amount', value);
  };

  return (
    <article
      className={`min-w-0 rounded-2xl border bg-white p-3 shadow-sm sm:p-4 ${saleExceedsLimit || paymentExceedsDebt ? 'border-red-300' : 'border-slate-200'}`}
      data-testid="customer-credit-sales-source"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950">Customer transaction {idx + 1}</p>
          <p className="truncate text-[10px] text-slate-500">Sales Source · Debt Management ledger</p>
        </div>
        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-slate-400 hover:bg-red-50 hover:text-red-600"
            onClick={() => onRemove(entry.id)}
            aria-label={`Remove customer credit transaction ${idx + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="mt-3 space-y-3">
        <div
          className="relative"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false);
          }}
        >
          <Label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Customer</Label>
          {hasSelectedCustomer ? (
            <div className="flex min-h-12 min-w-0 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-blue-700 shadow-sm">
                <UserCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black text-slate-950">{customerName || 'Selected customer'}</div>
                <div className="truncate text-xs text-slate-500" dir="ltr">{customerIdentifier || '—'}</div>
              </div>
              {!disabled && (
                <button type="button" className="rounded-full p-1.5 text-slate-400 hover:bg-white hover:text-slate-700" onClick={clearCustomer} aria-label="Change customer">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={localSearch}
                onChange={(event) => updateSearch(event.target.value)}
                onFocus={() => setSearchOpen(true)}
                placeholder="Search Debt Management customer"
                className="h-12 w-full pl-10 text-base"
                autoComplete="off"
                inputMode="search"
                disabled={disabled}
                role="combobox"
                aria-expanded={searchOpen}
                aria-controls={`customer-credit-options-${entry.id}`}
                aria-label={`Search customer for transaction ${idx + 1}`}
              />
            </div>
          )}

          {searchOpen && !hasSelectedCustomer && (
            <div id={`customer-credit-options-${entry.id}`} role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
              {matches.length > 0 ? matches.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                  onClick={() => selectCustomer(customer)}
                >
                  <UserCheck className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">{customer.customer_name || customer.name}</span>
                    <span className="block truncate text-xs text-slate-500" dir="ltr">{customer.phone || customer.customer_code || '—'}</span>
                  </span>
                  <Check className="h-4 w-4 shrink-0 text-blue-600" />
                </button>
              )) : (
                <div className="px-3 py-4 text-center">
                  <p className="text-sm font-bold text-slate-800">No customer found</p>
                  <p className="mt-1 text-xs text-slate-500">Add or activate the customer in Debt Management.</p>
                  <a href="/debt-management" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline">
                    Open Debt Management <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {hasSelectedCustomer && (
          <>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2" aria-live="polite">
              <Metric label="Debt" value={outstanding} currency={currency} tone="text-red-700" />
              <Metric label="Limit" value={creditLimit} currency={currency} tone="text-blue-700" />
              <Metric label="Available" value={available} currency={currency} tone="text-emerald-700" />
            </div>

            <div>
              <Label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Transaction</Label>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                <TransactionTypeButton
                  active={!isPayment}
                  disabled={disabled || isRecordingPayment}
                  icon={ArrowUpRight}
                  label="Credit Sale"
                  helper="Creates debt"
                  onClick={() => changeTransactionType(TRANSACTION_TYPES.CREDIT_SALE)}
                />
                <TransactionTypeButton
                  active={isPayment}
                  disabled={disabled || isRecordingPayment || outstanding <= 0}
                  icon={ArrowDownLeft}
                  label="Debt Payment"
                  helper={outstanding > 0 ? 'Reduces debt' : 'No debt due'}
                  tone="payment"
                  onClick={() => changeTransactionType(TRANSACTION_TYPES.DEBT_PAYMENT)}
                />
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {isPayment ? 'Payment Amount' : 'Credit Sale Amount'}
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400" dir="ltr">{currency}</span>
                <Input
                  value={isPayment ? entry.payment_amount ?? '' : entry.amount ?? ''}
                  onChange={(event) => updateAmount(event.target.value)}
                  className="h-12 w-full pl-14 text-lg font-bold tabular-nums"
                  inputMode="decimal"
                  type="text"
                  placeholder="0.00"
                  disabled={disabled || isRecordingPayment}
                  aria-label={isPayment ? 'Debt payment amount' : 'Credit sale amount'}
                />
              </div>
              <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
                {isPayment
                  ? 'Recorded immediately in Debt Management. It is not sales revenue.'
                  : 'Included in this Sales Closing and creates a receivable. It does not add cash.'}
              </p>
              {(saleExceedsLimit || paymentExceedsDebt) && (
                <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-red-700" role="alert">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {saleExceedsLimit ? 'Amount exceeds available credit.' : 'Payment cannot exceed outstanding debt.'}
                </div>
              )}
            </div>

            {isPayment && (
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="min-w-0">
                  <Label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Payment Method</Label>
                  <Select
                    value={selectedPaymentMethod}
                    onValueChange={(value) => onUpdate(entry.id, 'payment_method', value)}
                    disabled={disabled || isRecordingPayment}
                  >
                    <SelectTrigger className="h-11 w-full text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {activePaymentMethods.map((method) => <SelectItem key={method.code} value={method.code}>{method.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  className="h-11 w-full bg-emerald-600 hover:bg-emerald-700 sm:w-auto"
                  onClick={() => onRecordPayment?.({ ...entry, payment_method: selectedPaymentMethod })}
                  disabled={disabled || isRecordingPayment || transactionAmount <= 0 || paymentExceedsDebt}
                  aria-busy={isRecordingPayment}
                >
                  {isRecordingPayment ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowDownLeft className="mr-1.5 h-4 w-4" />}
                  {isRecordingPayment ? 'Recording…' : 'Record Payment'}
                </Button>
              </div>
            )}

            {transactionAmount > 0 && (
              <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-slate-950 px-3 py-2.5 text-white">
                <div className="min-w-0">
                  <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">After Transaction</div>
                  <div className="truncate text-xs text-slate-300">
                    {money(currency, outstanding)} {isPayment ? '−' : '+'} {money(currency, transactionAmount)}
                  </div>
                </div>
                <div className="shrink-0 text-base font-black tabular-nums" dir="ltr">{money(currency, afterTransaction)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

export { TRANSACTION_TYPES };
