import React from 'react';
import { closingFinancialAnalysis } from '@/lib/closingHistoryAnalytics';

const COPY = {
  en: { fixed: 'Fixed costs · allocated', variable: 'Variable expenses', splitMissing: 'Fixed / variable breakdown unavailable in this saved closing.', mismatch: 'Expense breakdown does not match the saved total. Review this closing.', fixedZero: 'Saved fixed allocation is zero; this does not verify monthly rent and salaries. Check setup and this closing.' , provisional: 'Before confirmation of fixed-cost coverage', allocationNote: 'Fixed costs are the saved daily allocation of monthly rent, salaries and other fixed costs. Variable costs are recorded daily needs. Paying a fixed bill changes cash; do not record it again as a variable expense.', sales: 'Sales', purchases: 'Purchases / materials', expenses: 'Operating expenses', gross: 'Sales less purchases', net: 'Operating result (est.)', margin: 'Margin (est.)', trend: 'Available similar shifts', previous: 'Compared with', missing: 'Cost data incomplete', zero: 'No recorded costs · profit unverified', unavailable: 'Not enough comparable history', basis: 'Same branch, shift and cashier · finalized records available', more: 'Sales to estimated profit', note: 'Gross = sales − purchases; net = gross − operating expenses. Purchase-basis estimate, not actual inventory COGS. Funding and drawer variance are separate.', history: 'Trend values' },
  fa: { fixed: 'سهم مصارف ثابت', variable: 'مصارف متغیر', splitMissing: 'تفکیک ثابت و متغیر در این کلوزینگ موجود نیست.', mismatch: 'تفکیک مصارف با جمع ذخیره‌شده مطابقت ندارد؛ کلوزینگ بررسی شود.', fixedZero: 'سهم ثابت ذخیره‌شده صفر است؛ پوشش کرایه و معاش تأیید نشده. تنظیمات و این کلوزینگ بررسی شود.', provisional: 'قبل از تأیید پوشش مصارف ثابت', allocationNote: 'مصارف ثابت، سهم روزانه ذخیره‌شده از کرایه، معاش و سایر مصارف ماهانه است. مصارف متغیر، ضروریات ثبت‌شده روز است. پرداخت مصرف ثابت نقد را کم می‌کند؛ آن را دوباره مصرف متغیر ثبت نکنید.', sales: 'فروش', purchases: 'خرید / مواد خام', expenses: 'مصارف عملیاتی', gross: 'فروش منهای خرید', net: 'نتیجه عملیاتی تخمینی', margin: 'حاشیه تخمینی', trend: 'روند شیفت‌های مشابه موجود', previous: 'مقایسه با', missing: 'هزینه ناقص', zero: 'هزینه ثبت نشده؛ فایده تأیید نشده', unavailable: 'سابقه مشابه کافی نیست', basis: 'همان شعبه، شیفت و صندوق‌دار؛ سوابق نهایی موجود', more: 'از فروش تا فایده تخمینی', note: 'ناخالص = فروش − خرید؛ خالص = ناخالص − مصارف عملیاتی. تخمین بر مبنای خرید است، نه بهای واقعی کالای فروخته‌شده. تمویل و اختلاف صندوق جدا هستند.', history: 'ارقام روند' },
  ar: { fixed: 'نصيب التكاليف الثابتة', variable: 'المصاريف المتغيرة', splitMissing: 'تفصيل الثابت والمتغير غير متاح في هذا الإقفال.', mismatch: 'تفصيل المصروفات لا يطابق الإجمالي المحفوظ؛ راجع الإقفال.', fixedZero: 'النصيب الثابت المحفوظ صفر؛ لا يؤكد تغطية الإيجار والرواتب. راجع الإعدادات والإقفال.', provisional: 'قبل تأكيد تغطية التكاليف الثابتة', allocationNote: 'الثابت هو النصيب اليومي المحفوظ من الإيجار والرواتب والتكاليف الشهرية. المتغير هو الاحتياجات اليومية المسجلة. سداد فاتورة ثابتة يخفض النقد؛ لا تسجلها مرة أخرى كمصروف متغير.', sales: 'المبيعات', purchases: 'المشتريات / المواد', expenses: 'مصاريف التشغيل', gross: 'المبيعات ناقص المشتريات', net: 'نتيجة تشغيلية تقديرية', margin: 'هامش تقديري', trend: 'الورديات المماثلة المتاحة', previous: 'مقارنة مع', missing: 'تكاليف غير مكتملة', zero: 'لا تكاليف مسجلة؛ الربح غير مؤكد', unavailable: 'لا يوجد سجل مماثل كافٍ', basis: 'نفس الفرع والوردية وأمين الصندوق؛ السجلات النهائية المتاحة', more: 'من المبيعات إلى الربح التقديري', note: 'الإجمالي = المبيعات − المشتريات؛ الصافي = الإجمالي − مصاريف التشغيل. تقدير على أساس المشتريات وليس تكلفة البضاعة المباعة الفعلية. التمويل وفروق الصندوق منفصلة.', history: 'قيم الاتجاه' },
};
const amount = value => value == null ? '—' : (Number(value) === 0 ? 0 : Number(value)).toLocaleString('en-US', { maximumFractionDigits: 2 });
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
  const splitReady = data.expenseBreakdownComplete && !data.expenseBreakdownMismatch;
  const provisional = !splitReady || data.fixedExpenses === 0;
  const resultColor = data.netProfit < 0 ? '#dc2626' : provisional ? '#b45309' : '#059669';
  const afterFixed = splitReady ? data.grossProfit - data.fixedExpenses : data.grossProfit;
  const levels = chartReady ? [0, data.sales, data.grossProfit, afterFixed, data.netProfit] : [0];
  const low = Math.min(...levels), high = Math.max(...levels), range = high - low || 1;
  const y = value => 90 - (value - low) / range * 80;
  const bars = chartReady ? [
    { label: text.sales, start: 0, end: data.sales, value: data.sales, color: '#2563eb' },
    { label: text.purchases, start: data.sales, end: data.grossProfit, value: -data.purchases, color: '#2563eb' },
    ...(splitReady ? [
      { label: text.fixed, start: data.grossProfit, end: afterFixed, value: -data.fixedExpenses, color: '#8b5cf6' },
      { label: text.variable, start: afterFixed, end: data.netProfit, value: -data.variableExpenses, color: '#e11d48' },
    ] : [{ label: text.expenses, start: data.grossProfit, end: data.netProfit, value: -data.operatingExpenses, color: '#e11d48' }]),
    { label: text.net, start: 0, end: data.netProfit, value: data.netProfit, color: resultColor },
  ] : [];
  const shares = data.allocation && (splitReady ? [data.purchases,data.fixedExpenses,data.variableExpenses,data.netProfit].map(value=>value/data.sales*100) : data.allocation);
  const shareLabels = splitReady ? [text.purchases,text.fixed,text.variable,text.net] : [text.purchases,text.expenses,text.net];
  const shareColors = splitReady ? ['#2563eb','#8b5cf6','#e11d48',resultColor] : ['#2563eb','#e11d48',resultColor];
  return <section data-testid="closing-history-analytics" data-i18n-skip="true" dir={lang === 'en' ? 'ltr' : 'rtl'} className="mt-2 space-y-2 border-t border-border/70 pt-2">
    <div className="grid min-w-0 grid-cols-2 items-center gap-3">
      <div className="min-w-0"><p className="text-xs text-muted-foreground">{text.sales} <span className="text-[10px]">({currency})</span></p><p dir="ltr" className="break-words text-start text-xl font-black tabular-nums text-blue-700">{amount(data.sales)}</p>
        <p dir="ltr" style={{unicodeBidi:'isolate'}} className={`text-xs font-bold ${trend?.change == null ? 'text-muted-foreground' : trend.change < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{trend?.change == null ? '—' : `${trend.change > 0 ? '+' : ''}${trend.change.toFixed(1)}%`}</p>
        {trend?.previous && <p className="text-[10px] text-muted-foreground">{text.previous} <bdi>{trend.previous.date}</bdi></p>}
      </div>
      <div className="min-w-0"><p className="text-[10px] text-muted-foreground">{text.trend} ({points.length}/7)</p>{points.length >= 2 ? <Sparkline points={points} label={text.trend} /> : <p className="py-3 text-[10px] text-muted-foreground">{text.unavailable}</p>}</div>
    </div>
    <div data-testid="closing-three-cost-types" className="grid grid-cols-2 gap-2 border-y border-border/60 py-2 sm:grid-cols-4">
      {[[text.purchases,data.purchases],[text.fixed,splitReady?data.fixedExpenses:null],[text.variable,splitReady?data.variableExpenses:null],[text.net,data.netProfit]].map(([label,value],i)=><div key={label} className={`min-w-0 rounded-xl p-2 ${['bg-blue-50','bg-violet-50','bg-rose-50',provisional?'bg-amber-50':'bg-emerald-50'][i]} dark:bg-slate-900`}><p className="text-[10px] leading-4 text-muted-foreground">{label}</p><p dir="ltr" className={`break-words text-start text-xs font-black tabular-nums sm:text-sm ${i===3?(value<0?'text-red-700':provisional?'text-amber-700':'text-emerald-700'):''}`}>{i===3?profitMoney(value):money(value)}</p></div>)}
    </div>
    {provisional && data.netProfit !== null && <p data-testid="closing-result-provisional" className="text-[10px] font-bold text-amber-800">{text.provisional}</p>}
    {!splitReady&&<p role="status" className="text-[10px] font-semibold text-amber-700">{data.expenseBreakdownMismatch?text.mismatch:text.splitMissing} {text.expenses}: <bdi>{money(data.operatingExpenses)}</bdi></p>}
    {splitReady&&data.fixedExpenses===0&&<p role="status" className="text-[10px] text-amber-700">{text.fixedZero}</p>}
    <div className="flex flex-wrap justify-between gap-2 text-[10px]"><span>{text.gross}: <bdi dir="ltr" className="font-bold">{profitMoney(data.grossProfit)}</bdi></span><span>{text.margin}: <bdi dir="ltr" className="font-bold">{data.margin == null ? '—' : `${data.margin.toFixed(1)}%`}</bdi></span></div>
    {shares && <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={shareLabels.map((label,i)=>`${label} ${shares[i].toFixed(1)}%`).join("; ")} dir="ltr">{shares.map((value, i) => <span key={i} style={{ width: `${value}%`, background: shareColors[i] }} />)}</div>}
    {shares && <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">{shareLabels.map((label, i) => <span key={label}><i className="mx-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: shareColors[i] }} />{label} <bdi dir="ltr">{shares[i].toFixed(0)}%</bdi></span>)}</div>}
    {(data.costsMissing || data.noRecordedCosts) && <p role="status" className="text-[10px] font-semibold text-amber-700">{data.costsMissing ? text.missing : text.zero}</p>}
    {expanded && <div data-testid="closing-profit-waterfall" className="space-y-2 rounded-xl bg-slate-50 p-3">
      <h4 className="text-xs font-bold">{text.more}</h4>
      {chartReady ? <><svg viewBox="0 0 320 110" className="h-28 w-full" role="img" aria-label={text.more} dir="ltr"><title>{bars.map(b => `${b.label}: ${signed(b.value)}`).join('; ')}</title><line x1="0" y1={y(0)} x2="320" y2={y(0)} stroke="#94a3b8" />{bars.map((bar, i) => <g key={bar.label}><rect x={i * (320/bars.length) + 8} y={Math.min(y(bar.start), y(bar.end))} width={320/bars.length-16} height={Math.max(1, Math.abs(y(bar.start) - y(bar.end)))} fill={bar.color} rx="2" /><text direction="ltr" style={{direction:'ltr',unicodeBidi:'bidi-override'}} x={(i+0.5)*(320/bars.length)} y="106" textAnchor="middle" fontSize="10" fill="#334155">{signed(bar.value)}</text></g>)}</svg><div className="grid gap-1 text-center text-[10px]" style={{gridTemplateColumns:`repeat(${bars.length},minmax(0,1fr))`}} dir="ltr">{bars.map(bar => <span key={bar.label}>{bar.label}</span>)}</div></> : <p className="text-xs text-amber-700">{text.missing}</p>}
      <p className="text-[10px] leading-5 text-muted-foreground">{text.allocationNote}</p>
      <p className="text-[10px] leading-5 text-muted-foreground">{text.note}</p>
      <p className="text-[10px] font-semibold text-muted-foreground">{text.basis}</p>
      {points.length > 0 && <details><summary className="min-h-11 cursor-pointer text-xs font-bold text-blue-700">{text.history}</summary><dl className="space-y-1 text-xs">{points.map(point => <div key={point.date} className="flex justify-between gap-2"><dt>{point.date}</dt><dd dir="ltr">{money(point.value)}</dd></div>)}</dl></details>}
    </div>}
  </section>;
}
