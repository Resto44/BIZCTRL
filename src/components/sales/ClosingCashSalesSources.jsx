import React from 'react';
import { Banknote } from 'lucide-react';

const labels = {
  en: { title: 'Cash sales by source', helper: 'This shift only · cash tender from sales, not funding', total: 'Total Cash Sales', invalid: 'Source total needs review' },
  fa: { title: 'فروش نقدی به تفکیک منبع', helper: 'فقط همین شیفت · پول فروش، نه تمویل صندوق', total: 'مجموع فروش نقدی', invalid: 'مجموع منابع نیاز به بررسی دارد' },
  ar: { title: 'المبيعات النقدية حسب المصدر', helper: 'لهذه الوردية فقط · نقد المبيعات دون التمويل', total: 'إجمالي المبيعات النقدية', invalid: 'إجمالي المصادر يحتاج مراجعة' },
};

const money = (value, currency) => currency + ' ' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Read-only breakdown of the same cash bucket used in reconciliation. */
export default function ClosingCashSalesSources({ breakdown, closingCashSales, currency = 'SAR', lang = 'en' }) {
  const tr = labels[lang] || labels.en;
  const rows = breakdown?.rows || [];
  const consistent = Number.isFinite(Number(closingCashSales)) &&
    Math.abs(Math.round(Number(closingCashSales) * 100) - Math.round(Number(breakdown?.total || 0) * 100)) <= 1;
  return <section data-testid="closing-cash-sales-sources" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" dir={lang === 'en' ? 'ltr' : 'rtl'}>
    <div className="flex items-start gap-2.5 px-3.5 pt-3.5 sm:px-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Banknote className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-black text-slate-950 sm:text-base">{tr.title}</h3>
        <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{tr.helper}</p>
      </div>
    </div>
    <div className="space-y-0 px-3.5 py-2 sm:px-5">
      {rows.map(row => <div key={row.id} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-xs sm:text-sm">
        <span className="min-w-0 break-words text-slate-700">{lang === 'fa' ? row.labelFa : lang === 'ar' ? row.labelAr : row.label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-slate-900" dir="ltr">{money(row.amount, currency)}</span>
      </div>)}
      <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-blue-50 px-3 py-3">
        <span className="text-xs font-black text-blue-800 sm:text-sm">{tr.total}</span>
        <strong className="shrink-0 text-lg font-black tabular-nums text-blue-700" dir="ltr">{money(breakdown?.total || 0, currency)}</strong>
      </div>
      {!consistent && <p data-testid="cash-sales-source-mismatch" role="alert" className="mt-2 rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">{tr.invalid}</p>}
    </div>
  </section>;
}
