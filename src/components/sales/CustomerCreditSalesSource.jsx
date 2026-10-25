import { useLanguage } from '@/lib/LanguageContext';
import { useClosingTranslation } from '@/lib/closing/useClosingTranslation';
import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ArrowDownLeft, Check, CircleCheck, ClipboardCheck, CreditCard,
  ExternalLink, Info, Loader2, Pencil, Search, ShoppingCart, Trash2,
  TrendingDown, UserCheck, X,
} from 'lucide-react';

import { normalizeCreditAmount, validCreditAmount } from '@/lib/customerCreditSources';
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

const METRIC_TONES = {
  debt: { card: 'border-red-100 bg-red-50/45', icon: 'bg-red-100 text-red-600', label: 'text-red-600', value: 'text-red-700' },
  limit: { card: 'border-blue-100 bg-blue-50/45', icon: 'bg-blue-100 text-blue-600', label: 'text-blue-600', value: 'text-blue-700' },
  available: { card: 'border-emerald-100 bg-emerald-50/45', icon: 'bg-emerald-100 text-emerald-600', label: 'text-emerald-600', value: 'text-emerald-700' },
};

function Metric({ label, value, currency, tone, icon: Icon, projected = false, pendingLabel = 'Preview' }) {
  const colors = METRIC_TONES[tone];
  return (
    <div data-testid={`customer-credit-metric-${tone}`} className={`min-w-0 rounded-2xl border p-2.5 sm:p-3 ${colors.card}`}>
      <div className="flex items-center justify-between gap-1.5">
        <span className={`truncate text-[10px] font-bold sm:text-xs ${colors.label}`}>{label}</span>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${colors.icon}`}><Icon className="h-3.5 w-3.5" /></span>
      </div>
      <div className={`mt-2 truncate text-sm font-black tabular-nums sm:text-lg ${colors.value}`} dir="ltr">{money(currency, value)}</div>
      {projected && <div data-testid={`customer-credit-metric-${tone}-preview`} className="mt-1 text-[9px] font-bold leading-4 text-amber-700 sm:text-[10px]">{pendingLabel}</div>}
    </div>
  );
}

function TransactionTypeButton({ active, disabled, icon: Icon, label, tone, onClick }) {
  const activeClasses = tone === 'payment'
    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
    : 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm';
  const inactiveClasses = tone === 'payment'
    ? 'border-transparent bg-white text-slate-700 hover:bg-emerald-50/60 hover:text-emerald-700'
    : 'border-transparent bg-white text-slate-700 hover:bg-blue-50/60 hover:text-blue-700';
  return (
    <button
      type="button"
      className={`flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border px-2.5 text-xs font-black transition-colors sm:text-sm ${active ? activeClasses : inactiveClasses} disabled:cursor-not-allowed disabled:opacity-45`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

const initialsFor = (name) => String(name || 'Customer').trim().split(/\s+/).slice(0, 2)
  .map((part) => part.charAt(0)).join('').toUpperCase();

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
  onReviewCreditSale,
  isRecordingPayment = false,
  paymentMethods = [],
  disabled = false,
  creditPosted = false,
}) {
  const closingTr = useClosingTranslation();
  const { lang } = useLanguage();
  const searchInputRef = useRef(null);
  const [localSearch, setLocalSearch] = useState(customerSearch || '');
  const [searchOpen, setSearchOpen] = useState(Boolean(customerSearch.trim()));
  const selectedCustomer = customers.find((customer) => String(customer.id) === String(entry.customer_id));
  const hasSelectedCustomer = Boolean(entry.customer_id);
  const customerName = selectedCustomer?.customer_name || selectedCustomer?.name || entry.customer_name_snapshot || '';
  const customerIdentifier = selectedCustomer?.phone || selectedCustomer?.customer_code || entry.customer_phone || '';
  const outstanding = amount(selectedCustomer?.outstanding_balance ?? entry.previous_outstanding_debt);
  const creditLimit = amount(selectedCustomer?.credit_limit ?? entry.credit_limit);
  const available = Math.max(0, creditLimit - outstanding);
  const transactionType = entry.transaction_type === TRANSACTION_TYPES.DEBT_PAYMENT
    ? TRANSACTION_TYPES.DEBT_PAYMENT
    : TRANSACTION_TYPES.CREDIT_SALE;
  const isPayment = transactionType === TRANSACTION_TYPES.DEBT_PAYMENT;
  const rawAmount = isPayment ? entry.payment_amount : entry.amount;
  const invalidAmount = Boolean(rawAmount) && !validCreditAmount(rawAmount);
  const transactionAmount = amount(rawAmount);
  const projectedDebt = Math.round((outstanding + (isPayment ? -transactionAmount : transactionAmount)) * 100) / 100;
  const saleExceedsLimit = !isPayment && !creditPosted && transactionAmount > available;
  const paymentExceedsDebt = isPayment && transactionAmount > outstanding;
  // The three circled cards preview the entered change immediately. A preview
  // is never treated as a posted receivable or a posted repayment.
  const hasValidProjection = hasSelectedCustomer && transactionAmount > 0 &&
    !invalidAmount && !saleExceedsLimit && !paymentExceedsDebt &&
    (isPayment || !creditPosted);
  const displayedDebt = hasValidProjection ? Math.max(0, projectedDebt) : outstanding;
  const displayedAvailable = hasValidProjection ? Math.max(0, Math.round((creditLimit - displayedDebt) * 100) / 100) : available;
  const pendingLabel = lang === 'fa' ? 'پیش‌نمایش · ثبت‌نشده' :
    lang === 'ar' ? 'معاينة · لم يُرحّل' : 'Preview · not posted';

  const showBalancePreview = hasValidProjection;

  const activePaymentMethods = useMemo(() => {
    const configured = paymentMethods
      .filter((method) => method?.is_active !== false)
      .map((method) => ({ code: method.code || method.id, label: method[`name_${lang}`] || closingTr(method.name_en || method.name || method.code || method.id) }))
      .filter((method) => method.code);
    return configured.length ? configured : FALLBACK_PAYMENT_METHODS.map((method) => ({ code: method.code, label: closingTr(method.name_en) }));
  }, [paymentMethods, lang, closingTr]);
  const selectedPaymentMethod = activePaymentMethods.some((method) => method.code === entry.payment_method)
    ? entry.payment_method
    : activePaymentMethods[0]?.code || 'cash';

  const matches = useMemo(() => {
    const query = localSearch.trim().toLowerCase();
    return customers.filter((customer) => {
      if (!query) return true;
      return [customer.name, customer.customer_name, customer.phone, customer.customer_code]
        .filter(Boolean).join(' ').toLowerCase().includes(query);
    }).slice(0, 30);
  }, [localSearch, customers]);

  const updateSearch = (value) => {
    setLocalSearch(value);
    setSearchOpen(true);
    onCustomerSearch?.(value);
  };

  const clearSearch = () => {
    setLocalSearch('');
    setSearchOpen(true);
    onCustomerSearch?.('');
  };

  const clearCustomer = () => {
    clearSearch();
    onUpdate(entry.id, {
      customer_id: '', customer_name_snapshot: '', customer_phone: '',
      previous_outstanding_debt: 0, credit_limit: 0, available_credit: 0,
      transaction_type: TRANSACTION_TYPES.CREDIT_SALE, amount: '', payment_amount: '',
    });
  };

  const selectCustomer = (customer) => {
    // Dismiss the iOS keyboard in the selection gesture, before expanding the form.
    searchInputRef.current?.blur();
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

  const selectCustomerFromPointer = (event, customer) => {
    // On iOS Safari the search input blurs before the synthetic click fires.
    // Select on pointer down so closing the list cannot swallow the choice.
    event.preventDefault();
    selectCustomer(customer);
  };

  const selectCustomerFromKeyboard = (event, customer) => {
    // Native keyboard/button activation emits a click with detail 0. Pointer
    // clicks are already handled above and must not apply the selection twice.
    if (event.detail === 0) selectCustomer(customer);
  };

  const changeTransactionType = (nextType) => {
    if (nextType === transactionType) return;
    onUpdate(entry.id, {
      transaction_type: nextType,
      amount: creditPosted ? entry.amount : '',
      payment_amount: '',
      ...(nextType === TRANSACTION_TYPES.DEBT_PAYMENT ? { payment_method: selectedPaymentMethod } : {}),
    });
  };

  const updateAmount = (value) => onUpdate(entry.id, isPayment ? 'payment_amount' : 'amount', normalizeCreditAmount(value));

  return (
    <article
      className={`min-w-0 rounded-3xl border bg-white p-4 shadow-sm sm:p-5 ${saleExceedsLimit || paymentExceedsDebt ? 'border-red-300' : 'border-slate-200'}`}
      data-testid="customer-credit-sales-source"
    >
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{closingTr("Customer Credit")}</h2>
          <p className="mt-1 truncate text-xs font-medium text-slate-500 sm:text-sm">{closingTr("Sales Sources · Debt Management")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {idx > 0 && !disabled && !creditPosted && (
            <Button type="button" variant="ghost" size="icon" className="h-10 w-10 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => onRemove(entry.id)} aria-label={`${closingTr("Remove customer credit transaction")} ${idx + 1}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><ClipboardCheck className="h-5 w-5" /></span>
        </div>
      </header>

      <div className="mt-6 space-y-5">
        <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false); }}>
          <Label className="mb-2 block text-xs font-bold text-slate-600 sm:text-sm">{closingTr("Customer")}</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
            <Input
              ref={searchInputRef}
              value={localSearch}
              onChange={(event) => updateSearch(event.target.value)}
              onFocus={() => setSearchOpen(true)}
              placeholder={closingTr("Search by name, phone, or customer ID")}
              className="h-14 w-full rounded-2xl border-slate-300 pl-12 pr-11 text-base shadow-none focus-visible:ring-blue-500"
              autoComplete="off"
              inputMode="search"
              disabled={disabled}
              role="combobox"
              aria-expanded={searchOpen}
              aria-controls={`customer-credit-options-${entry.id}`}
              aria-label={`Search customer for transaction ${idx + 1}`}
            />
            {localSearch && !disabled && (
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={clearSearch} aria-label={closingTr("Clear customer search")}><X className="h-4 w-4" /></button>
            )}
          </div>

          {searchOpen && (
            <div id={`customer-credit-options-${entry.id}`} role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
              {matches.length > 0 ? matches.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  role="option"
                  aria-selected={String(customer.id) === String(entry.customer_id)}
                  className="flex w-full min-w-0 touch-manipulation items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                  onPointerDown={(event) => selectCustomerFromPointer(event, customer)}
                  onClick={(event) => selectCustomerFromKeyboard(event, customer)}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-black text-blue-700">{initialsFor(customer.customer_name || customer.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">{customer.customer_name || customer.name}</span>
                    <span className="block truncate text-xs text-slate-500" dir="ltr">{customer.phone || customer.customer_code || '—'}</span>
                  </span>
                  {String(customer.id) === String(entry.customer_id) && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                </button>
              )) : (
                <div className="px-3 py-5 text-center">
                  <p className="text-sm font-bold text-slate-800">{closingTr("No customer found")}</p>
                  <p className="mt-1 text-xs text-slate-500">{closingTr("Add or activate the customer in Debt Management.")}</p>
                  <a href="/debt-management" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline">{closingTr("Open Debt Management")}<ExternalLink className="h-3.5 w-3.5" /></a>
                </div>
              )}
            </div>
          )}
        </div>

        {hasSelectedCustomer ? (
          <>
            <div className="flex min-h-20 min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-black text-blue-700">{initialsFor(customerName)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-black text-slate-950">{customerName || closingTr('Selected customer')}</div>
                <div className="mt-0.5 truncate text-sm text-slate-500" dir="ltr">{customerIdentifier || '—'}</div>
              </div>
              {!disabled && !creditPosted && <button type="button" className="rounded-full p-2 text-blue-600 hover:bg-blue-50" onClick={clearCustomer} aria-label={closingTr("Change customer")}><Pencil className="h-4 w-4" /></button>}
            </div>

            <div aria-live="polite" data-testid="credit-balance-cards">
              <p className="mb-2 text-xs font-semibold text-slate-600">{showBalancePreview
                ? closingTr(isPayment ? 'After recording payment (preview)' : 'After finalizing closing (preview)')
                : closingTr('Recorded balance')}</p>
              <div className="grid grid-cols-3 gap-2">
              <Metric label={closingTr("Debt")} value={displayedDebt} currency={currency} tone="debt" icon={TrendingDown} projected={hasValidProjection} pendingLabel={pendingLabel} />
              <Metric label={closingTr("Limit")} value={creditLimit} currency={currency} tone="limit" icon={CreditCard} />
              <Metric label={closingTr("Available")} value={displayedAvailable} currency={currency} tone="available" icon={CircleCheck} projected={hasValidProjection} pendingLabel={pendingLabel} />
              </div>
              {showBalancePreview && <p className="mt-2 text-xs text-slate-500">{closingTr('Recorded balance')}: <bdi dir="ltr">{money(currency, outstanding)}</bdi></p>}
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
              <TransactionTypeButton active={!isPayment} disabled={disabled || isRecordingPayment} icon={ShoppingCart} label={closingTr("Credit Sale")} onClick={() => changeTransactionType(TRANSACTION_TYPES.CREDIT_SALE)} />
              <TransactionTypeButton active={isPayment} disabled={disabled || isRecordingPayment || outstanding <= 0} icon={CreditCard} label={closingTr("Debt Payment")} tone="payment" onClick={() => changeTransactionType(TRANSACTION_TYPES.DEBT_PAYMENT)} />
            </div>

            <div>
              <Label className="mb-2 block text-xs font-bold text-slate-600 sm:text-sm">{isPayment ? closingTr('Payment Amount') : closingTr('Credit Sale Amount')}</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500" dir="ltr">{currency}</span>
                <Input value={isPayment ? entry.payment_amount ?? '' : entry.amount ?? ''} onChange={(event) => updateAmount(event.target.value)} className="h-16 w-full rounded-2xl border-slate-400 pl-16 text-2xl font-medium tabular-nums shadow-none focus-visible:ring-blue-500" inputMode="decimal" type="text" placeholder={closingTr("0.00")} disabled={disabled || isRecordingPayment || (!isPayment && creditPosted)} aria-invalid={invalidAmount} dir="ltr" aria-label={isPayment ? closingTr('Debt payment amount') : closingTr('Credit sale amount')} />
              </div>
              <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-blue-50 px-3.5 py-3 text-blue-900">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <p className="text-[11px] leading-5 sm:text-xs">{isPayment ? closingTr('This payment is recorded immediately in Debt Management. It never creates sales revenue.') : closingTr('This amount is recorded as a receivable when the Sales Closing is finalized. It does not add cash.')}</p>
              </div>
              {invalidAmount && <p role="alert" className="mt-2 text-xs text-red-700">{closingTr("Enter a positive amount with at most two decimal places.")}</p>}
              {!invalidAmount && transactionAmount > 0 && !saleExceedsLimit && !paymentExceedsDebt && (isPayment || !creditPosted) && (
                <div className="mt-3 rounded-xl border border-blue-100 p-3 text-xs" aria-live="polite" data-testid="credit-balance-preview">
                  <p className="font-bold">{isPayment ? closingTr('After recording payment (preview)') : closingTr('After finalizing closing (preview)')}</p>
                  <p className="mt-1">{closingTr("Debt:")}<bdi dir="ltr">{money(currency, projectedDebt)}</bdi></p>
                  <p>{closingTr("Available:")}<bdi dir="ltr">{money(currency, Math.max(0, creditLimit - projectedDebt))}</bdi></p>
                </div>
              )}
              {!isPayment && creditPosted && <p className="mt-2 text-xs text-slate-600">{closingTr("This finalized credit sale is already posted. It will not add debt again.")}</p>}
              {(saleExceedsLimit || paymentExceedsDebt) && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700" role="alert"><AlertTriangle className="h-4 w-4 shrink-0" />{saleExceedsLimit ? closingTr('Amount exceeds available credit.') : closingTr('Payment cannot exceed outstanding debt.')}</div>
              )}
            </div>

            {isPayment ? (
              <div className="space-y-3">
                <div>
                  <Label className="mb-2 block text-xs font-bold text-slate-600 sm:text-sm">{closingTr("Payment Method")}</Label>
                  <Select value={selectedPaymentMethod} onValueChange={(value) => onUpdate(entry.id, 'payment_method', value)} disabled={disabled || isRecordingPayment}>
                    <SelectTrigger className="h-12 w-full rounded-xl text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>{activePaymentMethods.map((method) => <SelectItem key={method.code} value={method.code}>{method.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button type="button" className="h-14 w-full rounded-2xl bg-emerald-600 text-base font-black hover:bg-emerald-700" onClick={() => onRecordPayment?.({ ...entry, payment_method: selectedPaymentMethod })} disabled={disabled || isRecordingPayment || invalidAmount || transactionAmount <= 0 || paymentExceedsDebt} aria-busy={isRecordingPayment}>
                  {isRecordingPayment ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ArrowDownLeft className="mr-2 h-5 w-5" />}{isRecordingPayment ? closingTr('Recording…') : closingTr('Record Debt Payment')}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Button type="button" className="min-h-14 w-full rounded-2xl bg-blue-600 text-sm font-black hover:bg-blue-700" disabled={disabled || isRecordingPayment || invalidAmount || transactionAmount <= 0 || saleExceedsLimit || !onReviewCreditSale} onClick={() => onReviewCreditSale(entry)}>
                  <ClipboardCheck className="h-5 w-5" />{closingTr("Review & Save with Closing")}</Button>
                <p className="text-center text-xs text-slate-600" aria-live="polite">{closingTr("Credit Sale Saves with Sales Closing. Finalize Closing to record the debt.")}</p>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
            <UserCheck className="mx-auto h-6 w-6 text-slate-400" />
            <p className="mt-2 text-sm font-bold text-slate-800">{closingTr("Select a Debt Management customer")}</p>
            <p className="mt-1 text-xs text-slate-500">{closingTr("Debt, limit and available credit appear after selection.")}</p>
          </div>
        )}
      </div>
    </article>
  );
}

export { TRANSACTION_TYPES };
