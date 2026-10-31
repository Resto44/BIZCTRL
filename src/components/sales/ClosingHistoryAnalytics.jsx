import React from 'react';
import { closingFinancialAnalysis } from '@/lib/closingHistoryAnalytics';

const COPY = {
  en: { fixed: 'Fixed costs · allocated', variable: 'Variable expenses', splitMissing: 'Fixed / variable breakdown unavailable in this saved closing.', mismatch: 'Expense breakdown does not match the saved total. Review this closing.', fixedZero: 'Saved fixed allocation is zero; this does not verify monthly rent and salaries. Check setup and this closing.' , provisional: 'Before confirmation of fixed-cost coverage', allocationNote: 'Fixed costs are the saved daily allocation of monthly rent, salaries and other fixed costs. Variable costs are recorded daily needs. Paying a fixed bill changes cash; do not record it again as a variable expense.', sales: 'Sales', purchases: 'Purchases / materials', expenses: 'Operating expenses', gross: 'Sales less purchases', net: 'Operating result (est.)', margin: 'Margin (est.)', trend: 'Recent closing sessions', previous: 'Compared with', missing: 'Cost data incomplete', zero: 'No recorded costs · profit unverified', unavailable: 'Not enough comparable history', basis: 'Same branch, shift and cashier. Each finalized session is shown separately, even on the same date; session durations may differ.', more: 'Sales to estimated profit', note: 'Gross = sales − purchases; net = gross − operating expenses. Purchase-basis estimate, not actual inventory COGS. Funding and drawer variance are separate.', history: 'Trend values',compactMethod:'Accounting method',chartTitle:'Financial breakdown',estimatedProfit:'Estimated operating result',unverifiedProfit:'Profit not verified',unverifiedHint:'Saved costs are zero or incomplete. Sales are recorded, but profit cannot be confirmed.',costCoverageHint:'Verify purchases and fixed/variable expenses before using the profit estimate.',review:'Cost estimate · details',reviewFixed:'Fixed costs unverified · details',reviewMissing:'Costs incomplete · details',reviewZero:'Profit unverified · details',reviewTitle:'Accounting notes',session:'Closing #' },
  fa: { fixed: 'سهم مصارف ثابت', variable: 'مصارف متغیر', splitMissing: 'تفکیک ثابت و متغیر در این کلوزینگ موجود نیست.', mismatch: 'تفکیک مصارف با جمع ذخیره‌شده مطابقت ندارد؛ کلوزینگ بررسی شود.', fixedZero: 'سهم ثابت ذخیره‌شده صفر است؛ پوشش کرایه و معاش تأیید نشده. تنظیمات و این کلوزینگ بررسی شود.', provisional: 'قبل از تأیید پوشش مصارف ثابت', allocationNote: 'مصارف ثابت، سهم روزانه ذخیره‌شده از کرایه، معاش و سایر مصارف ماهانه است. مصارف متغیر، ضروریات ثبت‌شده روز است. پرداخت مصرف ثابت نقد را کم می‌کند؛ آن را دوباره مصرف متغیر ثبت نکنید.', sales: 'فروش', purchases: 'خرید / مواد خام', expenses: 'مصارف عملیاتی', gross: 'فروش منهای خرید', net: 'نتیجه عملیاتی تخمینی', margin: 'حاشیه تخمینی', trend: 'روند کلوزینگ‌های اخیر', previous: 'مقایسه با', missing: 'هزینه ناقص', zero: 'هزینه ثبت نشده؛ فایده تأیید نشده', unavailable: 'سابقه مشابه کافی نیست', basis: 'فقط همان شعبه، شیفت و صندوق‌دار؛ هر کلوزینگ جدا حساب می‌شود، حتی در یک روز. مدت جلسه‌ها ممکن است متفاوت باشد.', more: 'از فروش تا فایده تخمینی', note: 'ناخالص = فروش − خرید؛ خالص = ناخالص − مصارف عملیاتی. تخمین بر مبنای خرید است، نه بهای واقعی کالای فروخته‌شده. تمویل و اختلاف صندوق جدا هستند.', history: 'ارقام روند',compactMethod:'روش محاسبه',chartTitle:'جزئیات مالی',estimatedProfit:'نتیجه عملیاتی تخمینی',unverifiedProfit:'فایده تأیید نشده',unverifiedHint:'مصارف ثبت‌شده صفر یا ناقص است. فروش ثبت شده اما فایده قابل تأیید نیست.',costCoverageHint:'پیش از تکیه بر فایده، خرید و مصارف ثابت و متغیر را بررسی کنید.',review:'هزینه تخمینی · جزئیات',reviewFixed:'مصارف ثابت تأیید نشده · جزئیات',reviewMissing:'مصارف ناقص · جزئیات',reviewZero:'فایده تأیید نشده · جزئیات',reviewTitle:'توضیحات حسابداری',session:'کلوزینگ #' },
  ar: { fixed: 'نصيب التكاليف الثابتة', variable: 'المصاريف المتغيرة', splitMissing: 'تفصيل الثابت والمتغير غير متاح في هذا الإقفال.', mismatch: 'تفصيل المصروفات لا يطابق الإجمالي المحفوظ؛ راجع الإقفال.', fixedZero: 'النصيب الثابت المحفوظ صفر؛ لا يؤكد تغطية الإيجار والرواتب. راجع الإعدادات والإقفال.', provisional: 'قبل تأكيد تغطية التكاليف الثابتة', allocationNote: 'الثابت هو النصيب اليومي المحفوظ من الإيجار والرواتب والتكاليف الشهرية. المتغير هو الاحتياجات اليومية المسجلة. سداد فاتورة ثابتة يخفض النقد؛ لا تسجلها مرة أخرى كمصروف متغير.', sales: 'المبيعات', purchases: 'المشتريات / المواد', expenses: 'مصاريف التشغيل', gross: 'المبيعات ناقص المشتريات', net: 'نتيجة تشغيلية تقديرية', margin: 'هامش تقديري', trend: 'اتجاه الإقفالات الأخيرة', previous: 'مقارنة مع', missing: 'تكاليف غير مكتملة', zero: 'لا تكاليف مسجلة؛ الربح غير مؤكد', unavailable: 'لا يوجد سجل مماثل كافٍ', basis: 'نفس الفرع والوردية والكاشير؛ كل إقفال يُحسب مستقلاً حتى في نفس اليوم، وقد تختلف مدة الجلسات.', more: 'من المبيعات إلى الربح التقديري', note: 'الإجمالي = المبيعات − المشتريات؛ الصافي = الإجمالي − مصاريف التشغيل. تقدير على أساس المشتريات وليس تكلفة البضاعة المباعة الفعلية. التمويل وفروق الصندوق منفصلة.', history: 'قيم الاتجاه',compactMethod:'طريقة الحساب',chartTitle:'التفاصيل المالية',estimatedProfit:'النتيجة التشغيلية التقديرية',unverifiedProfit:'الربح غير مؤكد',unverifiedHint:'المصاريف المحفوظة صفر أو غير مكتملة. المبيعات مسجلة ولكن لا يمكن تأكيد الربح.',costCoverageHint:'تحقق من المشتريات والمصاريف الثابتة والمتغيرة قبل الاعتماد على الربح.',review:'تكاليف تقديرية · تفاصيل',reviewFixed:'التكاليف الثابتة غير مؤكدة · التفاصيل',reviewMissing:'التكاليف ناقصة · التفاصيل',reviewZero:'الربح غير مؤكد · التفاصيل',reviewTitle:'ملاحظات محاسبية',session:'إقفال #' },
};
const amount = value => value == null ? '—' : (Number(value) === 0 ? 0 : Number(value)).toLocaleString('en-US', { maximumFractionDigits: 2 });
const signed = value => value == null ? '—' : `${value > 0 ? '+' : ''}${amount(value)}`;

