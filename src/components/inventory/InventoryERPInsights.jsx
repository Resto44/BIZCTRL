import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlertTriangle, Bell, Boxes, CheckCircle2, CircleOff, Package, Pencil, Search, ShoppingCart, Trash2, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  computeInventoryInsights, inventoryItemActivity, inventoryRecordDate, riyadhISODate,
} from '@/lib/inventoryTrendAnalytics';

const PERIODS = ['day', 'week', 'month', 'quarter', 'half', 'year'];
const COPY = {
  en: {
    title: 'Inventory intelligence', intro: 'Real purchase and waste records. Current balances are not filtered by date.',
    periods: ['Today', 'Week', 'Month', '3 months', '6 months', 'Year'],
    current: 'Current snapshot', movementPeriod: 'Movement period', days: 'days',
    items: 'Stock items', healthy: 'Above minimum', low: 'Low stock', out: 'Out of stock',
    purchases: 'Purchase rows', waste: 'Waste rows', overview: 'Overview', movement: 'Movements',
    alerts: 'Alerts', trend: 'Purchase and waste activity', countNote: 'Number of recorded rows (not mixed-unit quantity)',
    stockState: 'Stock health', byBranch: 'Branch risk comparison', status: 'Status', total: 'Items',
    productList: 'Stock register', find: 'Search product or branch', all: 'All', lowOnly: 'Below minimum',
    okOnly: 'Healthy', noItems: 'No stock records for this scope.', noActivity: 'No recorded activity in this period.',
    item: 'Product', branch: 'Branch', quantity: 'On hand', minimum: 'Minimum', edit: 'Edit stock',
    detail: 'Item analysis', boughtQty: 'Purchased quantity', wasteQty: 'Wasted quantity',
    purchaseEvents: 'Purchase rows', wasteEvents: 'Waste rows', unit: 'Unit',
    action: 'Reorder priorities', noneLow: 'No items at or below the minimum.',
    sourceLimit: 'Activity may be incomplete: a query reached the 2,000-row cap.',
    limitation: 'Sales usage is not yet linked to the stock ledger. Inventory turnover, COGS and historical stock value cannot be calculated reliably here.',
    rangeLabel: 'Rolling period', itemNote: 'Quantities use the item unit recorded by the source; verify unit conversions before relying on totals.',
    date: 'Date', type: 'Movement', recordedQty: 'Recorded quantity', latest: 'Latest 40 rows',
    bought: 'Purchase', wasted: 'Waste', showAll: 'All items', note: 'Low-stock status is based on the current balance.',
  },
  ar: {
    title: 'ذكاء المخزون والتحليلات', intro: 'تحليلات مبنية على سجلات الشراء والهدر الفعلية. الرصيد الحالي لا يتغير بتغيير الفترة.',
    periods: ['اليوم', 'الأسبوع', 'الشهر', '٣ أشهر', '٦ أشهر', 'السنة'],
    current: 'الرصيد الحالي', movementPeriod: 'فترة الحركات', days: 'يوم',
    items: 'أصناف المخزون', healthy: 'فوق الحد الأدنى', low: 'مخزون منخفض', out: 'نفاد المخزون',
    purchases: 'سجلات الشراء', waste: 'سجلات الهدر', overview: 'نظرة عامة', movement: 'الحركات',
    alerts: 'التنبيهات', trend: 'اتجاه المشتريات والهدر', countNote: 'عدد السجلات وليس جمع كميات بوحدات مختلفة',
    stockState: 'حالة المخزون', byBranch: 'مخاطر المخزون حسب الفرع', status: 'الحالة', total: 'الأصناف',
    productList: 'سجل الأصناف', find: 'ابحث عن صنف أو فرع', all: 'الكل', lowOnly: 'تحت الحد', okOnly: 'سليم',
    noItems: 'لا توجد أصناف مخزون ضمن هذا النطاق.', noActivity: 'لا توجد حركات مسجلة خلال هذه الفترة.',
    item: 'الصنف', branch: 'الفرع', quantity: 'الرصيد', minimum: 'الحد الأدنى', edit: 'تعديل المخزون',
    detail: 'تحليل الصنف', boughtQty: 'كمية المشتريات', wasteQty: 'كمية الهدر',
    purchaseEvents: 'سجلات الشراء', wasteEvents: 'سجلات الهدر', unit: 'الوحدة',
    action: 'أولويات إعادة الطلب', noneLow: 'لا توجد أصناف عند الحد الأدنى أو تحته.',
    sourceLimit: 'قد تكون الحركات غير مكتملة: وصل الاستعلام إلى حد ٢٠٠٠ سجل.',
    limitation: 'استهلاك المبيعات غير مربوط بدفتر المخزون بعد. لا يمكن عرض دوران المخزون أو تكلفة البضاعة المباعة أو القيمة التاريخية بثقة.',
    rangeLabel: 'فترة متحركة', itemNote: 'الكميات حسب الوحدة المسجلة للصنف؛ يلزم التحقق من تحويلات الوحدات قبل الاعتماد على الإجماليات.',
    date: 'التاريخ', type: 'الحركة', recordedQty: 'الكمية المسجلة', latest: 'آخر ٤٠ حركة',
    bought: 'شراء', wasted: 'هدر', showAll: 'جميع الأصناف', note: 'حالة النقص تُحسب من الرصيد الحالي.',
  },
  fa: {
    title: 'هوش موجودی و تحلیل انبار', intro: 'تحلیل بر اساس رکوردهای واقعی خرید و ضایعات؛ موجودی فعلی با فیلتر زمان تغییر نمی‌کند.',
    periods: ['امروز', 'هفته', 'ماه', '۳ ماه', '۶ ماه', 'سال'],
    current: 'موجودی فعلی', movementPeriod: 'دورهٔ حرکت', days: 'روز',
    items: 'اقلام انبار', healthy: 'بالاتر از حداقل', low: 'موجودی کم', out: 'موجودی صفر',
    purchases: 'رکوردهای خرید', waste: 'رکوردهای ضایعات', overview: 'نمای کلی', movement: 'گردش انبار',
    alerts: 'هشدارها', trend: 'روند خرید و ضایعات', countNote: 'تعداد رکوردها؛ نه جمع مقدار با واحدهای متفاوت',
    stockState: 'وضعیت موجودی', byBranch: 'مقایسهٔ ریسک شعبه‌ها', status: 'وضعیت', total: 'اقلام',
    productList: 'فهرست موجودی', find: 'جست‌وجوی کالا یا شعبه', all: 'همه', lowOnly: 'کمبود', okOnly: 'مناسب',
    noItems: 'هیچ رکورد موجودی در این محدوده نیست.', noActivity: 'در این دوره رکوردی موجود نیست.',
    item: 'کالا', branch: 'شعبه', quantity: 'موجودی', minimum: 'حداقل', edit: 'ویرایش موجودی',
    detail: 'تحلیل کالا', boughtQty: 'مقدار خرید', wasteQty: 'مقدار ضایعات',
    purchaseEvents: 'رکورد خرید', wasteEvents: 'رکورد ضایعات', unit: 'واحد',
    action: 'اولویت‌های سفارش', noneLow: 'کالایی در حداقل یا پایین‌تر نیست.',
    sourceLimit: 'ممکن است گردش انبار ناقص باشد: محدودیت ۲۰۰۰ رکورد پر شده است.',
    limitation: 'مصرف ناشی از فروش هنوز به دفتر موجودی وصل نشده است؛ گردش واقعی موجودی، بهای تمام‌شده و ارزش تاریخی قابل اتکا نیست.',
    rangeLabel: 'دورهٔ شناور', itemNote: 'مقدارها با واحد ثبت‌شدهٔ کالا نمایش می‌شوند؛ تبدیل واحدها باید بررسی شود.',
    date: 'تاریخ', type: 'حرکت', recordedQty: 'مقدار ثبت‌شده', latest: '۴۰ رکورد اخیر',
    bought: 'خرید', wasted: 'ضایعات', showAll: 'تمام اقلام', note: 'هشدار کمبود براساس موجودی فعلی است.',
  },
};

