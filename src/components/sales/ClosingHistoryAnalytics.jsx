import React from 'react';
import { closingFinancialAnalysis } from '@/lib/closingHistoryAnalytics';

const COPY = {
  en: { sales: 'Sales', purchases: 'Purchases', expenses: 'Operating expenses', gross: 'Gross profit (est.)', net: 'Net profit (est.)', margin: 'Margin (est.)', trend: 'Available similar shifts', previous: 'Compared with', missing: 'Cost data incomplete', zero: 'No recorded costs · profit unverified', unavailable: 'Not enough comparable history', basis: 'Same branch, shift and cashier · finalized records available', more: 'Sales to estimated profit', note: 'Gross = sales − purchases; net = gross − operating expenses. Purchase-basis estimate, not actual inventory COGS. Funding and drawer variance are separate.', history: 'Trend values' },
  fa: { sales: 'فروش', purchases: 'خرید', expenses: 'مصارف عملیاتی', gross: 'ناخالص تخمینی', net: 'خالص تخمینی', margin: 'حاشیه تخمینی', trend: 'روند شیفت‌های مشابه موجود', previous: 'مقایسه با', missing: 'هزینه ناقص', zero: 'هزینه ثبت نشده؛ فایده تأیید نشده', unavailable: 'سابقه مشابه کافی نیست', basis: 'همان شعبه، شیفت و صندوق‌دار؛ سوابق نهایی موجود', more: 'از فروش تا فایده تخمینی', note: 'ناخالص = فروش − خرید؛ خالص = ناخالص − مصارف عملیاتی. تخمین بر مبنای خرید است، نه بهای واقعی کالای فروخته‌شده. تمویل و اختلاف صندوق جدا هستند.', history: 'ارقام روند' },
  ar: { sales: 'المبيعات', purchases: 'المشتريات', expenses: 'مصاريف التشغيل', gross: 'إجمالي تقديري', net: 'صافي تقديري', margin: 'هامش تقديري', trend: 'الورديات المماثلة المتاحة', previous: 'مقارنة مع', missing: 'تكاليف غير مكتملة', zero: 'لا تكاليف مسجلة؛ الربح غير مؤكد', unavailable: 'لا يوجد سجل مماثل كافٍ', basis: 'نفس الفرع والوردية وأمين الصندوق؛ السجلات النهائية المتاحة', more: 'من المبيعات إلى الربح التقديري', note: 'الإجمالي = المبيعات − المشتريات؛ الصافي = الإجمالي − مصاريف التشغيل. تقدير على أساس المشتريات وليس تكلفة البضاعة المباعة الفعلية. التمويل وفروق الصندوق منفصلة.', history: 'قيم الاتجاه' },
};
const amount = value => value == null ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
const signed = value => value == null ? '—' : `${value > 0 ? '+' : ''}${amount(value)}`;

function Sparkline({ points, label }) {
  const values = points.map(point => point.value);
  const low = Math.min(...values), range = Math.max(...values) - low || 1;
  const xy = points.map((point, i) => `${8 + i * 184 / (points.length - 1)},${44 - (point.value - low) * 34 / range}`);
  return <svg viewBox="0 0 200 52" className="h-12 w-full" role="img" aria-label={label} dir="ltr"><title>{points.map(p => `${p.date}: ${p.value}`).join('; ')}</title><path d={`M ${xy.join(' L ')} L 192,50 L 8,50 Z`} fill="#dbeafe" /><polyline points={xy.join(' ')} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" /><circle cx="192" cy={xy.at(-1).split(',')[1]} r="3" fill="#2563eb" /></svg>;
}

