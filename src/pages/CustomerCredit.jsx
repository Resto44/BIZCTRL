import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, CalendarDays, CheckCircle2, CreditCard, Database, FileText, History, Plus, Search, Users, WalletCards } from 'lucide-react';
import { format } from 'date-fns';

import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { createCustomerReceivable, customerDebtPaymentErrorMessage, invalidateCustomerReceivableQueries, newReceivableRequestId, recordCustomerDebtPayment } from '@/lib/debt/customerReceivableRepository';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const EMPTY_CREDIT = {
  customerId: '', branchKey: '', amount: '', dueDate: '', invoiceNumber: '', notes: '',
};

const EMPTY_PAYMENT = {
  customerId: '', debtId: '', amount: '', paymentMethod: 'cash', date: format(new Date(), 'yyyy-MM-dd'), notes: '',
};

function money(value, currency) {
  return `${currency}${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function getStatus(debt) {
  const remaining = Number(debt.remaining_amount || 0);
  if (remaining <= 0) return { label: 'Paid', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (debt.due_date && new Date(debt.due_date) < new Date()) return { label: 'Overdue', className: 'bg-red-50 text-red-700 border-red-200' };
  if (Number(debt.paid_amount || 0) > 0) return { label: 'Partial', className: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { label: 'Open', className: 'bg-blue-50 text-blue-700 border-blue-200' };
}

function buildPositions(debts, customers) {
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const positions = new Map();

  debts.forEach((debt) => {
    const key = debt.customer_id || `legacy:${debt.id}`;
    if (!positions.has(key)) {
      const customer = customerMap.get(debt.customer_id);
      positions.set(key, {
        id: debt.customer_id || key,
        name: customer?.name || debt.party_name || 'Unlinked customer',
        phone: customer?.phone || debt.party_phone || '',
        creditLimit: Number(customer?.credit_limit || 0),
        totalDebt: 0,
        paid: 0,
        remaining: 0,
        debts: [],
      });
    }
    const position = positions.get(key);
    position.totalDebt += Number(debt.total_amount || 0);
    position.paid += Number(debt.paid_amount || 0);
    position.remaining += Number(debt.remaining_amount || 0);
    position.debts.push(debt);
  });

  return [...positions.values()].sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name));
}

function ActionCard({ tone, icon: Icon, title, description, action, onClick }) {
  const isRed = tone === 'red';
  return (
    <div className={`rounded-3xl border p-5 sm:p-6 ${isRed ? 'border-red-200 bg-red-50/70' : 'border-emerald-200 bg-emerald-50/70'}`}>
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${isRed ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
          <Icon className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          <Button className={`mt-4 h-11 w-full sm:w-auto ${isRed ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`} onClick={onClick}>
            <Plus className="h-4 w-4" />
            {action}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CustomerCredit() {
  const { currency, lang, dir } = useLanguage();
  const { activeRestaurantId, branches, isManager, managerBranch } = useTenant();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [creditOpen, setCreditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [creditForm, setCreditForm] = useState(EMPTY_CREDIT);
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT);
  const [saving, setSaving] = useState(false);

  const branchList = branches || [];
  const initialBranch = managerBranch || branchList[0]?.key || '';

  const { data: customers = [], isLoading: loadingCustomers } = useQuery({
    queryKey: ['customer-credit-master', activeRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id,name,phone,credit_limit,branch,branch_id,is_active')
        .eq('restaurant_id', activeRestaurantId)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeRestaurantId,
    staleTime: 60000,
  });

  const { data: debts = [], isLoading: loadingDebts } = useQuery({
    queryKey: ['customer-credit-debts', activeRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debt_records')
        .select('id,customer_id,party_name,party_phone,branch,branch_id,date,due_date,invoice_number,invoice_auto_number,total_amount,paid_amount,remaining_amount,status,description,notes')
        .eq('restaurant_id', activeRestaurantId)
        .eq('party_type', 'customer')
        .eq('type', 'receivable')
        .order('date', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeRestaurantId,
    staleTime: 30000,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['customer-credit-payments', activeRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('debt_payments')
        .select('id,customer_id,debt_id,amount,date,payment_method,receipt_number,party_name')
        .eq('restaurant_id', activeRestaurantId)
        .order('date', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeRestaurantId,
    staleTime: 30000,
  });

  const positions = useMemo(() => buildPositions(debts, customers), [debts, customers]);
  const filteredPositions = useMemo(() => positions.filter((position) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!position.name.toLowerCase().includes(q) && !position.phone.toLowerCase().includes(q)) return false;
    }
    if (branchFilter !== 'all') {
      const customer = customers.find((item) => item.id === position.id);
      if ((customer?.branch_id || customer?.branch) !== branchFilter) {
        const hasDebt = position.debts.some((debt) => debt.branch_id === branchFilter || debt.branch === branchFilter);
        if (!hasDebt) return false;
      }
    }
    return true;
  }), [positions, search, branchFilter, customers]);

  const totalReceivable = positions.reduce((sum, item) => sum + item.remaining, 0);
  const totalCustomers = positions.length;
  const totalOpen = positions.filter((item) => item.remaining > 0).length;

  const paymentCustomers = positions.filter((item) => item.id && item.remaining > 0);
  const selectedPaymentCustomer = paymentCustomers.find((item) => item.id === paymentForm.customerId);
  const paymentDebts = selectedPaymentCustomer?.debts.filter((debt) => Number(debt.remaining_amount || 0) > 0) || [];

  const resetCredit = () => setCreditForm({ ...EMPTY_CREDIT, branchKey: initialBranch });
  const resetPayment = () => setPaymentForm(EMPTY_PAYMENT);

  const handleCreateCredit = async () => {
    const customer = customers.find((item) => item.id === creditForm.customerId);
    const branch = branchList.find((item) => item.key === creditForm.branchKey);
    if (!customer || !branch || Number(creditForm.amount) <= 0) return;

    const position = positions.find((item) => item.id === customer.id);
    const outstanding = Number(position?.remaining || 0);
    const available = Math.max(Number(customer.credit_limit || 0) - outstanding, 0);
    if (Number(creditForm.amount) > available && Number(customer.credit_limit || 0) > 0) {
      window.alert(`Credit limit exceeded. Available credit: ${money(available, currency)}`);
      return;
    }

    try {
      setSaving(true);
      await createCustomerReceivable({
        customerId: customer.id,
        branchId: branch.id,
        branch: branch.key,
        totalAmount: Number(creditForm.amount),
        paidAmount: 0,
        date: format(new Date(), 'yyyy-MM-dd'),
        dueDate: creditForm.dueDate || null,
        invoiceNumber: creditForm.invoiceNumber || null,
        description: 'Customer credit sale',
        notes: creditForm.notes || null,
        requestId: newReceivableRequestId(),
      });
      invalidateCustomerReceivableQueries(qc);
      setCreditOpen(false);
      resetCredit();
    } catch (error) {
      window.alert(customerDebtPaymentErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!paymentForm.debtId || Number(paymentForm.amount) <= 0) return;
    try {
      setSaving(true);
      await recordCustomerDebtPayment({
        debtId: paymentForm.debtId,
        amount: Number(paymentForm.amount),
        date: paymentForm.date,
        paymentMethod: paymentForm.paymentMethod,
        notes: paymentForm.notes || null,
        requestId: newReceivableRequestId(),
      });
      invalidateCustomerReceivableQueries(qc);
      setPaymentOpen(false);
      resetPayment();
    } catch (error) {
      window.alert(customerDebtPaymentErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const openCredit = () => {
    resetCredit();
    setCreditOpen(true);
  };

  const openPayment = () => {
    resetPayment();
    setPaymentOpen(true);
  };

  const recentPayments = payments.slice(0, 5);

  return (
    <div dir={dir} className="w-full px-3 py-4 sm:px-5 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5 pb-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
                <Database className="h-4 w-4" />
                Debts & Receivables
              </div>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Customer Credit — Unified From Debts & Receivables</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">Customer identity and credit limit come from Customer Master. All receivable balances, debt payments, and settlement history come from Debts & Receivables.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
              <div className="rounded-2xl bg-slate-50 p-3"><div className="text-[11px] text-slate-500">Customers</div><div className="mt-1 text-xl font-bold text-slate-900">{totalCustomers}</div></div>
              <div className="rounded-2xl bg-blue-50 p-3"><div className="text-[11px] text-blue-600">Open Accounts</div><div className="mt-1 text-xl font-bold text-blue-800">{totalOpen}</div></div>
              <div className="rounded-2xl bg-emerald-50 p-3"><div className="text-[11px] text-emerald-600">Receivable</div><div className="mt-1 text-lg font-bold text-emerald-800">{money(totalReceivable, currency)}</div></div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <ActionCard
            tone="red"
            icon={ArrowDownCircle}
            title="Customer Takes Credit (Debt)"
            description="Creates one canonical customer receivable in Debts & Receivables. It never reads or writes a balance from Customer Management."
            action="Create Credit"
            onClick={openCredit}
          />
          <ActionCard
            tone="green"
            icon={ArrowUpCircle}
            title="Customer Makes Payment"
            description="Records settlement against an existing customer receivable and updates the same debt ledger."
            action="Record Payment"
            onClick={openPayment}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Debts & Receivables (Single Source)</h2>
                <p className="mt-1 text-sm text-slate-500">This list is calculated from customer receivable records, not Customer Management balance fields.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer or phone" className="h-10 pl-9" /></div>
                {branchList.length > 1 && !isManager && (
                  <Select value={branchFilter} onValueChange={setBranchFilter}>
                    <SelectTrigger className="h-10 sm:w-48"><SelectValue placeholder="Branch" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All branches</SelectItem>
                      {branchList.map((branch) => <SelectItem key={branch.id || branch.key} value={branch.id || branch.key}>{branch.label || branch.name || branch.key}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-3 font-semibold">Customer</th><th className="px-5 py-3 font-semibold">Total Debt</th><th className="px-5 py-3 font-semibold">Paid</th><th className="px-5 py-3 font-semibold">Remaining</th><th className="px-5 py-3 font-semibold">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPositions.map((position) => {
                  const representative = position.debts[0];
                  const status = representative ? getStatus(position.debts.some((debt) => Number(debt.remaining_amount || 0) > 0) ? position.debts.find((debt) => Number(debt.remaining_amount || 0) > 0) : representative) : { label: 'No Due', className: 'bg-slate-50 text-slate-600 border-slate-200' };
                  return (
                    <tr key={position.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"><Users className="h-4 w-4" /></div><div><div className="font-semibold text-slate-900">{position.name}</div><div className="text-xs text-slate-500">{position.phone || 'No phone'}</div></div></div></td>
                      <td className="px-5 py-4 font-semibold text-slate-800">{money(position.totalDebt, currency)}</td>
                      <td className="px-5 py-4 font-semibold text-emerald-700">{money(position.paid, currency)}</td>
                      <td className="px-5 py-4 font-bold text-emerald-700">{money(position.remaining, currency)}</td>
                      <td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredPositions.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No customer receivables found.</div>}
          </div>

          <div className="divide-y divide-slate-100 md:hidden">
            {filteredPositions.map((position) => (
              <div key={position.id} className="p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-slate-900">{position.name}</div><div className="text-xs text-slate-500">{position.phone || 'No phone'}</div></div><div className="text-right"><div className="text-xs text-slate-500">Remaining</div><div className="font-bold text-emerald-700">{money(position.remaining, currency)}</div></div></div>
                <div className="mt-3 grid grid-cols-3 gap-2"><div className="rounded-xl bg-slate-50 p-2"><div className="text-[10px] text-slate-500">Total</div><div className="mt-1 text-sm font-semibold">{money(position.totalDebt, currency)}</div></div><div className="rounded-xl bg-emerald-50 p-2"><div className="text-[10px] text-emerald-600">Paid</div><div className="mt-1 text-sm font-semibold text-emerald-700">{money(position.paid, currency)}</div></div><div className="rounded-xl bg-blue-50 p-2"><div className="text-[10px] text-blue-600">Limit</div><div className="mt-1 text-sm font-semibold text-blue-700">{position.creditLimit ? money(position.creditLimit, currency) : '—'}</div></div></div>
              </div>
            ))}
            {filteredPositions.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No customer receivables found.</div>}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-5">
            <div className="flex items-start gap-3"><div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm"><Database className="h-4 w-4" /></div><div><h3 className="font-bold text-slate-900">Single source of truth</h3><p className="mt-1 text-sm leading-6 text-slate-600">Credit sales create receivables. Payments settle those receivables. Customer Master is used for identity and credit limit only.</p></div></div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><History className="h-4 w-4 text-slate-500" /><h3 className="font-bold text-slate-900">Recent payments</h3></div><div className="mt-3 space-y-2">{recentPayments.length ? recentPayments.map((payment) => <div key={payment.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2"><div className="min-w-0"><div className="truncate text-sm font-medium text-slate-900">{payment.party_name || 'Customer payment'}</div><div className="text-xs text-slate-500">{payment.date || '—'} · {payment.payment_method || 'cash'}</div></div><div className="shrink-0 text-sm font-bold text-emerald-700">{money(payment.amount, currency)}</div></div>) : <div className="py-5 text-center text-sm text-slate-500">No payments yet.</div>}</div></div>
        </section>
      </div>

      <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Customer Takes Credit</DialogTitle><DialogDescription>Create a receivable in Debts & Receivables.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Customer</Label><Select value={creditForm.customerId} onValueChange={(value) => setCreditForm((form) => ({ ...form, customerId: value }))}><SelectTrigger className="mt-1 h-11"><SelectValue placeholder={loadingCustomers ? 'Loading customers...' : 'Select customer'} /></SelectTrigger><SelectContent>{customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Branch</Label><Select value={creditForm.branchKey} onValueChange={(value) => setCreditForm((form) => ({ ...form, branchKey: value }))}><SelectTrigger className="mt-1 h-11"><SelectValue placeholder="Select branch" /></SelectTrigger><SelectContent>{branchList.map((branch) => <SelectItem key={branch.key} value={branch.key}>{branch.label || branch.name || branch.key}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-4 sm:grid-cols-2"><div><Label>Credit Amount</Label><Input inputMode="decimal" type="number" min="0" value={creditForm.amount} onChange={(e) => setCreditForm((form) => ({ ...form, amount: e.target.value }))} className="mt-1 h-11" placeholder="0" /></div><div><Label>Due Date</Label><Input type="date" value={creditForm.dueDate} onChange={(e) => setCreditForm((form) => ({ ...form, dueDate: e.target.value }))} className="mt-1 h-11" /></div></div>
            <div><Label>Invoice Number</Label><Input value={creditForm.invoiceNumber} onChange={(e) => setCreditForm((form) => ({ ...form, invoiceNumber: e.target.value }))} className="mt-1 h-11" placeholder="Optional" /></div>
            <div><Label>Notes</Label><Textarea value={creditForm.notes} onChange={(e) => setCreditForm((form) => ({ ...form, notes: e.target.value }))} className="mt-1" placeholder="Optional note" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreditOpen(false)}>Cancel</Button><Button disabled={saving || !creditForm.customerId || !creditForm.branchKey || Number(creditForm.amount) <= 0} onClick={handleCreateCredit}>{saving ? 'Saving...' : 'Create Receivable'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Customer Makes Payment</DialogTitle><DialogDescription>Apply a payment to an existing Debts & Receivables record.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Customer</Label><Select value={paymentForm.customerId} onValueChange={(value) => setPaymentForm((form) => ({ ...form, customerId: value, debtId: '', amount: '' }))}><SelectTrigger className="mt-1 h-11"><SelectValue placeholder="Select customer with an outstanding debt" /></SelectTrigger><SelectContent>{paymentCustomers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.name} · Due {money(customer.remaining, currency)}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Receivable</Label><Select value={paymentForm.debtId} onValueChange={(value) => { const debt = paymentDebts.find((item) => item.id === value); setPaymentForm((form) => ({ ...form, debtId: value, amount: debt ? String(debt.remaining_amount) : '' })); }}><SelectTrigger className="mt-1 h-11"><SelectValue placeholder={paymentForm.customerId ? 'Select receivable' : 'Select customer first'} /></SelectTrigger><SelectContent>{paymentDebts.map((debt) => <SelectItem key={debt.id} value={debt.id}>{debt.invoice_number || debt.invoice_auto_number || debt.id.slice(0, 8)} · Remaining {money(debt.remaining_amount, currency)}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-4 sm:grid-cols-2"><div><Label>Payment Amount</Label><Input inputMode="decimal" type="number" min="0" value={paymentForm.amount} onChange={(e) => setPaymentForm((form) => ({ ...form, amount: e.target.value }))} className="mt-1 h-11" /></div><div><Label>Date</Label><Input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm((form) => ({ ...form, date: e.target.value }))} className="mt-1 h-11" /></div></div>
            <div><Label>Payment Method</Label><Select value={paymentForm.paymentMethod} onValueChange={(value) => setPaymentForm((form) => ({ ...form, paymentMethod: value }))}><SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="network">Network</SelectItem><SelectItem value="bank_transfer">Bank Transfer</SelectItem><SelectItem value="cheque">Cheque</SelectItem></SelectContent></Select></div>
            <div><Label>Notes</Label><Textarea value={paymentForm.notes} onChange={(e) => setPaymentForm((form) => ({ ...form, notes: e.target.value }))} className="mt-1" placeholder="Optional note" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button><Button disabled={saving || !paymentForm.debtId || Number(paymentForm.amount) <= 0} onClick={handleRecordPayment}><WalletCards className="h-4 w-4" />{saving ? 'Saving...' : 'Record Payment'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