const numberText = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const keyOf = item => String(item.product_id) + '::' + String(item.branch_id || item.branch || '');

export default function InventoryERPInsights({ lang = 'en', liveStock = [], purchases = [], wastage = [], branchLabel, onEdit }) {
  const t = COPY[lang] || COPY.en;
  const [period, setPeriod] = useState('month');
  const [tab, setTab] = useState('overview');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [chosen, setChosen] = useState(null);
  const insights = useMemo(() => computeInventoryInsights(liveStock, purchases, wastage, {
    period, todayISO: riyadhISODate(),
  }), [liveStock, purchases, wastage, period]);
  const filtered = useMemo(() => liveStock.filter(item => {
    const label = String(item.product_name || item.product_id || '') + ' ' + String(item.branch || '');
    return label.toLocaleLowerCase().includes(query.toLocaleLowerCase())
      && (status === 'all' || (status === 'low' ? item.isLow : !item.isLow));
  }), [liveStock, query, status]);
  const selected = liveStock.find(item => keyOf(item) === chosen);
  const selectedActivity = selected ? inventoryItemActivity(insights, selected) : null;

  const recentMovements = useMemo(() => {
    const within = row => {
      const date = inventoryRecordDate(row);
      return Boolean(date && date >= insights.window.from && date <= insights.window.to);
    };
    return [
      ...purchases.filter(within).map(row => ({ ...row, kind: 'bought' })),
      ...wastage.filter(within).map(row => ({ ...row, kind: 'wasted' })),
    ].sort((a, b) => String(inventoryRecordDate(b) || '').localeCompare(String(inventoryRecordDate(a) || ''))).slice(0, 40);
  }, [purchases, wastage, insights.window.from, insights.window.to]);

  const tiles = [
    { title: t.items, value: insights.itemsCount, icon: Boxes, tone: 'from-blue-50 to-white text-blue-700', scope: t.current },
    { title: t.healthy, value: insights.itemsCount - insights.lowCount, icon: CheckCircle2, tone: 'from-emerald-50 to-white text-emerald-700', scope: t.current },
    { title: t.low, value: insights.lowCount, icon: AlertTriangle, tone: 'from-amber-50 to-white text-amber-700', scope: t.current },
    { title: t.out, value: insights.outCount, icon: CircleOff, tone: 'from-rose-50 to-white text-rose-700', scope: t.current },
    { title: t.purchases, value: insights.incomingCount, icon: ShoppingCart, tone: 'from-cyan-50 to-white text-cyan-700', scope: t.movementPeriod },
    { title: t.waste, value: insights.wasteCount, icon: Trash2, tone: 'from-violet-50 to-white text-violet-700', scope: t.movementPeriod },
  ];
  const statuses = [
    { name: t.healthy, value: insights.itemsCount - insights.lowCount, color: '#10b981' },
    { name: t.low, value: Math.max(0, insights.lowCount - insights.outCount), color: '#f59e0b' },
    { name: t.out, value: insights.outCount, color: '#ef4444' },
  ];

  return (
    <div className="space-y-4" dir={lang === 'en' ? 'ltr' : 'rtl'}>
      <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-white p-3 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-slate-900"><Activity className="h-5 w-5 text-blue-600" /><h2 className="text-lg sm:text-xl font-bold">{t.title}</h2></div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">{t.intro}</p>
          </div>
          <div className="text-xs text-slate-500 rounded-xl border bg-white px-3 py-2">
            <span className="font-semibold text-slate-700">{t.rangeLabel}:</span> {insights.window.from} — {insights.window.to}
            <span className="block">{insights.window.days} {t.days}</span>
          </div>
        </div>
        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={t.movementPeriod}>
          {PERIODS.map((key, index) => (
            <Button key={key} size="sm" variant={period === key ? 'default' : 'outline'}
              className={'shrink-0 rounded-xl text-xs sm:text-sm ' + (period === key ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-white')}
              aria-pressed={period === key} onClick={() => setPeriod(key)}>{t.periods[index]}</Button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {tiles.map(tile => {
          const Icon = tile.icon;
          return (
            <Card key={tile.title} className={'min-w-0 bg-gradient-to-br p-3 sm:p-4 border-slate-100 ' + tile.tone}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-semibold leading-5">{tile.title}</span>
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold tabular-nums mt-2">{numberText(tile.value)}</p>
              <p className="text-[10px] text-slate-500 mt-2">{tile.scope}</p>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 border-b" role="tablist" aria-label={t.title}>
        {[['overview', t.overview, TrendingUp], ['movement', t.movement, Activity], ['alerts', t.alerts, Bell]].map(([id, text, Icon]) => (
          <Button key={id} role="tab" aria-selected={tab === id} variant={tab === id ? 'default' : 'ghost'}
            className={'shrink-0 gap-1 rounded-b-none ' + (tab === id ? 'bg-slate-900 text-white hover:bg-slate-800' : '')}
            size="sm" onClick={() => setTab(id)}><Icon className="h-4 w-4" />{text}</Button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          <Card className="p-3 sm:p-4 lg:col-span-3">
            <h3 className="font-bold text-sm sm:text-base">{t.trend}</h3>
            <p className="text-xs text-muted-foreground mt-1">{t.countNote}</p>
            <div className="mt-4 h-52 sm:h-64" dir="ltr">
              {insights.incomingCount + insights.wasteCount ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={insights.series} margin={{ top: 10, right: 6, left: -30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={value => String(value).slice(5)} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip labelFormatter={(value, payload) => {
                      const point = payload?.[0]?.payload;
                      return point && point.end !== value ? value + ' – ' + point.end : value;
                    }} />
                    <Bar name={t.purchases} dataKey="purchases" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={34} />
                    <Bar name={t.waste} dataKey="waste" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t.noActivity}</div>}
            </div>
            <div className="flex flex-wrap justify-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-600" />{t.purchases}</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500" />{t.waste}</span>
            </div>
          </Card>
          <Card className="p-3 sm:p-4 lg:col-span-2">
            <h3 className="font-bold text-sm sm:text-base">{t.stockState}</h3>
            {insights.itemsCount ? (
              <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-3 mt-2">
                <div className="h-44 w-44 shrink-0" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={statuses.filter(s => s.value > 0)} dataKey="value" nameKey="name" innerRadius={46} outerRadius={74} paddingAngle={3}>
                      {statuses.filter(s => s.value > 0).map(s => <Cell key={s.name} fill={s.color} />)}
                    </Pie><Tooltip /></PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full space-y-3 text-sm">
                  {statuses.map(s => (
                    <div key={s.name} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}</span>
                      <strong className="tabular-nums">{numberText(s.value)}</strong>
                    </div>
                  ))}
                  <div className="text-xs text-slate-500 border-t pt-2">{numberText(insights.lowPercent)}% {t.low}</div>
                </div>
              </div>
            ) : <div className="py-12 text-sm text-center text-muted-foreground">{t.noItems}</div>}
          </Card>
          <Card className="p-3 sm:p-4 lg:col-span-5">
            <h3 className="font-bold text-sm sm:text-base mb-3">{t.byBranch}</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {insights.branches.map(b => {
                const pct = b.items ? (b.low / b.items) * 100 : 0;
                return (
                  <div key={b.key} className="p-3 rounded-xl bg-slate-50 border">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <strong className="truncate">{branchLabel ? branchLabel(b.label) : b.label}</strong>
                      <span className="tabular-nums text-slate-600">{b.low}/{b.items} {t.low}</span>
                    </div>
                    <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: Math.min(100, pct) + '%' }} />
                    </div>
                  </div>
                );
              })}
              {!insights.branches.length && <p className="text-sm text-muted-foreground">{t.noItems}</p>}
            </div>
          </Card>
        </div>
      )}

      {tab === 'movement' && (
        <Card className="p-3 sm:p-4">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
            <h3 className="font-bold">{t.movement} · {t.latest}</h3>
            <span className="text-xs text-slate-500">{insights.window.from} — {insights.window.to}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-start">
              <thead className="bg-slate-50 text-slate-500">
                <tr>{[t.date, t.item, t.branch, t.type, t.recordedQty].map(s => <th key={s} className="p-2 text-start font-semibold whitespace-nowrap">{s}</th>)}</tr>
              </thead>
              <tbody>
                {recentMovements.map((row, i) => (
                  <tr key={String(row.id || i) + '-' + row.kind} className="border-t">
                    <td className="p-2 whitespace-nowrap">{inventoryRecordDate(row)}</td>
                    <td className="p-2">{row.product_name || row.product_id || '—'}</td>
                    <td className="p-2">{branchLabel ? branchLabel(row.branch) : row.branch || '—'}</td>
                    <td className={'p-2 font-medium ' + (row.kind === 'bought' ? 'text-emerald-600' : 'text-orange-600')}>{t[row.kind]}</td>
                    <td className="p-2 font-semibold tabular-nums">{numberText(row.qty ?? row.quantity)} {row.unit || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!recentMovements.length && <p className="text-center text-sm text-muted-foreground py-8">{t.noActivity}</p>}
          </div>
        </Card>
      )}

      {tab === 'alerts' && (
        <Card className="p-3 sm:p-4">
          <h3 className="font-bold flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />{t.action}</h3>
          <p className="text-xs text-slate-500 mt-1">{t.note}</p>
          <div className="mt-3 grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {insights.atRisk.map(item => (
              <div key={keyOf(item)} className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{item.product_name || item.product_id}</div>
                  <p className="text-xs text-slate-500">{branchLabel ? branchLabel(item.branch) : item.branch}</p>
                  <p className="text-xs mt-1"><strong className="text-rose-600">{numberText(item.currentStock)} {item.unit}</strong> / {t.minimum}: {numberText(item.low_stock_threshold)}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => onEdit(item)}><Pencil className="w-4 h-4" /></Button>
              </div>
            ))}
            {!insights.atRisk.length && <p className="py-6 text-sm text-muted-foreground">{t.noneLow}</p>}
          </div>
        </Card>
      )}

      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="font-bold text-base flex items-center gap-2"><Package className="h-5 w-5 text-blue-600" />{t.productList}</h3>
          <div className="flex flex-wrap gap-1.5">
            {[['all', t.all], ['low', t.lowOnly], ['ok', t.okOnly]].map(([id, label]) => (
              <Button key={id} size="sm" variant={status === id ? 'default' : 'outline'}
                className={status === id ? 'bg-blue-600' : ''} onClick={() => setStatus(id)}>{label}</Button>
            ))}
          </div>
        </div>
        <div className="relative mb-3">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-slate-400" />
          <Input className="ps-9" value={query} onChange={event => setQuery(event.target.value)} placeholder={t.find} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(item => {
            const active = chosen === keyOf(item);
            return (
              <div key={keyOf(item)} className={'rounded-xl border p-3 transition-colors ' + (active ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 bg-white')}>
                <div className="flex items-center gap-2">
                  <div className={'h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ' + (item.isLow ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600')}>
                    {item.isLow ? <AlertTriangle className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                  </div>
                  <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setChosen(active ? null : keyOf(item))} aria-expanded={active}>
                    <p className="font-semibold text-sm truncate">{item.product_name || item.product_id}</p>
                    <p className="text-xs text-muted-foreground truncate">{branchLabel ? branchLabel(item.branch) : item.branch} · {item.unit}</p>
                  </button>
                  <div className="text-end shrink-0">
                    <strong className={'text-base tabular-nums ' + (item.isLow ? 'text-rose-600' : 'text-emerald-600')}>{numberText(item.currentStock)}</strong>
                    <p className="text-[10px] text-muted-foreground">{t.minimum}: {numberText(item.low_stock_threshold)}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="shrink-0" onClick={() => onEdit(item)} aria-label={t.edit}><Pencil className="h-4 w-4" /></Button>
                </div>
                {active && selectedActivity && (
                  <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-white p-2 border"><span className="text-slate-500">{t.boughtQty}</span><p className="font-bold mt-1">{numberText(selectedActivity.purchasedQty)} {item.unit}</p></div>
                    <div className="rounded-lg bg-white p-2 border"><span className="text-slate-500">{t.wasteQty}</span><p className="font-bold mt-1">{numberText(selectedActivity.wastedQty)} {item.unit}</p></div>
                    <div className="text-slate-500">{t.purchaseEvents}: {selectedActivity.purchaseEvents}</div>
                    <div className="text-slate-500">{t.wasteEvents}: {selectedActivity.wasteEvents}</div>
                    <p className="col-span-2 text-[11px] text-slate-500">{t.itemNote}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!filtered.length && <div className="text-center py-8 text-sm text-muted-foreground">{t.noItems}</div>}
      </Card>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
        <p>{t.limitation}</p>
        {insights.limited && <p className="font-semibold mt-2">{t.sourceLimit}</p>}
      </div>
    </div>
  );
}
