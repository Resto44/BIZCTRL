/**
 * SupplierPaymentForm — Separate section for paying supplier invoices.
 * Supplier payments reduce supplier payable balances.
 * They are NOT included in sales totals.
 */
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { Truck, CreditCard, Plus, AlertCircle } from 'lucide-react';

const LABELS = {
  en: {
    title: 'Supplier Payments',
    add_payment: 'Supplier Payment',
    supplier: 'Supplier',
    amount: 'Amount',
    date: 'Date',
    notes: 'Notes',
    save: 'Save',
    cancel: 'Cancel',
    select_supplier: 'Select supplier...',
    payment_method: 'Payment Method',
    cash: 'Cash',
    network: 'Network',
    bank_transfer: 'Bank Transfer',
    cheque: 'Cheque',
    payments_today: 'Supplier Payments Today',
    no_payments: 'No supplier payments today',
    supplier_balance: 'Supplier Payable Balance',
    total_payable: 'Total Payable',
  },
  ar: {
    title: 'مدفوعات الموردين',
    add_payment: 'دفعة مورد',
    supplier: 'المورد',
    amount: 'المبلغ',
    date: 'التاريخ',
    notes: 'ملاحظات',
    save: 'حفظ',
    cancel: 'إلغاء',
    select_supplier: 'اختر المورد...',
    payment_method: 'طريقة الدفع',
    cash: 'نقد',
    network: 'شبكة',
    bank_transfer: 'تحويل بنكي',
    cheque: 'شيك',
    payments_today: 'مدفوعات الموردين اليوم',
    no_payments: 'لا توجد مدفوعات للموردين اليوم',
    supplier_balance: 'رصيد المستحق للموردين',
    total_payable: 'إجمالي المستحق',
  },
  fa: {
    title: 'پرداخت‌های تامین‌کننده',
    add_payment: 'پرداخت تامین‌کننده',
    supplier: 'تامین‌کننده',
    amount: 'مبلغ',
    date: 'تاریخ',
    notes: 'یادداشت',
    save: 'ذخیره',
    cancel: 'لغو',
    select_supplier: 'تامین‌کننده را انتخاب کنید...',
    payment_method: 'روش پرداخت',
    cash: 'نقد',
    network: 'شبکه',
    bank_transfer: 'انتقال بانکی',
    cheque: 'چک',
    payments_today: 'پرداخت‌های تامین‌کننده امروز',
    no_payments: 'پرداختی برای تامین‌کننده امروز ندارد',
    supplier_balance: 'موجودی قابل پرداخت تامین‌کننده',
    total_payable: 'جمع قابل پرداخت',
  },
};

const emptyForm = {
  supplier_id: '',
  supplier_name: '',
  amount: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  notes: '',
  payment_method: 'cash',
};

