import React from 'react';
import ClosingNumericInput from './ClosingNumericInput';

export const cashCountCopy = {
  en: { actual: 'Cash in the drawer now', help: 'Count the notes and coins and enter the total.', opening: 'Cash at the start of this shift', initial: 'Only for the first closing: enter what was in the drawer BEFORE sales. Enter 0 if it started empty. Do not repeat this for each closing.', save: 'Save starting cash', saving: 'Saving…', owner: 'Ask the owner to confirm the starting balance for this older record.', details: 'How this is calculated', expected: 'Expected cash', difference: 'Cash difference', variance: 'This difference is saved separately and does not change sales.', loading: 'Loading cash movements…', retry: 'Retry', error: 'Cash movements could not load.', funding: 'Select a funding wallet below to cover the recorded cash gap.', note: 'Note (optional)', inflow: 'Other cash received', outflow: 'Cash paid out', sales: 'Cash sales', pending: 'Save the starting cash to calculate the balance.', manager: 'The owner needs to record funding or correct the cash payments before finalizing.', previousMissing:'The previous closing did not record its final drawer count. Review that closing before continuing.' },
  fa: { actual: 'نقد موجود در صندوق', help: 'پول داخل صندوق را بشمارید و مجموع را وارد کنید.', opening: 'نقد صندوق در شروع شیفت', initial: 'فقط در کلوزینگ اول: پولی را وارد کنید که پیش از فروش داخل صندوق بود. اگر صندوق خالی بود، ۰ بنویسید. برای کلوزینگ بعدی تکرار نکنید.', save: 'ثبت مبلغ شروع', saving: 'در حال ثبت…', owner: 'برای این سابقهٔ قدیمی، اونر باید مبلغ شروع صندوق را تأیید کند.', details: 'جزئیات محاسبه', expected: 'نقد مورد انتظار', difference: 'اختلاف صندوق', variance: 'اختلاف جدا ثبت می‌شود و فروش را تغییر نمی‌دهد.', loading: 'دریافت گردش صندوق…', retry: 'تلاش دوباره', error: 'گردش صندوق دریافت نشد.', funding: 'برای تأمین کسری ثبت‌شده، والت را در پایین انتخاب کنید.', note: 'یادداشت (اختیاری)', inflow: 'سایر دریافت‌های نقدی', outflow: 'پرداخت‌های نقدی', sales: 'فروش نقدی', pending: 'مبلغ شروع را ثبت کنید تا موجودی محاسبه شود.', manager: 'اونر باید تمویل را ثبت یا پرداخت‌های صندوق را اصلاح کند تا ثبت نهایی ممکن شود.', previousMissing:'در کلوزینگ قبلی نقد پایان صندوق ثبت نشده است. ابتدا کلوزینگ قبلی را بررسی کنید؛ مبلغ شروع را دوباره ثبت نکنید.' },
  ar: { actual: 'النقد الموجود في الصندوق الآن', help: 'عدّ الأوراق والعملات وأدخل المجموع.', opening: 'النقد في بداية الوردية', initial: 'فقط للإقفال الأول: أدخل المبلغ الموجود قبل بدء المبيعات. إذا كان الصندوق فارغاً أدخل 0. لا تكرره مع كل إقفال.', save: 'حفظ رصيد البداية', saving: 'جارٍ الحفظ…', owner: 'يجب أن يؤكد المالك رصيد البداية لهذا السجل القديم.', details: 'تفاصيل الحساب', expected: 'النقد المتوقع', difference: 'فرق الصندوق', variance: 'يُسجل الفرق منفصلاً ولا يغيّر المبيعات.', loading: 'جارٍ تحميل حركة النقد…', retry: 'إعادة المحاولة', error: 'تعذر تحميل حركة النقد.', funding: 'اختر محفظة التمويل أدناه لتغطية العجز المسجل.', note: 'ملاحظة (اختياري)', inflow: 'مقبوضات نقدية أخرى', outflow: 'مدفوعات نقدية', sales: 'المبيعات النقدية', pending: 'احفظ رصيد البداية لحساب الرصيد.', manager: 'يجب أن يسجل المالك التمويل أو يصحح المدفوعات قبل اعتماد الإقفال.', previousMissing:'الإقفال السابق لا يحتوي على النقد النهائي. راجعه أولاً ولا تكرر رصيد البداية.' },
};

