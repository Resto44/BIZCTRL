import React from 'react';
import { Banknote, CheckCircle2, ClipboardCheck, ShieldAlert, ArrowRight, WalletCards } from 'lucide-react';

const COPY = {
  en: { sales: 'Sales summary', shift: 'Sales of this shift, each tender once', cash: 'Cash Sales', card: 'Network / Card', credit: 'Credit Sales', other: 'Other Sources', all: 'Total Sales', ledger: 'Cash reconciliation result', opening: 'Opening Cash', in: 'Posted Cash In', out: 'Posted Cash Out', expected: 'Expected Cash', counted: 'Actual Cash in Drawer', diff: 'Variance', next: 'Next Opening Cash', preview: 'Preview only · becomes opening when this closing is finalized and the next drawer is verified', notReady: 'Not available until cash reconciliation passes', funding: 'Funding & exceptions', clear: 'No ledger exception', needsFunding: 'Review recorded cash movements / funding', shortage: 'Count shortage recorded separately', noSales: 'Owner/treasury funding is not sales', checklist: 'Finalization checklist', ready: 'Ready to finalize', pending: 'Review required', salesStep: 'Sales recorded', countStep: 'Cash count recorded', ledgerStep: 'Scoped ledger verified', editSales: 'Edit sales', editCash: 'Review cash' },
  fa: { sales: 'خلاصه فروش', shift: 'فروش همین شیفت، هر پرداخت یک‌بار', cash: 'فروش نقدی', card: 'شبکه / کارت', credit: 'فروش قرضه', other: 'سایر منابع', all: 'مجموع فروش', ledger: 'نتیجه تطبیق صندوق', opening: 'نقد افتتاحیه', in: 'ورود نقد ثبت‌شده', out: 'خروج نقد ثبت‌شده', expected: 'نقد مورد انتظار', counted: 'نقد واقعی داخل صندوق', diff: 'اختلاف صندوق', next: 'افتتاحیه کلوزینگ بعدی', preview: 'فقط پیش‌نمایش · پس از نهایی‌شدن و تأیید هویت صندوق منتقل می‌شود', notReady: 'تا تأیید تطبیق صندوق قابل‌انتقال نیست', funding: 'تمویل و استثناها', clear: 'دفتر صندوق بدون مشکل', needsFunding: 'گردش نقد و تمویل بررسی شود', shortage: 'کمبود شمارش جدا ثبت می‌شود', noSales: 'تمویل اونر یا خزانه فروش نیست', checklist: 'بررسی پیش از نهایی‌سازی', ready: 'آماده ثبت نهایی', pending: 'نیاز به بررسی', salesStep: 'فروش ثبت شده', countStep: 'نقد صندوق شمارش شده', ledgerStep: 'دفتر شعبه و شیفت تأیید شده', editSales: 'اصلاح فروش', editCash: 'بررسی صندوق' },
  ar: { sales: 'ملخص المبيعات', shift: 'مبيعات الوردية، كل دفعة مرة واحدة', cash: 'مبيعات نقدية', card: 'شبكة / بطاقة', credit: 'مبيعات آجلة', other: 'مصادر أخرى', all: 'إجمالي المبيعات', ledger: 'نتيجة مطابقة الصندوق', opening: 'نقد افتتاحي', in: 'النقد الوارد المسجل', out: 'النقد الصادر المسجل', expected: 'النقد المتوقع', counted: 'النقد الفعلي في الصندوق', diff: 'فرق الصندوق', next: 'النقد الافتتاحي للإقفال التالي', preview: 'معاينة فقط · يُنقل بعد اعتماد الإقفال والتحقق من هوية الصندوق', notReady: 'غير متاح حتى اعتماد مطابقة الصندوق', funding: 'التمويل والاستثناءات', clear: 'لا أخطاء في دفتر النقد', needsFunding: 'راجع حركات النقد والتمويل', shortage: 'يسجل عجز العد بشكل مستقل', noSales: 'تمويل المالك والخزينة ليس مبيعات', checklist: 'قائمة اعتماد الإقفال', ready: 'جاهز للاعتماد', pending: 'يلزم المراجعة', salesStep: 'المبيعات مسجلة', countStep: 'النقد معدود', ledgerStep: 'دفتر الفرع والوردية معتمد', editSales: 'تعديل المبيعات', editCash: 'مراجعة النقد' },
};
const money = (value, currency) => value === null || value === undefined
  ? '—' : currency + ' ' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ClosingFinalReview({
  lang = 'en', currency = 'SAR',
  cashSales, networkSales, creditSales, otherSales, totalSales,
  openingCash, cashIn, cashOut, expectedCash, actualCash, difference,
  ledgerOverdrawn = false, cashContextReady = false, allValid = false,
  onEditSales, onEditCash,
}) {
  const tr = COPY[lang] || COPY.en;
  const ledgerValid = cashContextReady && !ledgerOverdrawn && expectedCash !== null && difference !== null;
  const canPreviewOpening = ledgerValid && actualCash !== null && allValid;
  const isShort = ledgerValid && difference < 0;
  const row = (label, amount, bold = false) => <div key={label} className={'flex items-center justify-between gap-3 py-2 text-xs sm:text-sm ' + (bold ? 'font-black text-blue-800' : 'border-b border-slate-100 text-slate-700')}>
    <span className="min-w-0">{label}</span><span dir="ltr" className="shrink-0 tabular-nums">{money(amount, currency)}</span>
  </div>;
  return <div data-testid="closing-final-erp-review" className="space-y-3" dir={lang === 'en' ? 'ltr' : 'rtl'}>
    <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-5">
      <div className="flex items-start gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700"><WalletCards className="h-5 w-5" /></span><div className="flex-1"><h3 className="text-sm font-black text-slate-950">{tr.sales}</h3><p className="text-[11px] text-slate-500">{tr.shift}</p></div><button type="button" onClick={onEditSales} className="min-h-9 rounded-lg px-2 text-xs font-bold text-blue-700">{tr.editSales}</button></div>
      <div className="mt-2">{row(tr.cash,cashSales)}{row(tr.card,networkSales)}{row(tr.credit,creditSales)}{row(tr.other,otherSales)}<div className="rounded-xl bg-blue-50 px-2">{row(tr.all,totalSales,true)}</div></div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-5">
      <div className="flex items-center gap-2.5"><Banknote className="h-5 w-5 text-blue-700" /><h3 className="flex-1 text-sm font-black text-slate-950">{tr.ledger}</h3><button type="button" onClick={onEditCash} className="min-h-9 rounded-lg px-2 text-xs font-bold text-blue-700">{tr.editCash}</button></div>
      <div className="mt-2">{row(tr.opening, cashContextReady ? openingCash : null)}{row(tr.cash,cashSales)}{row(tr.in,cashContextReady?cashIn:null)}{row(tr.out,cashContextReady?cashOut:null)}<div className="rounded-xl bg-slate-50 px-2">{row(tr.expected,ledgerOverdrawn?null:expectedCash,true)}</div><div className="mt-2 rounded-xl bg-blue-50 px-2">{row(tr.counted,actualCash,true)}</div><div className={'mt-2 rounded-xl px-2 ' + (difference === 0 && ledgerValid ? 'bg-emerald-50' : 'bg-amber-50')}>{row(tr.diff,ledgerValid?difference:null,true)}</div></div>
    </section>
    <section className="flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-3.5" data-testid="closing-next-opening-preview">
      <ClipboardCheck className="h-6 w-6 shrink-0 text-blue-600" /><div className="min-w-0 flex-1"><h3 className="text-sm font-black text-slate-900">{tr.next}</h3><p className="mt-1 text-[11px] text-slate-600">{canPreviewOpening?tr.preview:tr.notReady}</p></div><strong className="shrink-0 text-sm font-black tabular-nums text-blue-900" dir="ltr">{money(canPreviewOpening?actualCash:null,currency)}</strong>
    </section>
    <section className={'rounded-2xl border p-3.5 ' + (ledgerValid ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50')} data-testid="closing-funding-exceptions">
      <div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-amber-600" /><h3 className="text-sm font-black text-slate-950">{tr.funding}</h3></div>
      <p className="mt-2 text-xs font-semibold text-slate-800">{ledgerValid ? (isShort ? tr.shortage : tr.clear) : tr.needsFunding}</p>
      <p className="mt-1 text-[11px] text-slate-600">{tr.noSales}</p>
      {!ledgerValid && <button type="button" onClick={onEditCash} className="mt-2 inline-flex min-h-10 items-center gap-1 text-xs font-bold text-blue-700">{tr.editCash}<ArrowRight className="h-4 w-4" /></button>}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm" data-testid="closing-finalization-checklist">
      <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-blue-700" /><h3 className="text-sm font-black text-slate-900">{tr.checklist}</h3></div>
      {[ [tr.salesStep, Number.isFinite(Number(totalSales))], [tr.countStep, actualCash !== null], [tr.ledgerStep, ledgerValid] ].map(([label, passed])=><div key={label} className="mt-2 flex items-center gap-2 text-xs text-slate-700"><span className={passed?'text-emerald-600':'text-amber-600'}>{passed?'✓':'!'}</span><span>{label}</span></div>)}
      <p className={'mt-3 rounded-lg px-3 py-2 text-xs font-black ' + (allValid && ledgerValid?'bg-emerald-50 text-emerald-800':'bg-amber-50 text-amber-800')}>{allValid && ledgerValid?tr.ready:tr.pending}</p>
    </section>
  </div>;
}
