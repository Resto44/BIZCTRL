import React, { useMemo } from 'react';
import { CreditCard, Minus, Plus, UserCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const numberValue = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

const formatMoney = (currency, value) => {
  const amount = numberValue(value);
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

function Metric({ label, value, tone = 'default', currency }) {
  const toneClass = {
    default: 'text-slate-900',
    blue: 'text-blue-700',
    green: 'text-emerald-700',
  }[tone];
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
      <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 truncate text-base font-extrabold tabular-nums ${toneClass}`} dir="ltr">
        {formatMoney(currency, value)}
      </div>
    </div>
  );
}

export default function CustomerCreditTransactionPanel({
  currency = 'SAR',
  customers = [],
  selectedCustomerId = '',
  onCustomerChange,
  searchValue = '',
  onSearchChange,
  creditSale = '',
  onCreditSaleChange,
  debtPayment = '',
  onDebtPaymentChange,
  paymentMethod = 'cash',
  onPaymentMethodChange,
  saving = false,
  onSubmit,
  dir = 'ltr',
  disabled = false,
}) {
  const selectedCustomer = customers.find((customer) => String(customer.id) === String(selectedCustomerId)) || null;
  const outstanding = numberValue(selectedCustomer?.outstanding_balance);
  const creditLimit = numberValue(selectedCustomer?.credit_limit);
  const available = Math.max(0, creditLimit - outstanding);
  const credit = numberValue(creditSale);
  const payment = Math.min(numberValue(debtPayment), outstanding + credit);
  const afterTransaction = Math.max(0, outstanding + credit - payment);
  const hasTransaction = credit > 0 || payment > 0;

  const submitDisabled = disabled || saving || !selectedCustomer || (!credit && !payment);

  const filteredCustomers = useMemo(() => customers, [customers]);

  return (
    <section dir={dir} className="w-full min-w-0 max-w-full box-border overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <CreditCard className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold tracking-tight text-slate-950">CUSTOMER CREDIT</h2>
            <p className="text-xs leading-5 text-slate-500">Credit sales create receivables. Debt payments reduce receivables.</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="space-y-2">
          <Label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Customer</Label>
          <div className="relative">
            <Input
              value={searchValue}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder="Search customer..."
              className="h-11 w-full text-base"
              autoComplete="off"
              inputMode="search"
              disabled={disabled}
              aria-label="Search customer"
            />
            {searchValue.trim() && filteredCustomers.length > 0 && (
              <div className="absolute inset-x-0 top-full z-40 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                {filteredCustomers.map((customer) => {
                  const active = String(customer.id) === String(selectedCustomerId);
                  const identifier = customer.phone || customer.customer_code || '';
                  return (
                    <button
                      key={customer.id}
                      type="button"
                      className={`flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                      onClick={() => {
                        onCustomerChange?.(customer.id);
                        onSearchChange?.('');
                      }}
                    >
                      <UserCheck className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{customer.name}</span>
                        {identifier && <span className="block truncate text-xs text-slate-500" dir="ltr">{identifier}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {selectedCustomer && (
            <div className="flex min-w-0 items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-blue-700 shadow-sm">
                <UserCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-950">{selectedCustomer.name}</div>
                <div className="truncate text-xs text-slate-500" dir="ltr">{selectedCustomer.phone || selectedCustomer.customer_code || '—'}</div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Financial Position</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Metric label="Outstanding" value={outstanding} currency={currency} />
            <Metric label="Credit Limit" value={creditLimit} currency={currency} tone="blue" />
            <div className="col-span-2 sm:col-span-1">
              <Metric label="Available" value={available} currency={currency} tone="green" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Transaction</div>
          <div className="grid min-w-0 gap-3 lg:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Plus className="h-4 w-4" /></div>
                <div>
                  <div className="text-sm font-bold text-slate-900">Credit Sale</div>
                  <div className="text-[11px] text-slate-500">Creates a receivable. Does not increase cash.</div>
                </div>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400" dir="ltr">{currency}</span>
                <Input
                  value={creditSale}
                  onChange={(event) => onCreditSaleChange?.(event.target.value)}
                  className="h-11 w-full pl-14 text-base tabular-nums"
                  inputMode="decimal"
                  type="text"
                  placeholder="0.00"
                  disabled={disabled}
                  aria-label="Credit sale amount"
                />
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Minus className="h-4 w-4" /></div>
                <div>
                  <div className="text-sm font-bold text-slate-900">Debt Payment</div>
                  <div className="text-[11px] text-slate-500">Reduces receivable. Does not create sales revenue.</div>
                </div>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400" dir="ltr">{currency}</span>
                <Input
                  value={debtPayment}
                  onChange={(event) => onDebtPaymentChange?.(event.target.value)}
                  className="h-11 w-full pl-14 text-base tabular-nums"
                  inputMode="decimal"
                  type="text"
                  placeholder="0.00"
                  disabled={disabled}
                  aria-label="Debt payment amount"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="min-w-0">
              <Label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={onPaymentMethodChange} disabled={disabled || payment <= 0}>
                <SelectTrigger className="h-11 w-full text-base">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="button" className="h-11 w-full sm:w-auto sm:min-w-40" disabled={submitDisabled} onClick={onSubmit}>
              {saving ? 'Saving…' : 'Save Transaction'}
            </Button>
          </div>
        </div>

        {hasTransaction && (
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">After Transaction</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-3 sm:grid-cols-4">
              <div>
                <div className="text-[11px] text-slate-500">Current Debt</div>
                <div className="mt-0.5 text-sm font-bold tabular-nums" dir="ltr">{formatMoney(currency, outstanding)}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Credit Sale</div>
                <div className="mt-0.5 text-sm font-bold text-blue-700 tabular-nums" dir="ltr">+ {formatMoney(currency, credit)}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Payment</div>
                <div className="mt-0.5 text-sm font-bold text-emerald-700 tabular-nums" dir="ltr">− {formatMoney(currency, payment)}</div>
              </div>
              <div className="col-span-2 rounded-lg bg-slate-900 px-3 py-2 sm:col-span-1">
                <div className="text-[11px] text-slate-300">After Transaction</div>
                <div className="mt-0.5 text-base font-extrabold text-white tabular-nums" dir="ltr">{formatMoney(currency, afterTransaction)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