export default function SimpleClosingCash({ lang = 'en', currency = 'SAR', inputId, actualCashValue, onActualCashChange, actualCashError,
  openingRequired, openingBlockedByPrevious = false, openingValue, onOpeningChange, onSaveOpening, openingBusy, openingError, canSetOpening,
  openingCash, cashSales, cashIn, cashOut, expectedCash, difference, ledgerLoading, ledgerUnavailable, ledgerOverdrawn,
  onRetryLedger, fundingContent, role, cashNotes, onCashNotesChange, disabled }) {
  const t = cashCountCopy[lang] || cashCountCopy.en;
  const money = amount => amount === null || amount === undefined ? '—' : `${Number(amount).toLocaleString(lang === 'en' ? 'en-US' : lang === 'ar' ? 'ar-SA' : 'fa-IR', { maximumFractionDigits: 2 })} ${currency}`;
  return <section data-testid="simple-closing-cash" data-i18n-skip="true" dir={lang === 'en' ? 'ltr' : 'rtl'} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div>
      <label htmlFor={inputId} className="block text-base font-black text-slate-950">{t.actual}</label>
      <p className="mt-1 text-sm text-slate-500">{t.help}</p>
      <ClosingNumericInput id={inputId} value={actualCashValue} onChange={onActualCashChange} prefix={currency} required disabled={disabled || openingBusy} error={actualCashError} className="mt-3" inputClassName="h-16 bg-white text-2xl font-black" />
    </div>
    {openingRequired && <div id="opening-cash-needs-review" data-testid="initial-drawer-setup" className="space-y-2 rounded-xl bg-blue-50 p-3">
      {openingBlockedByPrevious ? <p role="alert" className="text-sm font-semibold text-amber-900">{t.previousMissing}</p> : canSetOpening ? <>
        <label htmlFor="opening-verification-count" className="block text-sm font-bold">{t.opening}</label>
        <p className="text-xs leading-6 text-slate-600">{t.initial}</p>
        <ClosingNumericInput id="opening-verification-count" value={openingValue} onChange={onOpeningChange} prefix={currency} disabled={disabled || openingBusy} error={openingError} />
        <button type="button" onClick={onSaveOpening} disabled={disabled || openingBusy || !String(openingValue).trim()} className="min-h-11 w-full rounded-xl bg-blue-600 px-3 text-sm font-bold text-white disabled:opacity-50">{openingBusy ? t.saving : t.save}</button>
      </> : <p className="text-sm">{t.owner}</p>}
    </div>}
    {ledgerLoading && <p role="status" className="text-sm text-slate-500">{t.loading}</p>}
    {ledgerUnavailable && <p role="alert" className="text-sm text-red-700">{t.error} <button type="button" onClick={onRetryLedger} className="min-h-11 underline">{t.retry}</button></p>}
    {!openingRequired && !ledgerLoading && !ledgerUnavailable && <>
      {ledgerOverdrawn && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{role === 'owner' ? t.funding : t.manager}</p>}
      {fundingContent}
      {!ledgerOverdrawn && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3"><span className="text-sm font-bold">{t.difference}</span><strong dir="ltr" className={difference < 0 ? 'text-red-700' : 'text-emerald-700'}>{money(difference)}</strong>{difference !== null && difference !== 0 && <p className="w-full text-xs text-slate-500">{t.variance}</p>}</div>}
      <details className="rounded-xl border border-slate-100 p-3"><summary className="min-h-9 cursor-pointer text-sm font-bold text-slate-600">{t.details}</summary><dl className="space-y-2 text-sm">{[[t.opening, openingCash], [t.sales, cashSales], [t.inflow, cashIn], [t.outflow, cashOut], [t.expected, expectedCash]].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd dir="ltr">{money(value)}</dd></div>)}</dl></details>
    </>}
    <details className="text-sm text-slate-500"><summary className="min-h-11 cursor-pointer py-2">{t.note}</summary><textarea aria-label={t.note} value={cashNotes} onChange={e => onCashNotesChange(e.target.value)} disabled={disabled} className="min-h-20 w-full rounded-xl border border-slate-200 p-3" /></details>
  </section>;
}
