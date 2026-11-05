import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Layers, ListFilter } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { inventoryPeriodWindow, riyadhISODate } from '@/lib/inventoryTrendAnalytics';
import { nextRiyadhDay, retailInventoryMovementSummary } from '@/lib/retailInventoryTrends';
import { Button } from '@/components/ui/button';
import { Panel, Metric, ErrorNotice } from '@/components/retail-inventory/InventoryUI';

const PERIODS = ['day', 'week', 'month', 'quarter', 'half', 'year'];
const LABELS = {
  en: {
    title: 'Inventory movement intelligence', summary: 'Signed stock-ledger events in the selected business period.',
    filters: ['Day', 'Week', 'Month', '3 months', '6 months', 'Year'], inbound: 'Incoming events',
    outbound: 'Outgoing events', total: 'Total events', kinds: 'Event types',
    graph: 'Stock event trends', note: 'Shows movement event counts. Mixed units, internal transfers, and sales are not added as a monetary total.',
    empty: 'No recorded stock movements for this period.', overflow: 'More than 2,000 records exist in this period. Choose a shorter time range to see an accurate trend.',
    scope: 'The movement count follows your tenant, branch and selected warehouse.',
    tooManyProducts: 'Selected warehouse has too many stock positions to filter accurately. Select all warehouses or narrow your scope.',
    loading: 'Loading verified ledger movements…', from: 'From', to: 'to', range: 'Business period', other: 'Other', date: 'Date',
  },
  ar: {
    title: 'تحليلات حركة المخزون', summary: 'الحركات المسجلة في دفتر المخزون ضمن الفترة المختارة.',
    filters: ['اليوم', 'الأسبوع', 'الشهر', '٣ أشهر', '٦ أشهر', 'السنة'], inbound: 'حركات الوارد',
    outbound: 'حركات الصادر', total: 'إجمالي الحركات', kinds: 'أنواع الحركات',
    graph: 'اتجاه حركة المخزون', note: 'الأرقام هي عدد الحركات، ولا نخلط وحدات الأصناف أو التحويلات الداخلية أو المبيعات مع الإيرادات.',
    empty: 'لا توجد حركات مسجلة لهذه الفترة.', overflow: 'توجد أكثر من ٢٠٠٠ حركة. اختر فترة أقصر لعرض اتجاه دقيق دون تقدير.',
    scope: 'تراعي التحليلات المؤسسة والفرع والمستودع المحدد.',
    tooManyProducts: 'المستودع المحدد يحتوي على أرصدة كثيرة. اختر كل المستودعات أو نطاقًا أضيق لتحليل دقيق.',
    loading: 'جارٍ تحميل حركات الدفتر الموثقة…', from: 'من', to: 'إلى', range: 'الفترة', other: 'أخرى', date: 'التاريخ',
  },
  fa: {
    title: 'تحلیل گردش موجودی', summary: 'گردش واقعی ثبت‌شده در دفتر انبار طی دورهٔ انتخابی.',
    filters: ['روز', 'هفته', 'ماه', '۳ ماه', '۶ ماه', 'سال'], inbound: 'رکوردهای ورودی',
    outbound: 'رکوردهای خروجی', total: 'کل حرکت‌ها', kinds: 'نوع حرکت‌ها',
    graph: 'روند حرکت انبار', note: 'تعداد رویدادها نمایش داده می‌شود؛ واحدهای مختلف کالا، انتقال داخلی و فروش به‌عنوان مبلغ جمع نمی‌شوند.',
    empty: 'در این دوره حرکتی ثبت نشده است.', overflow: 'بیش از ۲۰۰۰ حرکت موجود است. برای نمودار دقیق، دورهٔ کوتاه‌تر انتخاب کنید.',
    scope: 'تحلیل بر اساس سازمان، شعبه و انبار انتخاب‌شده محدود می‌شود.',
    tooManyProducts: 'انبار انتخاب‌شده رکوردهای زیادی دارد. همهٔ انبارها یا محدودهٔ کوچک‌تر را انتخاب کنید.',
    loading: 'دریافت حرکت‌های ثبت‌شده…', from: 'از', to: 'تا', range: 'دوره', other: 'سایر', date: 'تاریخ',
  },
};

