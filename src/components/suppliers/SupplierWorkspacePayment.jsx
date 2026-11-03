import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { postSupplierPayment } from '@/lib/supplierWorkspace';
import { canPaySupplierInvoice, supplierOutstandingAmount } from '@/lib/supplierOpenPayables';
import { useLanguage } from '@/lib/LanguageContext';

const COPY = {
  en: { title: 'Supplier invoice payment', remaining: 'Outstanding', full: 'Full payment',
    partial: 'Partial payment', amount: 'Payment amount', date: 'Date', method: 'Payment method',
    notes: 'Notes', save: 'Confirm payment / retry', close: 'Close', cash: 'Cash',
    network: 'Network', bank: 'Bank transfer', invalid: 'Enter a valid amount up to the outstanding balance.',
    partialInvalid: 'A partial payment must be less than the outstanding balance.',
    unavailable: 'Only approved invoices linked to a supplier and branch can be paid.',
    retry: 'If the previous request timed out, retrying uses the same payment ID, not a second payment.' },
  fa: { title: 'پرداخت فاکتور تأمین‌کننده', remaining: 'مانده بدهی', full: 'پرداخت کامل',
    partial: 'پرداخت جزئی', amount: 'مبلغ پرداخت', date: 'تاریخ', method: 'روش پرداخت',
    notes: 'یادداشت', save: 'تأیید پرداخت / تلاش دوباره', close: 'بستن', cash: 'نقدی',
    network: 'شبکه', bank: 'انتقال بانکی', invalid: 'مبلغ معتبر وارد کنید؛ نباید بیشتر از مانده بدهی باشد.',
    partialInvalid: 'پرداخت جزئی باید کمتر از مانده بدهی باشد.',
    unavailable: 'فقط فاکتور تأییدشده دارای تأمین‌کننده و شعبه قابل پرداخت است.',
    retry: 'اگر درخواست قبلی قطع شده، تلاش دوباره همان شناسه پرداخت را استفاده می‌کند و پرداخت دوم نمی‌سازد.' },
  ar: { title: 'سداد فاتورة المورد', remaining: 'المبلغ المتبقي', full: 'دفع كامل',
    partial: 'دفع جزئي', amount: 'مبلغ الدفع', date: 'التاريخ', method: 'طريقة الدفع',
    notes: 'ملاحظات', save: 'تأكيد الدفع / إعادة المحاولة', close: 'إغلاق', cash: 'نقدي',
    network: 'شبكة', bank: 'تحويل بنكي', invalid: 'أدخل مبلغاً صحيحاً لا يتجاوز الرصيد المتبقي.',
    partialInvalid: 'يجب أن تكون الدفعة الجزئية أقل من الرصيد المتبقي.',
    unavailable: 'لا يمكن دفع إلا الفواتير المعتمدة المرتبطة بمورد وفرع.',
    retry: 'إعادة المحاولة بعد انقطاع الاتصال تستخدم معرف الدفعة نفسه ولا تنشئ دفعة ثانية.' },
};