export default function SupplierPaymentForm({ date: defaultDate, branch: defaultBranch }) {
  const { language, currency } = useLanguage();
  const lbl = LABELS[language] || LABELS.en;
  const qc = useQueryClient();
  const { ownerFilter } = useTenant();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, date: defaultDate || format(new Date(), 'yyyy-MM-dd') });
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list('name', 500),
    staleTime: 60000,
  });

  // Load all unpaid/partial invoices for payable balance
  const { data: invoices = [] } = useQuery({
    queryKey: ['supplier_invoices', ownerFilter],
    queryFn: () => base44.entities.SupplierInvoice.filter(ownerFilter || {}, '-date', 500),
    enabled: !!(ownerFilter?.created_by || ownerFilter?.branch),
    staleTime: 30000,
  });

  // Today's payments (from WalletTransaction or we track via notes)
  // We'll track payments as SupplierInvoice updates; show today's paid amounts
  const todayStr = defaultDate || format(new Date(), 'yyyy-MM-dd');
  const paymentsToday = useMemo(() =>
    invoices.filter(inv => inv.last_payment_date === todayStr && (inv.paid_amount || 0) > 0),
    [invoices, todayStr]
  );

  const totalPayable = useMemo(() =>
    invoices
      .filter(inv => inv.status !== 'paid')
      .reduce((s, inv) => s + Math.max(0, (inv.amount || 0) - (inv.paid_amount || 0)), 0),
    [invoices]
  );

  const handleSupplierSelect = (supplierId) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    set('supplier_id', supplierId);
    set('supplier_name', supplier?.name || '');
  };

  const saveMut = useMutation({
    mutationFn: async (data) => {
      const amount = Number(data.amount);
      if (!amount || amount <= 0) throw new Error('Amount must be greater than 0');

      // Sanitize UUID: never send empty string to supplier_id UUID column
      const supplierId = data.supplier_id && data.supplier_id.trim() !== '' ? data.supplier_id : null;

      // Find the oldest unpaid invoice for this supplier and apply payment
      const supplierInvoices = invoices
        .filter(inv => supplierId && inv.supplier_id === supplierId && inv.status !== 'paid')
        .sort((a, b) => a.date.localeCompare(b.date));

      let remaining = amount;
      const updates = [];

      for (const inv of supplierInvoices) {
        if (remaining <= 0) break;
        const invRemaining = (inv.amount || 0) - (inv.paid_amount || 0);
        const applyAmount = Math.min(remaining, invRemaining);
        const newPaid = (inv.paid_amount || 0) + applyAmount;
        const newRemaining = (inv.amount || 0) - newPaid;
        const newStatus = newRemaining <= 0 ? 'paid' : 'partial';
        updates.push(base44.entities.SupplierInvoice.update(inv.id, {
          paid_amount: newPaid,
          status: newStatus,
          last_payment_date: data.date,
          last_payment_notes: data.notes,
        }));
        remaining -= applyAmount;
      }

      // If no invoices found or excess, create a credit note / general payment record
      if (updates.length === 0 || remaining > 0) {
        // Create a general payment record as a new invoice with negative or zero balance
        const generalPayload = {
          supplier_name: data.supplier_name,
          invoice_number: `PAY-${data.date}`,
          date: data.date,
          amount: amount,
          paid_amount: amount,
          status: 'paid',
          notes: `Payment: ${data.notes || ''}`,
          last_payment_date: data.date,
          ...(ownerFilter || {}),
        };
        // Only include supplier_id when it is a real UUID
        if (supplierId) generalPayload.supplier_id = supplierId;
        updates.push(base44.entities.SupplierInvoice.create(generalPayload));
      }

      await Promise.all(updates);
      return { amount, supplier_name: data.supplier_name };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier_invoices'] });
      setShowForm(false);
      setForm({ ...emptyForm, date: defaultDate || format(new Date(), 'yyyy-MM-dd') });
      setError('');
    },
    onError: (err) => setError(err.message || 'Failed to save payment'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.supplier_id && !form.supplier_name) { setError('Supplier is required'); return; }
    if (!form.amount || Number(form.amount) <= 0) { setError('Amount must be greater than 0'); return; }
    setError('');
    saveMut.mutate(form);
  };

  return (
    <div className="rounded-xl border border-orange-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-orange-50">
        <Truck className="w-4 h-4 text-orange-600" />
        <span className="text-sm font-semibold text-orange-800">{lbl.title}</span>
        <span className="ms-auto text-xs font-bold text-orange-700">{lbl.total_payable}: {currency}{totalPayable.toLocaleString()}</span>
      </div>

      <div className="p-3 space-y-2">
        {/* Payable summary by supplier */}
        {invoices.filter(inv => inv.status !== 'paid').length > 0 && (
          <div className="space-y-1">
            {Object.entries(
              invoices
                .filter(inv => inv.status !== 'paid')
                .reduce((acc, inv) => {
                  const key = inv.supplier_name || inv.supplier_id || 'Unknown';
                  acc[key] = (acc[key] || 0) + Math.max(0, (inv.amount || 0) - (inv.paid_amount || 0));
                  return acc;
                }, {})
            ).slice(0, 3).map(([name, balance]) => (
              <div key={name} className="flex items-center gap-2 bg-orange-50/60 rounded-lg px-3 py-1.5">
                <Truck className="w-3 h-3 text-orange-500 shrink-0" />
                <span className="text-xs flex-1">{name}</span>
                <span className="text-xs font-bold text-orange-700">{currency}{balance.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        <Button type="button" variant="outline" size="sm" className="w-full border-orange-300 text-orange-700 hover:bg-orange-50" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />{lbl.add_payment}
        </Button>
      </div>

      {/* Payment Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-orange-600" />
              {lbl.add_payment}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5" />{error}
              </div>
            )}

            <div>
              <Label className="text-xs text-muted-foreground">{lbl.supplier}</Label>
              <Select value={form.supplier_id} onValueChange={handleSupplierSelect}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder={lbl.select_supplier} />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center gap-2">
                        <Truck className="w-3 h-3" />
                        <span>{s.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!form.supplier_id && (
                <Input value={form.supplier_name} onChange={e => set('supplier_name', e.target.value)} placeholder="Or type supplier name..." className="h-9 mt-1.5 text-sm" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">{lbl.amount}</Label>
                <Input type="number" inputMode="decimal" step="0.01" min="0" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0" className="h-10" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{lbl.date}</Label>
                <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="h-10" />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">{lbl.payment_method}</Label>
              <Select value={form.payment_method} onValueChange={v => set('payment_method', v)}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{lbl.cash}</SelectItem>
                  <SelectItem value="network">{lbl.network}</SelectItem>
                  <SelectItem value="bank_transfer">{lbl.bank_transfer}</SelectItem>
                  <SelectItem value="cheque">{lbl.cheque}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">{lbl.notes}</Label>
              <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="..." className="h-10" />
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="flex-1 h-11 font-bold" disabled={saveMut.isPending}>
                {saveMut.isPending ? '...' : lbl.save}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1 h-11">{lbl.cancel}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
