import React from 'react';
import { Banknote, WalletCards, ClipboardCheck, ArrowDownUp } from 'lucide-react';

const COPY = {
  en: { title: 'Closing control center', sales: 'Shift sales', expected: 'Expected drawer', actual: 'Counted cash', variance: 'Cash variance', pending: 'Awaiting verification', count: 'Not counted yet', balanced: 'Balanced', short: 'Shortage', over: 'Overage', review: 'Review required', salesStep: 'Review sales', cashStep: 'Count & reconcile', reviewStep: 'Final review', help: 'Sales, drawer cash and funding are separate. Debt collections and owner funding are not new sales.' },
  ar: { title: 'مركز إقفال المبيعات', sales: 'مبيعات الوردية', expected: 'النقد المتوقع', actual: 'النقد المعدود', variance: 'فرق الصندوق', pending: 'بانتظار التحقق', count: 'لم يُعدّ النقد بعد', balanced: 'متطابق', short: 'عجز', over: 'فائض', review: 'بحاجة للمراجعة', salesStep: 'مراجعة المبيعات', cashStep: 'عدّ ومطابقة النقد', reviewStep: 'المراجعة النهائية', help: 'المبيعات ونقد الصندوق والتمويل منفصلة. تحصيل الديون وتمويل المالك ليسا مبيعات جديدة.' },
  fa: { title: 'مرکز کنترل کلوزینگ', sales: 'فروش همین شیفت', expected: 'نقد مورد انتظار', actual: 'نقد شمارش‌شده', variance: 'اختلاف صندوق', pending: 'در انتظار تأیید', count: 'هنوز شمارش نشده', balanced: 'تطبیق‌شده', short: 'کسری', over: 'اضافه', review: 'نیاز به بررسی', salesStep: 'بررسی فروش', cashStep: 'شمارش و تطبیق', reviewStep: 'بررسی نهایی', help: 'فروش، پول صندوق و تأمین مالی جدا هستند. وصول بدهی و پول مالک، فروش جدید نیستند.' },
};

/** Read-only overview; all amounts come from the existing canonical closing. */
export default function ClosingControlOverview({ lang = 'en', currency, totalSales, expectedCash, actualCash, difference, ledgerOverdrawn, onSales, onCash, onReview, showNavigation = true }) {
  const text = COPY[lang] || COPY.en;
  const cards = [
    { key: 'sales', label: text.sales, value: totalSales, Icon: WalletCards, tone: 'text-slate-900', note: null },
    { key: 'expected', label: text.expected, value: expectedCash, Icon: Banknote, tone: 'text-blue-800', note: expectedCash == null ? text.pending : null },
    { key: 'actual', label: text.actual, value: actualCash, Icon: ClipboardCheck, tone: 'text-slate-900', note: actualCash == null ? text.count : null },
    { key: 'variance', label: text.variance, value: difference, Icon: ArrowDownUp, tone: difference == null ? 'text-slate-500' : difference < 0 ? 'text-red-700' : difference > 0 ? 'text-amber-800' : 'text-emerald-700', note: ledgerOverdrawn ? text.review : difference == null ? text.pending : difference < 0 ? text.short : difference > 0 ? text.over : text.balanced },
  ];
  return <section aria-label={text.title} data-testid="closing-control-overview" data-i18n-skip="true" dir={lang === 'en' ? 'ltr' : 'rtl'} className="min-w-0 space-y-3">
    <div className="grid min-w-0 grid-cols-1 gap-2 min-[360px]:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ key, label, value, Icon, tone, note }) => <div key={key} data-testid={`closing-kpi-${key}`} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold leading-5 text-slate-600">{label}</p><Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${tone}`} /></div>
        <p dir="ltr" className={`mt-2 flex min-w-0 flex-wrap items-baseline gap-x-1.5 tabular-nums ${tone}`}>
          <span className="break-all text-xl font-black leading-7">{value == null ? '—' : Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          {value != null && <span className="text-xs font-semibold">{currency}</span>}
        </p>
        {note && <p className={`mt-1 text-xs font-semibold ${tone}`}>{note}</p>}
      </div>)}
    </div>
    {showNavigation && <nav aria-label={text.title} className="grid grid-cols-1 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 min-[360px]:grid-cols-3">
      {[{ label: text.salesStep, action: onSales }, { label: text.cashStep, action: onCash }, { label: text.reviewStep, action: onReview }].map(({ label, action }, index) => <button key={label} type="button" onClick={action} className="flex min-h-12 min-w-0 items-center gap-2 rounded-lg px-2 text-start text-xs font-bold text-slate-700 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"><span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-blue-700">{index + 1}</span><span>{label}</span></button>)}
    </nav>}
    <p className="px-1 text-xs leading-5 text-slate-500">{text.help}</p>
  </section>;
}