function Sparkline({ points, label }) {
  const values = points.map(point => point.value);
  const low = Math.min(...values), range = Math.max(...values) - low || 1;
  const xy = points.map((point, i) => `${8 + i * 184 / (points.length - 1)},${44 - (point.value - low) * 34 / range}`);
  return <svg viewBox="0 0 200 52" className="h-12 w-full" role="img" aria-label={label} dir="ltr"><title>{points.map(p => `${p.date}${p.session ? ` #${p.session}` : ''}: ${p.value}`).join('; ')}</title><path d={`M ${xy.join(' L ')} L 192,50 L 8,50 Z`} fill="#dbeafe" /><polyline points={xy.join(' ')} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" /><circle cx="192" cy={xy.at(-1).split(',')[1]} r="3" fill="#2563eb" /></svg>;
}

export default function ClosingHistoryAnalytics({ sale, trend, currency = 'SAR', lang = 'en', expanded = false }) {
  const text = COPY[lang] || COPY.en;
  const data = closingFinancialAnalysis(sale);
  const points = trend?.points || [];
  const money = value => value == null ? '—' : `${currency} ${amount(value)}`;
  const profitMoney = value => value == null ? '—' : `${value > 0 ? '+' : ''}${currency} ${amount(value)}`;
  const splitReady = data.expenseBreakdownComplete && !data.expenseBreakdownMismatch;
  const provisional = !splitReady || data.fixedExpenses === 0;
  // A 0-cost closing is not evidence of zero real operating costs.
  // Never draw a positive profit bar or label its figure as confirmed profit.
  const profitVerified = data.sales !== null && data.netProfit !== null &&
    !data.costsMissing && !data.noRecordedCosts && splitReady && !provisional;
  const chartReady = profitVerified;
  const costWarning = data.costsMissing ? text.reviewMissing
    : data.noRecordedCosts ? text.reviewZero
    : provisional ? (data.fixedExpenses === 0 ? text.reviewFixed : text.review)
    : null;
  const resultColor = data.netProfit < 0 ? '#dc2626' : '#059669';
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
        {trend?.previous && <p className="text-[10px] text-muted-foreground">{text.previous} <bdi>{trend.previous.date}{trend.previous.session ? ` · ${text.session}${trend.previous.session}` : ''}</bdi></p>}
      </div>
      <div className="min-w-0"><p className="text-[10px] text-muted-foreground">{text.trend} ({points.length}/7)</p>{points.length >= 2 ? <Sparkline points={points} label={text.trend} /> : <p className="py-3 text-[10px] text-muted-foreground">{text.unavailable}</p>}</div>
    </div>
    <div data-testid="closing-three-cost-types" className="grid grid-cols-2 gap-2 border-y border-border/60 py-2 sm:grid-cols-4">
      {[[text.purchases,data.purchases],[text.fixed,splitReady?data.fixedExpenses:null],[text.variable,splitReady?data.variableExpenses:null],[profitVerified?text.net:text.unverifiedProfit,profitVerified?data.netProfit:null]].map(([label,value],i)=><div key={label} className={`min-w-0 rounded-xl p-2 ${['bg-blue-50','bg-violet-50','bg-rose-50',provisional?'bg-amber-50':'bg-emerald-50'][i]} dark:bg-slate-900`}><p className="text-[10px] leading-4 text-muted-foreground">{label}</p><p dir="ltr" className={`break-words text-start text-xs font-black tabular-nums sm:text-sm ${i===3?(value<0?'text-red-700':provisional?'text-amber-700':'text-emerald-700'):''}`}>{i===3?profitMoney(value):money(value)}</p></div>)}
    </div>
    {costWarning && <details data-testid="closing-history-accounting-notes" className="rounded-lg border border-amber-200/70 bg-amber-50/60 px-2.5 py-1.5 text-[10px] text-amber-900">
      <summary data-testid="closing-result-provisional" className="min-h-7 cursor-pointer font-semibold leading-5">{costWarning}</summary>
      <div className="space-y-1 border-t border-amber-200/50 pt-2 text-[10px] leading-5">
        {provisional && data.netProfit !== null && <p>{text.provisional}</p>}
        {!splitReady&&<p role="status">{data.expenseBreakdownMismatch?text.mismatch:text.splitMissing} {text.expenses}: <bdi>{money(data.operatingExpenses)}</bdi></p>}
        {splitReady&&data.fixedExpenses===0&&<p role="status">{text.fixedZero}</p>}
        {splitReady&&(data.fixedExpenses===0||data.variableExpenses===0)&&<p data-testid="closing-expense-snapshot-date">{lang==='fa'?'ارقام در زمان نهایی‌سازی همین کلوزینگ ذخیره شده‌اند. مصارف روزهای دیگر شامل نیست و ویرایش بعدی کلوزینگ را خودکار تغییر نمی‌دهد.':lang==='ar'?'تم حفظ القيم عند اعتماد هذا الإقفال. المصاريف من أيام أخرى غير مشمولة، والتعديلات اللاحقة لا تعيد كتابة الإقفال.':'Amounts were saved when this closing was finalized. Other dates are excluded; later edits do not rewrite this closing.'}</p>}
        {(data.costsMissing||data.noRecordedCosts)&&<p role="status">{data.costsMissing?text.missing:text.zero}</p>}
      </div>
    </details>}
    <div className="flex flex-wrap justify-between gap-2 text-[10px]"><span>{text.gross}: <bdi dir="ltr" className="font-bold">{profitMoney(data.grossProfit)}</bdi></span><span>{text.margin}: <bdi dir="ltr" className="font-bold">{data.margin == null ? '—' : `${data.margin.toFixed(1)}%`}</bdi></span></div>
    {shares && <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={shareLabels.map((label,i)=>`${label} ${shares[i].toFixed(1)}%`).join("; ")} dir="ltr">{shares.map((value, i) => <span key={i} style={{ width: `${value}%`, background: shareColors[i] }} />)}</div>}
    {shares && <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">{shareLabels.map((label, i) => <span key={label}><i className="mx-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: shareColors[i] }} />{label} <bdi dir="ltr">{shares[i].toFixed(0)}%</bdi></span>)}</div>}
    {expanded && <div data-testid="closing-expanded-analysis" className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 sm:p-3">
      {profitVerified ? <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-slate-700">{text.estimatedProfit}</span>
        <strong dir="ltr" className="tabular-nums text-emerald-700">{profitMoney(data.netProfit)}</strong>
      </div> : <div role="status" data-testid="closing-profit-unverified" className="space-y-0.5 text-xs text-amber-900">
        <p className="font-bold">{text.unverifiedProfit} · —</p>
        <p className="leading-4">{text.unverifiedHint}</p>
      </div>}
      {chartReady && <details data-testid="closing-profit-waterfall" className="rounded-lg border bg-white px-2 py-1">
        <summary className="min-h-9 cursor-pointer py-2 text-xs font-semibold text-blue-700">{text.chartTitle}</summary>
        <div className="border-t pt-2">
          <svg viewBox="0 0 320 110" className="h-24 w-full" role="img" aria-label={text.more} dir="ltr">
            <title>{bars.map(b => `${b.label}: ${signed(b.value)}`).join('; ')}</title>
            <line x1="0" y1={y(0)} x2="320" y2={y(0)} stroke="#94a3b8" />
            {bars.map((bar,i) => <g key={bar.label}>
              <rect x={i*(320/bars.length)+8} y={Math.min(y(bar.start),y(bar.end))} width={320/bars.length-16} height={Math.max(1,Math.abs(y(bar.start)-y(bar.end)))} fill={bar.color} rx="2"/>
              <text x={(i+0.5)*(320/bars.length)} y="106" textAnchor="middle" fontSize="10" fill="#334155">{signed(bar.value)}</text>
            </g>)}
          </svg>
          <div className="grid gap-1 text-center text-[9px]" style={{gridTemplateColumns:`repeat(${bars.length},minmax(0,1fr))`}} dir="ltr">
            {bars.map(bar=><span key={bar.label} className="break-words">{bar.label}</span>)}
          </div>
        </div>
      </details>}
      <details data-testid="closing-accounting-method" className="rounded-lg border bg-white px-2 py-1">
        <summary className="min-h-9 cursor-pointer py-2 text-xs font-semibold text-slate-700">{text.compactMethod}</summary>
        <div className="space-y-1.5 border-t pt-2 text-[11px] leading-4 text-muted-foreground">
          <p>{text.allocationNote}</p><p>{text.note}</p><p>{text.basis}</p>
        </div>
      </details>
      {points.length > 0 && <details data-testid="closing-trend-values" className="rounded-lg border bg-white px-2 py-1">
        <summary className="min-h-9 cursor-pointer py-2 text-xs font-semibold text-blue-700">{text.history} ({points.length})</summary>
        <dl className="space-y-1 border-t pt-2 text-xs">
          {points.map((point,i)=><div key={`${point.date}-${point.session??i}`} className="flex justify-between gap-2">
            <dt>{point.date}{point.session ? ` · ${text.session}${point.session}` : ''}</dt><dd dir="ltr">{money(point.value)}</dd>
          </div>)}
        </dl>
      </details>}
    </div>}
  </section>;
}
