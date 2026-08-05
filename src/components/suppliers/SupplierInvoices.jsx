import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Plus, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { format } from 'date-fns';

const ui = {
  en: { invoices: 'Invoices', add_invoice: 'Add Invoice', invoice_no: 'Invoice #', date: 'Date', due_date: 'Due Date', amount: 'Amount', paid: 'Paid', status: 'Status', notes: 'Notes', save: 'Save', cancel: 'Cancel', total_owed: 'Total Owed', mark_paid: 'Mark Paid', branch: 'Branch' },
  ar: { invoices: 'الفواتير', add_invoice: 'إضافة فاتورة', invoice_no: 'رقم الفاتورة', date: 'التاريخ', due_date: 'تاريخ الاستحقاق', amount: 'المبلغ', paid: 'المدفوع', status: 'الحالة', notes: 'ملاحظات', save: 'حفظ', cancel: 'إلغاء', total_owed: 'إجمالي المستحق', mark_paid: 'تسجيل دفع', branch: 'الفرع' },
  fa: { invoices: 'فاکتورها', add_invoice: 'افزودن فاکتور', invoice_no: 'شماره فاکتور', date: 'تاریخ', due_date: 'موعد پرداخت', amount: 'مبلغ', paid: 'پرداخت شده', status: 'وضعیت', notes: 'یادداشت', save: 'ذخیره', cancel: 'لغو', total_owed: 'جمع بدهی', mark_paid: 'ثبت پرداخت', branch: 'فرع' },
};

const statusIcon = { paid: CheckCircle2, partial: Clock, unpaid: AlertCircle };
const statusColor = { paid: 'text-emerald-500', partial: 'text-amber-500', unpaid: 'text-red-500' };

const emptyForm = { invoice_number: '', date: format(new Date(), 'yyyy-MM-dd'), due_date: '', amount: '', paid_amount: 0, status: 'unpaid', notes: '', branch: '' };

export default function SupplierInvoices({ supplier, onBack, embedded = false }) {
  const { lang, currency } = useLanguage();
  const { branches, activeRestaurantId } = useTenant();
  const m = ui[lang] || ui.en;
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const { data: invoices = [] } = useQuery({
    queryKey: ['supplier_invoices', supplier.id],
    queryFn: () => base44.entities.SupplierInvoice.filter({ supplier_id: supplier.id }),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const selectedBranch = branches.find(b => b.key === data.branch || b.branch_key === data.branch);
      return editing
        ? base44.entities.SupplierInvoice.update(editing.id, data)
        : base44.entities.SupplierInvoice.create({
            ...data,
            supplier_id: supplier.id,
            supplier_name: supplier.name,
            restaurant_id: supplier.restaurant_id || activeRestaurantId,
            branch_id: selectedBranch?.id || null,
            supplier_email: supplier.email || null,
          });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supplier_invoices', supplier.id] }); qc.invalidateQueries({ queryKey: ['all_invoices'] }); setShowForm(false); setEditing(null); },
  });

  const quickPay = async (inv) => {
    await base44.entities.SupplierInvoice.update(inv.id, { paid_amount: inv.amount, status: 'paid' });
    qc.invalidateQueries({ queryKey: ['supplier_invoices', supplier.id] });
    qc.invalidateQueries({ queryKey: ['all_invoices'] });
  };

  const totalOwed = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.amount - (i.paid_amount || 0)), 0);

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm, branch: branches.length === 1 ? branches[0].key : '' }); setShowForm(true); };
  const openEdit = (inv) => { setEditing(inv); setForm({ invoice_number: inv.invoice_number || '', date: inv.date || '', due_date: inv.due_date || '', amount: inv.amount, paid_amount: inv.paid_amount || 0, status: inv.status, notes: inv.notes || '', branch: inv.branch || '' }); setShowForm(true); };

  return (
    <div>
      {!embedded && (
        <div className="flex items-center gap-3 mb-5">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="w-5 h-5" /></Button>
          <h1 className="text-xl font-bold">{supplier.name} — {m.invoices}</h1>
          <Button size="sm" onClick={openAdd} className="ms-auto gap-1"><Plus className="w-4 h-4" />{m.add_invoice}</Button>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end mb-3">
          <Button size="sm" onClick={openAdd} className="gap-1"><Plus className="w-4 h-4" />{m.add_invoice}</Button>
        </div>
      )}

      {totalOwed > 0 && (
        <Card className="p-3 mb-4 bg-red-50 dark:bg-red-950 border-red-200">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">{m.total_owed}: {currency} {totalOwed.toLocaleString()}</p>
        </Card>
      )}

      <div className="space-y-2">
        {invoices.map(inv => {
          const Icon = statusIcon[inv.status] || AlertCircle;
          const color = statusColor[inv.status] || 'text-red-500';
          const isOverdue = inv.due_date && inv.due_date < new Date().toISOString().split('T')[0] && inv.status !== 'paid';
          return (
            <Card key={inv.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${color}`} />
                  <div>
                    <p className="font-medium text-sm">{inv.invoice_number || `#${inv.id.slice(-6)}`}</p>
                    <p className="text-xs text-muted-foreground">
                      {inv.date} {isOverdue && <span className="text-red-500 font-medium">· Overdue</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-end">
                    <p className="font-bold text-sm">{currency} {inv.amount?.toLocaleString()}</p>
                    {inv.paid_amount > 0 && <p className="text-xs text-emerald-600">Paid: {currency} {inv.paid_amount}</p>}
                  </div>
                  {inv.status !== 'paid' && (
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => quickPay(inv)}>{m.mark_paid}</Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => openEdit(inv)}>
                    <span className="text-xs">✏</span>
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
        {invoices.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">{lang === 'ar' ? 'لا توجد فواتير' : lang === 'fa' ? 'فاکتوری وجود ندارد' : 'No invoices yet'}</p>}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? m.invoices : m.add_invoice}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">{m.invoice_no}</Label><Input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} /></div>
              <div><Label className="text-xs">{m.branch}</Label>
                <select className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background" value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}>
                  <option value="">--</option>
                  {branches.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">{m.date}</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div><Label className="text-xs">{m.due_date}</Label><Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">{m.amount}</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} /></div>
              <div><Label className="text-xs">{m.paid}</Label><Input type="number" value={form.paid_amount} onChange={e => {
                const paid = Number(e.target.value);
                const status = paid >= form.amount ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
                setForm(f => ({ ...f, paid_amount: paid, status }));
              }} /></div>
            </div>
            <div><Label className="text-xs">{m.notes}</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>{m.save}</Button>
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>{m.cancel}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}