/** Only authorized SELECTs; RLS is authoritative, not a client-supplied scope. */
async function fetchRetailLedgerForPeriod(ctx, period) {
  const window = inventoryPeriodWindow(period, riyadhISODate());
  let balances = null;
  if (ctx.warehouseId) {
    const { data, error, count } = await supabase.from('retail_inventory_balances')
      .select('id', { count: 'exact' }).eq('restaurant_id', ctx.restaurantId)
      .eq('warehouse_id', ctx.warehouseId).limit(201);
    if (error) throw error;
    if (Number(count) > 200) return { rows: [], limited: true, reason: 'tooManyProducts' };
    balances = (data || []).map(row => row.id);
    if (!balances.length) return { rows: [], limited: false };
  }
  const query = (start, stop) => {
    let q = supabase.from('retail_inventory_ledger')
      .select('id,quantity,kind,created_at', { count: 'exact' })
      .eq('restaurant_id', ctx.restaurantId)
      .gte('created_at', `${window.from}T00:00:00+03:00`)
      .lt('created_at', `${nextRiyadhDay(window.to)}T00:00:00+03:00`)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(start, stop);
    if (ctx.branchId) q = q.eq('branch_id', ctx.branchId);
    if (balances) q = q.in('balance_id', balances);
    return q;
  };
  const first = await query(0, 999);
  if (first.error) throw first.error;
  if (Number(first.count) > 2000) return { rows: [], limited: true, reason: 'overflow' };
  const rows = [...(first.data || [])];
  if (Number(first.count) > 1000) {
    const second = await query(1000, 1999);
    if (second.error) throw second.error;
    rows.push(...(second.data || []));
  }
  // Never present partial charts as if they are complete.
  if (rows.length < Number(first.count || 0)) return { rows: [], limited: true, reason: 'overflow' };
  return { rows, limited: false };
}

export default function RetailInventoryAnalytics({ ctx }) {
  const { lang } = useLanguage();
  const t = LABELS[lang] || LABELS.en;
  const [period, setPeriod] = useState('month');
  const nowISO = riyadhISODate();
  const window = inventoryPeriodWindow(period, nowISO);
  const query = useQuery({
    queryKey: ['retail-inventory-ledger-trends', ctx.restaurantId, ctx.branchId, ctx.warehouseId, period, nowISO],
    queryFn: () => fetchRetailLedgerForPeriod(ctx, period),
    enabled: Boolean(ctx.enabled && ctx.restaurantId),
    staleTime: 60000,
    retry: 1,
  });
  const analysis = useMemo(() => retailInventoryMovementSummary(query.data?.rows || [], period, nowISO), [query.data, period, nowISO]);
  const limited = query.data?.limited;
  const ready = !query.isLoading && !query.isFetching && !query.error && !limited;
  return (
    <Panel title={t.title} subtitle={t.summary}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex max-w-full gap-1 overflow-x-auto pb-2" role="group" aria-label={t.range}>
          {PERIODS.map((key, index) => <Button key={key} variant={period === key ? 'default' : 'outline'} size="sm"
            className="shrink-0 rounded-xl text-xs" aria-pressed={period === key}
            onClick={() => setPeriod(key)}>{t.filters[index]}</Button>)}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">{window.from} — {window.to}</div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{t.scope}</p>
      {query.error ? <ErrorNotice error={query.error} retry={query.refetch} /> :
        limited ? <div role="status" className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-5 w-5 shrink-0" />{t[query.data.reason] || t.overflow}
        </div> :
        query.isLoading || query.isFetching ? <p className="py-8 text-sm text-muted-foreground">{t.loading}</p> :
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Metric label={t.inbound} value={ready ? analysis.inbound : '—'} icon={ArrowDownToLine} />
            <Metric label={t.outbound} value={ready ? analysis.outbound : '—'} icon={ArrowUpFromLine} />
            <Metric label={t.total} value={ready ? analysis.total : '—'} icon={Activity} />
          </div>
          <div className="grid gap-3 xl:grid-cols-3">
            <div className="xl:col-span-2 rounded-2xl border p-3">
              <div className="flex items-center gap-2 mb-2 text-sm font-bold"><Layers className="w-4 h-4 text-blue-600" />{t.graph}</div>
              <div className="h-52 sm:h-64" dir="ltr">
                {analysis.total > 0 ? <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analysis.series} margin={{ top: 10, bottom: 0, left: -30, right: 6 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={value => String(value).slice(5)} tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip labelFormatter={(value,payload) => {
                      const point=payload?.[0]?.payload;
                      return point?.end && point.end !== value ? value + ' – ' + point.end : value;
                    }}/>
                    <Bar name={t.inbound} dataKey="inbound" fill="#10b981" radius={[4,4,0,0]} />
                    <Bar name={t.outbound} dataKey="outbound" fill="#2563eb" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer> : <div className="flex h-full justify-center items-center text-sm text-muted-foreground">{t.empty}</div>}
              </div>
            </div>
            <div className="rounded-2xl border p-3">
              <div className="flex items-center gap-2 mb-3 text-sm font-bold"><ListFilter className="w-4 h-4 text-blue-600" />{t.kinds}</div>
              <div className="space-y-3">
                {analysis.kinds.slice(0, 8).map(kind => <div key={kind.name} className="text-xs">
                  <div className="flex justify-between gap-2"><span className="truncate">{kind.name}</span><strong>{kind.value}</strong></div>
                  <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{ width: ((kind.value / Math.max(1,analysis.total)) * 100) + '%' }} /></div>
                </div>)}
                {!analysis.kinds.length && <p className="text-xs text-muted-foreground">{t.empty}</p>}
              </div>
            </div>
          </div>
        </>
      }
      <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{t.note}</p>
    </Panel>
  );
}