export default function SupplierWorkspacePayment({ invoice, onSaved, onClose }) {
  const { lang = 'en' } = useLanguage();
  const t = COPY[lang] || COPY.en;
  const remaining = supplierOutstandingAmount(invoice);
  const allowed = canPaySupplierInvoice(invoice);
  const key = 'supplier-payment:' + invoice.restaurant_id + ':' + invoice.id;
  const [form, setForm] = useState(() => {
    try {
      const previous = JSON.parse(sessionStorage.getItem(key));
      if (previous && previous.invoiceId === invoice.id && previous.requestId) return previous;
    } catch { /* No stored retry. */ }
    return {
      requestId: crypto.randomUUID(), invoiceId: invoice.id, amount: remaining.toFixed(2),
      date: new Date().toLocaleDateString('en-CA'), paymentMethod: 'cash', notes: '',
    };
  });
  const [mode, setMode] = useState(() => Number(form.amount) < remaining ? 'partial' : 'full');
  const [attempted, setAttempted] = useState(() => {
    try { return Boolean(sessionStorage.getItem(key)); } catch { return false; }
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const amount = attempted ? Number(form.amount) : mode === 'full' ? remaining : Number(form.amount);
  const validAmount = Number.isFinite(amount) && amount > 0
    && Math.abs(Math.round(amount * 100) - amount * 100) < 1e-6
    && amount <= remaining && (mode !== 'partial' || amount < remaining);

  const selectMode = nextMode => {
    if (attempted || pending || !allowed) return;
    setMode(nextMode);
    setForm(previous => ({ ...previous, amount: nextMode === 'full' ? remaining.toFixed(2) : '' }));
    setError('');
  };

  const save = async () => {
    if (busy.current || pending || !allowed) return;
    if ((!attempted && !validAmount) || !form.date) {
      setError(mode === 'partial' && amount >= remaining ? t.partialInvalid : t.invalid);
      return;
    }
    const request = { ...form, amount: Number(amount.toFixed(2)) };
    busy.current = true;
    setPending(true);
    setError('');
    try {
      sessionStorage.setItem(key, JSON.stringify(request));
      setAttempted(true);
      await postSupplierPayment(request);
      sessionStorage.removeItem(key);
      onSaved();
    } catch (e) {
      setError(e.message || t.invalid);
      // Validation/auth failure has not posted a payment. Allow correction;
      // keep the idempotency key for ambiguous network failures.
      if (e.code && /^(P0001|42501|22|23)/.test(e.code)) {
        sessionStorage.removeItem(key);
        setAttempted(false);
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return <section className="space-y-3 rounded-xl border bg-card p-4" aria-label={t.title}>
    <h3 className="font-bold">{t.title} · {invoice.invoice_number || invoice.id.slice(0, 8)}</h3>
    <p className="text-sm">{invoice.supplier_name} · {invoice.currency || 'SAR'}</p>
    <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900" data-testid="supplier-payment-remaining">
      {t.remaining}: <span dir="ltr">{(invoice.currency || 'SAR') + ' ' + remaining.toFixed(2)}</span>
    </p>
    {!allowed && <p role="alert" className="text-sm text-red-700">{t.unavailable}</p>}
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" variant={mode === 'full' ? 'default' : 'outline'}
        aria-pressed={mode === 'full'} disabled={!allowed || pending || attempted}
        onClick={() => selectMode('full')}>{t.full}</Button>
      <Button type="button" variant={mode === 'partial' ? 'default' : 'outline'}
        aria-pressed={mode === 'partial'} disabled={!allowed || pending || attempted || remaining <= 0.01}
        onClick={() => selectMode('partial')}>{t.partial}</Button>
    </div>
    <fieldset disabled={!allowed || pending || attempted} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="text-sm">{t.amount}
        <Input aria-label={t.amount} inputMode="decimal" type="number" min="0.01"
          max={remaining} step="0.01" disabled={mode === 'full'}
          value={mode === 'full' ? remaining.toFixed(2) : form.amount}
          onChange={e => setForm(previous => ({ ...previous, amount: e.target.value }))}/>
      </label>
      <label className="text-sm">{t.date}
        <Input aria-label={t.date} type="date" value={form.date}
          onChange={e => setForm(previous => ({ ...previous, date: e.target.value }))}/>
      </label>
      <label className="text-sm">{t.method}
        <select className="block w-full rounded border p-2" value={form.paymentMethod}
          onChange={e => setForm(previous => ({ ...previous, paymentMethod: e.target.value }))}>
          <option value="cash">{t.cash}</option>
          <option value="network">{t.network}</option>
          <option value="bank_transfer">{t.bank}</option>
        </select>
      </label>
      <label className="text-sm">{t.notes}
        <Input value={form.notes} onChange={e => setForm(previous => ({ ...previous, notes: e.target.value }))}/>
      </label>
    </fieldset>
    {attempted && <p role="status" className="text-xs text-muted-foreground">{t.retry}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={save} disabled={pending || !allowed || (!attempted && !validAmount)}>
        {t.save}
      </Button>
      <Button type="button" variant="outline" disabled={pending} onClick={onClose}>{t.close}</Button>
    </div>
  </section>;
}
