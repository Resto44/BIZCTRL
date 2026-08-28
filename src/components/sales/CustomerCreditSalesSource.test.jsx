import React, { useMemo } from 'react';
import { AlertTriangle, Minus, Plus, Trash2, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const amount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const money = (currency, value) => `${currency} ${amount(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function Metric({ label, value, currency, tone = 'text-slate-900' }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
      <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 truncate text-sm font-extrabold tabular-nums ${tone}`} dir="ltr">{money(currency, value)}</div>
    </div>
  );
}

export default function CustomerCreditSalesSource({
  entry, idx, onRemove, onUpdate, customers = [], currency = 'SAR', customerSearch = '', onCustomerSearch,
  onRecordPayment, isRecordingPayment = false, disabled = false,
}) {
  const selectedCustomer = customers.find((customer) => String(customer.id) === String(entry.customer_id));
  const customerName = selectedCustomer?.customer_name || selectedCustomer?.name || entry.customer_name_snapshot || '';
  const customerIdentifier = selectedCustomer?.phone || selectedCustomer?.customer_code || entry.customer_phone || '';
  const outstanding = amount(selectedCustomer?.outstanding_balance ?? entry.previous_outstanding_debt);
  const creditLimit = amount(selectedCustomer?.credit_limit ?? entry.credit_limit);
  const available = Math.max(0, creditLimit - outstanding);
  const creditSale = amount(entry.amount);
  const payment = amount(entry.payment_amount);
  const after = Math.max(0, outstanding + creditSale - Math.min(payment, outstanding + creditSale));
  const saleExceedsLimit = creditLimit > 0 && creditSale > available;
  const paymentExceedsDebt = payment > outstanding + creditSale;

  const matches = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return [];
    return customers.filter((customer) => [customer.name, customer.customer_name, customer.phone, customer.customer_code]
      .filter(Boolean).join(' ').toLowerCase().includes(query)).slice(0, 30);
  }, [customerSearch, customers]);

  const selectCustomer = (customer) => {
    const customerOutstanding = amount(customer.outstanding_balance);
    const customerLimit = amount(customer.credit_limit);
    onUpdate(entry.id, {
      customer_id: customer.id,
      customer_name_snapshot: customer.customer_name || customer.name || '',
      customer_phone: customer.phone || customer.customer_code || '',
      previous_outstanding_debt: customerOutstanding,
      credit_limit: customerLimit,
      available_credit: Math.max(0, customerLimit - customerOutstanding),
      payment_amount: '',
    });
    onCustomerSearch?.('');
  };

  return (
    <div className={`min-w-0 rounded-xl border bg-white p-3 ${saleExceedsLimit || paymentExceedsDebt ? 'border-red-300' : 'border-slate-200'}`} data-testid="customer-credit-sales-source">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><UserCheck className="h-4 w-4" /></div>
          <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-950">Customer Credit</div><div className="text-[11px] text-slate-500">Receivable transaction</div></div>
        </div>
        {!disabled && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-600" onClick={() => onRemove(entry.id)} aria-label={`Remove customer credit transaction ${idx + 1}`}><Trash2 className="h-4 w-4" /></Button>}
      </div>

      <div className="mt-3 space-y-2">
        <Label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Customer</Label>
        <Input value={selectedCustomer ? customerName : customerSearch} onChange={(event) => {
          if (selectedCustomer) {
            onCustomerSearch?.(event.target.value);
            onUpdate(entry.id, { customer_id: '', customer_name_snapshot: '', customer_phone: '' });
          } else onCustomerSearch?.(event.target.value);
        }} placeholder="Search customer, phone or ID..." className="h-11 w-full text-base" autoComplete="off" inputMode="search" disabled={disabled} aria-label={`Search customer for transaction ${idx + 1}`} />
        {matches.length > 0 && !selectedCustomer && <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {matches.map((customer) => <button key={customer.id} type="button" className="flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50" onClick={() => selectCustomer(customer)}>
            <UserCheck className="h-4 w-4 shrink-0 text-slate-400" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{customer.customer_name || customer.name}</span><span className="block truncate text-xs text-slate-500" dir="ltr">{customer.phone || customer.customer_code || '—'}</span></span>
          </button>)}
        </div>}
        {selectedCustomer && <div className="flex min-w-0 items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-blue-700"><UserCheck className="h-4 w-4" /></div><div className="min-w-0"><div className="truncate text-sm font-bold text-slate-950">{customerName}</div><div className="truncate text-xs text-slate-500" dir="ltr">{customerIdentifier || '—'}</div></div></div>}
      </div>

      {selectedCustomer && <>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"><Metric label="Outstanding" value={outstanding} currency={currency} tone="text-red-700"/><Metric label="Credit Limit" value={creditLimit} currency={currency} tone="text-blue-700"/><div className="col-span-2 sm:col-span-1"><Metric label="Available" value={available} currency={currency} tone="text-emerald-700"/></div></div>
        <div className="mt-3 grid min-w-0 gap-2 lg:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-3"><div className="mb-2 flex items-center gap-2"><Plus className="h-4 w-4 shrink-0 text-blue-700"/><div><div className="text-sm font-bold text-slate-900">Credit Sale</div><div className="text-[10px] text-slate-500">Creates a receivable. No cash.</div></div></div><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400" dir="ltr">{currency}</span><Input value={entry.amount ?? ''} onChange={(event)=>onUpdate(entry.id,'amount',event.target.value)} className="h-11 pl-14 text-base tabular-nums" inputMode="decimal" type="text" placeholder="0.00" disabled={disabled} aria-label="Credit sale amount"/></div>{saleExceedsLimit&&<div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-red-700"><AlertTriangle className="h-3.5 w-3.5"/>Amount exceeds available credit.</div>}</div>
          <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-3"><div className="mb-2 flex items-center gap-2"><Minus className="h-4 w-4 shrink-0 text-emerald-700"/><div><div className="text-sm font-bold text-slate-900">Debt Payment</div><div className="text-[10px] text-slate-500">Reduces receivable. No sales revenue.</div></div></div><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400" dir="ltr">{currency}</span><Input value={entry.payment_amount ?? ''} onChange={(event)=>onUpdate(entry.id,'payment_amount',event.target.value)} className="h-11 pl-14 text-base tabular-nums" inputMode="decimal" type="text" placeholder="0.00" disabled={disabled || outstanding <= 0 || isRecordingPayment} aria-label="Debt payment amount"/></div>{paymentExceedsDebt&&<div className="mt-2 text-[10px] font-semibold text-red-700">Payment cannot exceed the receivable.</div>}</div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"><div className="min-w-0"><Label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Payment Method</Label><Select value={entry.payment_method||'cash'} onValueChange={(value)=>onUpdate(entry.id,'payment_method',value)} disabled={disabled||payment<=0||outstanding<=0||isRecordingPayment}><SelectTrigger className="h-11 w-full text-base"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="bank_transfer">Bank Transfer</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="wallet">Wallet</SelectItem></SelectContent></Select></div><Button type="button" variant="outline" className="h-11 w-full sm:w-auto" onClick={()=>onRecordPayment?.(entry)} disabled={disabled||isRecordingPayment||payment<=0||paymentExceedsDebt}><Minus className="mr-1.5 h-4 w-4"/>{isRecordingPayment?'Recording…':'Record Payment'}</Button></div>
        {(creditSale > 0 || payment > 0) && <div className="mt-3 border-t border-slate-200 pt-3"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">After Transaction</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Metric label="Current Debt" value={outstanding} currency={currency}/><Metric label="Credit Sale" value={creditSale} currency={currency} tone="text-blue-700"/><Metric label="Payment" value={payment} currency={currency} tone="text-emerald-700"/><div className="col-span-2 rounded-lg bg-slate-900 px-3 py-2 sm:col-span-1"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">After Transaction</div><div className="mt-0.5 text-base font-extrabold tabular-nums text-white" dir="ltr">{money(currency,after)}</div></div></div></div>}
      </>}
    </div>
  );
}