export default function ClosingHistoryAnalytics({ sale, trend, currency = 'SAR', lang = 'en', expanded = false }) {
  const text = COPY[lang] || COPY.en;
  const data = closingFinancialAnalysis(sale);
  const points = trend?.points || [];
  const money = value => value == null ? '—' : `${currency} ${amount(value)}`;
  const profitMoney = value => value == null ? '—' : `${value > 0 ? '+' : ''}${currency} ${amount(value)}`;
  const chartReady = data.sales !== null && !data.costsMissing;
  const levels = chartReady ? [0, data.sales, data.grossProfit, data.netProfit] : [0];
  const low = Math.min(...levels), high = Math.max(...levels), range = high - low || 1;
  const y = value => 90 - (value - low) / range * 80;
  const bars = chartReady ? [
    { label: text.sales, start: 0, end: data.sales, value: data.sales, color: '#2563eb' },
    { label: text.purchases, start: data.sales, end: data.grossProfit, value: -data.purchases, color: '#d97706' },
    { label: text.expenses, start: data.grossProfit, end: data.netProfit, value: -data.operatingExpenses, color: '#e11d48' },
    { label: text.net, start: 0, end: data.netProfit, value: data.netProfit, color: data.netProfit < 0 ? '#dc2626' : '#059669' },
  ] : [];
  return <section data-testid="closing-history-analytics" data-i18n-skip="true" dir={lang === 'en' ? 'ltr' : 'rtl'} className="mt-2 space-y-2 border-t border-border/70 pt-2">
    <div className="grid min-w-0 grid-cols-2 items-center gap-3">
      <div className="min-w-0"><p className="text-xs text-muted-foreground">{text.sales} <span className="text-[10px]">({currency})</span></p><p dir="ltr" className="break-words text-start text-xl font-black tabular-nums text-blue-700">{amount(data.sales)}</p>
        <p className={`text-xs font-bold ${trend?.change == null ? 'text-muted-foreground' : trend.change < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{trend?.change == null ? '—' : `${trend.change > 0 ? '+' : ''}${trend.change.toFixed(1)}%`}</p>
        {trend?.previous && <p className="text-[10px] text-muted-foreground">{text.previous} <bdi>{trend.previous.date}</bdi></p>}
      </div>
      <div className="min-w-0"><p className="text-[10px] text-muted-foreground">{text.trend} ({points.length}/7)</p>{points.length >= 2 ? <Sparkline points={points} label={text.trend} /> : <p className="py-3 text-[10px] text-muted-foreground">{text.unavailable}</p>}</div>
    </div>
    <div className="grid grid-cols-3 gap-2 border-y border-border/60 py-2">
      {[[text.purchases, data.purchases], [text.expenses, data.operatingExpenses], [text.net, data.netProfit]].map(([label, value], i) => <div key={label} className="min-w-0"><p className="text-[10px] leading-4 text-muted-foreground">{label}</p><p dir="ltr" className={`break-words text-start text-xs font-black tabular-nums sm:text-sm ${i === 2 ? (value < 0 ? 'text-red-700' : 'text-emerald-700') : ''}`}>{i === 2 ? profitMoney(value) : money(value)}</p></div>)}
    </div>
    <div className="flex flex-wrap justify-between gap-2 text-[10px]"><span>{text.gross}: <strong dir="ltr">{profitMoney(data.grossProfit)}</strong></span><span>{text.margin}: <strong>{data.margin == null ? '—' : `${data.margin.toFixed(1)}%`}</strong></span></div>
    {data.allocation && <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${text.purchases} ${data.allocation[0].toFixed(1)}%; ${text.expenses} ${data.allocation[1].toFixed(1)}%; ${text.net} ${data.allocation[2].toFixed(1)}%`} dir="ltr">{data.allocation.map((value, i) => <span key={i} style={{ width: `${value}%`, background: ['#2563eb', '#f59e0b', '#059669'][i] }} />)}</div>}
    {data.allocation && <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">{[text.purchases, text.expenses, text.net].map((label, i) => <span key={label}><i className="mx-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: ['#2563eb', '#f59e0b', '#059669'][i] }} />{label} {data.allocation[i].toFixed(0)}%</span>)}</div>}
    {(data.costsMissing || data.noRecordedCosts) && <p role="status" className="text-[10px] font-semibold text-amber-700">{data.costsMissing ? text.missing : text.zero}</p>}
    {expanded && <div data-testid="closing-profit-waterfall" className="space-y-2 rounded-xl bg-slate-50 p-3">
      <h4 className="text-xs font-bold">{text.more}</h4>
      {chartReady ? <><svg viewBox="0 0 320 110" className="h-28 w-full" role="img" aria-label={text.more} dir="ltr"><title>{bars.map(b => `${b.label}: ${signed(b.value)}`).join('; ')}</title><line x1="0" y1={y(0)} x2="320" y2={y(0)} stroke="#94a3b8" />{bars.map((bar, i) => <g key={bar.label}><rect x={i * 80 + 12} y={Math.min(y(bar.start), y(bar.end))} width="56" height={Math.max(1, Math.abs(y(bar.start) - y(bar.end)))} fill={bar.color} rx="2" /><text x={i * 80 + 40} y="106" textAnchor="middle" fontSize="10" fill="#334155">{signed(bar.value)}</text></g>)}</svg><div className="grid grid-cols-4 gap-1 text-center text-[10px]" dir="ltr">{bars.map(bar => <span key={bar.label}>{bar.label}</span>)}</div></> : <p className="text-xs text-amber-700">{text.missing}</p>}
      <p className="text-[10px] leading-5 text-muted-foreground">{text.note}</p>
      <p className="text-[10px] font-semibold text-muted-foreground">{text.basis}</p>
      {points.length > 0 && <details><summary className="min-h-11 cursor-pointer text-xs font-bold text-blue-700">{text.history}</summary><dl className="space-y-1 text-xs">{points.map(point => <div key={point.date} className="flex justify-between gap-2"><dt>{point.date}</dt><dd dir="ltr">{money(point.value)}</dd></div>)}</dl></details>}
    </div>}
  </section>;
}
