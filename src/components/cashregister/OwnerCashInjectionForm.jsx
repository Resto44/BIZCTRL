import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useNotify } from '@/lib/useNotify';
import { createOwnerCashInjection } from '@/services/cashRegisterService';
import { validCashAmount } from '@/lib/cashRegisterData';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
const REASONS = [
 ['Operational Funding','تمویل عملیات','تمويل التشغيل'], ['Cash Shortage Coverage','پوشش کسری نقد','تغطية عجز النقد'],
 ['Supplier Payment','پرداخت سپلایر','سداد مورد'], ['Emergency Fund','بودجه ضروری','تمويل طارئ'],
 ['Salary Coverage','تمویل معاش','تغطية الرواتب'], ['Other','سایر','أخرى'],
];
export default function OwnerCashInjectionForm({ onSuccess, onCancel, shortageId, shortageAmount, defaultBranch }) {
 const { user } = useAuth();
 const { branches, activeRestaurantId } = useTenant();
 const { currency, lang, formatMoney } = useLanguage();
 const text = (en, fa, ar) => lang === 'fa' ? fa : lang === 'ar' ? ar : en;
 const qc = useQueryClient(); const notif = useNotify();
 const storageKey = `cash-injection:${user?.id}:${activeRestaurantId}:${shortageId || 'new'}`;
 const [pending, setPending] = useState(() => { try { return JSON.parse(sessionStorage.getItem(storageKey)) || null; } catch { return null; } });
 const [form, setForm] = useState(() => pending?.form || { date: format(new Date(), 'yyyy-MM-dd'), branch: defaultBranch || branches[0]?.key || '', amount: shortageAmount ? String(shortageAmount) : '', reason: shortageId ? 'Cash Shortage Coverage' : 'Operational Funding', notes: '' });
 const inFlight = useRef(false);
 const selected = branches.find(b => b.key === form.branch || b.branch_key === form.branch || b.id === form.branch);
 const fmt = value => formatMoney ? formatMoney(Number(value)) : `${currency} ${Number(value).toFixed(2)}`;
 const mutation = useMutation({
  mutationFn: async () => {
   if (user?.role !== 'owner' || !selected?.id || !activeRestaurantId || !form.date || !validCashAmount(form.amount)) throw new Error(text('Check branch, date and amount.','شعبه، تاریخ و مبلغ را بررسی کنید.','راجع الفرع والتاريخ والمبلغ.'));
   const request = pending || { requestId: crypto.randomUUID(), form: { ...form }, branchId: selected.id, restaurantId: activeRestaurantId };
   // Persist before posting so a lost response or remount reuses exactly this request.
   sessionStorage.setItem(storageKey, JSON.stringify(request)); setPending(request);
   return createOwnerCashInjection({ requestId: request.requestId, ...request.form, amount: Number(request.form.amount), branchId: request.branchId, restaurantId: request.restaurantId, shortageId: shortageId || null });
  },
  onSuccess: data => {
   sessionStorage.removeItem(storageKey); setPending(null); setForm(f => ({ ...f, amount: '', notes: '' }));
   qc.invalidateQueries(); notif.success(text('Cash injection recorded.','تزریق نقد ثبت شد.','تم تسجيل تمويل النقد.')); onSuccess?.(data);
  },
  onError: error => {
   // An explicit Postgres rejection rolls the complete transaction back. A network
   // failure is ambiguous, so retain the payload and permit only the same retry.
   if (['P0001','42501','23514','22003','22P02'].includes(error?.code)) { sessionStorage.removeItem(storageKey); setPending(null); }
   notif.error(error?.message || text('Could not record cash. Retry the same request.','ثبت نشد؛ همان درخواست را دوباره تلاش کنید.','تعذر التسجيل؛ أعد نفس الطلب.'));
  },
  onSettled: () => { inFlight.current = false; },
 });
 const submit = event => { event.preventDefault(); if (inFlight.current) return; inFlight.current = true; mutation.mutate(); };
 const field = 'block min-h-11 w-full min-w-0 max-w-full rounded-xl border bg-background px-3 py-2 text-base text-foreground';
 const change = (key, value) => setForm(f => ({ ...f, [key]: value }));
 if (user?.role !== 'owner') return <p role="alert">{text('Only the business owner can inject cash.','تزریق نقد فقط برای اونر کسب‌وکار است.','تمويل النقد متاح لمالك المنشأة فقط.')}</p>;
 return <section dir={lang === 'en' ? 'ltr' : 'rtl'} className="min-w-0 rounded-2xl border border-emerald-300/60 bg-emerald-500/5 p-4 sm:p-5">
  <div className="mb-4 flex items-start justify-between gap-3"><h2 className="font-bold">{text('Owner cash contribution','تزریق نقد اونر','مساهمة نقدية من المالك')}</h2>{onCancel && <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={onCancel}>{text('Close','بستن','إغلاق')}</Button>}</div>
  <p className="mb-4 text-sm leading-6 text-muted-foreground">{text('Use this for new cash contributed by the owner. For money already held in an owner treasury account, use a Treasury transfer instead.','برای نقد جدیدی که اونر وارد می‌کند استفاده کنید. پول موجود در حساب خزانه اونر را از انتقال خزانه جابه‌جا کنید.','استخدمه لنقد جديد يساهم به المالك. لنقل مال موجود في حساب خزينة المالك استخدم تحويل الخزينة.')} <Link to="/treasury" className="text-primary underline">{text('Treasury','خزانه','الخزينة')}</Link></p>
  {pending && <p role="status" className="mb-4 rounded-lg border border-amber-300 p-3 text-sm">{text('Pending confirmation. Retry this same request; do not create another injection.','تأیید در انتظار است. همین درخواست را تکرار کنید؛ تزریق دیگر نسازید.','بانتظار التأكيد. أعد نفس الطلب ولا تنشئ تمويلاً آخر.')}</p>}
  <form onSubmit={submit} className="min-w-0 space-y-4">
   <fieldset disabled={mutation.isPending || Boolean(pending)} className="min-w-0 space-y-4 disabled:opacity-70">
    <label className="block min-w-0 space-y-1"><span>{text('Date','تاریخ','التاريخ')}</span><input required type="date" value={form.date} onChange={e => change('date',e.target.value)} className={field} style={{ appearance: 'none' }} /></label>
    <label className="block space-y-1"><span>{text('Branch','شعبه','الفرع')}</span><select required value={form.branch} onChange={e => change('branch',e.target.value)} className={field}><option value="">{text('Choose branch','انتخاب شعبه','اختر الفرع')}</option>{branches.map(b => <option key={b.id || b.key} value={b.key || b.branch_key}>{b.label || b.name}</option>)}</select></label>
    <label className="block space-y-1"><span>{text('Amount','مبلغ','المبلغ')} ({currency})</span><div dir="ltr" className="flex min-w-0 items-stretch overflow-hidden rounded-xl border bg-background"><span className="flex shrink-0 items-center border-e px-3 text-sm text-muted-foreground">{currency}</span><input required aria-label={text('Amount','مبلغ','المبلغ')} inputMode="decimal" type="number" min="0.01" step="0.01" value={form.amount} onChange={e => change('amount',e.target.value)} className="min-h-11 w-full min-w-0 bg-transparent px-3 py-2 text-base" placeholder="0.00" /></div></label>
    <label className="block space-y-1"><span>{text('Reason','دلیل','السبب')}</span><select value={form.reason} onChange={e => change('reason',e.target.value)} className={field}>{REASONS.map(row => <option key={row[0]} value={row[0]}>{text(...row)}</option>)}</select></label>
    <label className="block space-y-1"><span>{text('Notes','یادداشت','ملاحظات')}</span><textarea value={form.notes} onChange={e => change('notes',e.target.value)} className={field} maxLength={2000} /></label>
   </fieldset>
   {selected && validCashAmount(form.amount) && <div className="rounded-xl border border-emerald-300/60 bg-emerald-500/10 p-3 text-sm leading-7"><strong>{selected.label || selected.name}</strong><p dir="ltr">{fmt(form.amount)}</p><p>{text('One contribution, one cash movement and one linked treasury entry will be saved together. This is not sales revenue.','یک تزریق، یک حرکت نقد و یک رکورد مرتبط خزانه باهم ذخیره می‌شود. این مبلغ فروش نیست.','تُحفظ مساهمة واحدة وحركة نقد واحدة وقيد خزينة مرتبط معاً. هذا المبلغ ليس إيراد مبيعات.')}</p></div>}
   <Button type="submit" className="min-h-12 w-full whitespace-normal bg-emerald-600 text-white" disabled={mutation.isPending || !selected?.id || !validCashAmount(form.amount) || !form.date}>{mutation.isPending ? text('Saving…','در حال ثبت…','جارٍ الحفظ…') : pending ? text('Retry same request','تلاش دوباره همان درخواست','إعادة نفس الطلب') : text('Record cash contribution','ثبت تزریق نقد','تسجيل المساهمة النقدية')}</Button>
  </form>
 </section>;
}
