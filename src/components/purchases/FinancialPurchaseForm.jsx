/**
 * FinancialPurchaseForm — ERP-style purchase entry with supplier, invoice,
 * total purchase, paid amount, and auto-calculated remaining balance.
 * Creates a SupplierInvoice record for payable tracking.
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Truck, Receipt, AlertCircle, CheckCircle2 } from 'lucide-react';
import BranchSelect from '@/components/shared/BranchSelect';

const LABELS = {
  en: {
    title: 'New Purchase',
    supplier: 'Supplier',
    invoice_number: 'Invoice Number (optional)',
    date: 'Date',
    branch: 'Branch',
    total_purchase: 'Total Purchase',
    paid_amount: 'Paid Amount',
    remaining: 'Remaining (auto)',
    notes: 'Notes',
    save: 'Save',
    cancel: 'Cancel',
    select_supplier: 'Select supplier...',
    no_supplier: 'No suppliers found',
    status_paid: 'Fully Paid',
    status_partial: 'Partial',
    status_unpaid: 'Unpaid',
    add_supplier: 'Add Supplier',
  },
  ar: {
    title: 'شراء جديد',
    supplier: 'المورد',
    invoice_number: 'رقم الفاتورة (اختياري)',
    date: 'التاريخ',
    branch: 'الفرع',
    total_purchase: 'إجمالي الشراء',
    paid_amount: 'المبلغ المدفوع',
    remaining: 'المتبقي (تلقائي)',
    notes: 'ملاحظات',
    save: 'حفظ',
    cancel: 'إلغاء',
    select_supplier: 'اختر المورد...',
    no_supplier: 'لا يوجد موردون',
    status_paid: 'مدفوع بالكامل',
    status_partial: 'جزئي',
    status_unpaid: 'غير مدفوع',
    add_supplier: 'إضافة مورد',
  },
  fa: {
    title: 'خرید جدید',
    supplier: 'تامین‌کننده',
    invoice_number: 'شماره فاکتور (اختیاری)',
    date: 'تاریخ',
    branch: 'فرع',
    total_purchase: 'جمع خرید',
    paid_amount: 'مبلغ پرداختی',
    remaining: 'باقی‌مانده (خودکار)',
    notes: 'یادداشت',
    save: 'ذخیره',
    cancel: 'لغو',
    select_supplier: 'تامین‌کننده را انتخاب کنید...',
    no_supplier: 'تامین‌کننده‌ای یافت نشد',
    status_paid: 'کاملاً پرداخت شده',
    status_partial: 'جزئی',
    status_unpaid: 'پرداخت نشده',
    add_supplier: 'افزودن تامین‌کننده',
  },
};

const emptyForm = {
  supplier_id: '',
  supplier_name: '',
  invoice_number: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  branch: '',
  total_amount: '',
  paid_amount: '',
  notes: '',
};

export default function FinancialPurchaseForm({ initial, onSuccess, onCancel }) {
  const { language, currency } = useLanguage();
  const lbl = LABELS[language] || LABELS.en;
  const qc = useQueryClient();
  const { ownerFilter, managerBranch, branches, activeRestaurantId } = useTenant();

  const [form, setForm] = useState({
    ...emptyForm,
    branch: initial?.branch || managerBranch || branches[0]?.key || '',
    ...initial,
  });
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list('name', 500),
    staleTime: 60000,
  });

  const total = Number(form.total_amount) || 0;
  const paid = Number(form.paid_amount) || 0;
  const remaining = Math.max(0, total - paid);
  const status = remaining <= 0 && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

  const handleSupplierSelect = (supplierId) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    set('supplier_id', supplierId);
    set('supplier_name', supplier?.name || '');
  };

  const saveMut = useMutation({
    mutationFn: async (data) => {
      // Sanitize UUID: never send empty string to supplier_id UUID column
      const supplierId = data.supplier_id && data.supplier_id.trim() !== '' ? data.supplier_id : null;

      // Resolve branch_id UUID from branch key string for RLS scope
      const selectedBranch = branches.find(b => b.key === data.branch || b.branch_key === data.branch);
      const branchId = selectedBranch?.id || null;
      const invoiceData = {
        ...(supplierId ? { supplier_id: supplierId } : {}),
        supplier_name: data.supplier_name,
        invoice_number: data.invoice_number,
        date: data.date,
        branch: data.branch,
        amount: total,
        paid_amount: paid,
        status,
        notes: data.notes,
        ...(ownerFilter || {}),
        // RLS required scope fields — always override ownerFilter to ensure UUID values
        restaurant_id: activeRestaurantId || null,
        branch_id: branchId,
      };
      const invoice = await base44.entities.SupplierInvoice.create(invoiceData);
      return invoice;
    },
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ['supplier_invoices'] });
      qc.invalidateQueries({ queryKey: ['purchases'] });
      if (onSuccess) onSuccess(invoice);
      setForm({ ...emptyForm, branch: managerBranch || branches[0]?.key || '' });
      setError('');
    },
    onError: (err) => setError(err.message || 'Failed to save purchase'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.supplier_id && !form.supplier_name) { setError('Supplier is required'); return; }
    if (!total || total <= 0) { setError('Total purchase amount is required'); return; }
    setError('');
    saveMut.mutate(form);
  };

  const statusConfig = {
    paid: { label: lbl.status_paid, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    partial: { label: lbl.status_partial, cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    unpaid: { label: lbl.status_unpaid, cls: 'bg-red-100 text-red-700 border-red-200' },
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5" />{error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">{lbl.date}</Label>
          <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="h-10" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">{lbl.branch}</Label>
          <BranchSelect value={form.branch} onChange={v => set('branch', v)} />
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">{lbl.supplier}</Label>
        <Select value={form.supplier_id} onValueChange={handleSupplierSelect}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder={lbl.select_supplier} />
          </SelectTrigger>
          <SelectContent>
            {suppliers.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">{lbl.no_supplier}</div>
            )}
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
          <Input
            value={form.supplier_name}
            onChange={e => set('supplier_name', e.target.value)}
            placeholder="Or type supplier name..."
            className="h-9 mt-1.5 text-sm"
          />
        )}
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">{lbl.invoice_number}</Label>
        <Input value={form.invoice_number} onChange={e => set('invoice_number', e.target.value)} placeholder="e.g. INV-1001" className="h-10" />
      </div>

      {/* Financial amounts */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 bg-secondary/60">
          <Receipt className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Purchase Amounts</span>
          {total > 0 && (
            <Badge className={`ms-auto text-[10px] border ${statusConfig[status].cls}`}>
              {statusConfig[status].label}
            </Badge>
          )}
        </div>
        <div className="p-3 space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">{lbl.total_purchase}</Label>
            <Input
              type="number" inputMode="decimal" step="0.01" min="0"
              value={form.total_amount}
              onChange={e => set('total_amount', e.target.value)}
              placeholder="0"
              className="h-12 text-xl font-bold text-center"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{lbl.paid_amount}</Label>
            <Input
              type="number" inputMode="decimal" step="0.01" min="0"
              value={form.paid_amount}
              onChange={e => set('paid_amount', e.target.value)}
              placeholder="0"
              className="h-10"
            />
          </div>
          {total > 0 && (
            <div className={`flex justify-between items-center rounded-lg px-3 py-2.5 ${remaining > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
              <span className={`text-xs font-medium ${remaining > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                {lbl.remaining}
              </span>
              <div className="flex items-center gap-2">
                {remaining <= 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                )}
                <span className={`text-lg font-bold ${remaining > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {currency}{remaining.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">{lbl.notes}</Label>
        <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="..." className="h-10" />
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1 h-11 font-bold" disabled={saveMut.isPending}>
          {saveMut.isPending ? '...' : lbl.save}
        </Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} className="flex-1 h-11">{lbl.cancel}</Button>}
      </div>
    </form>
  );
}
