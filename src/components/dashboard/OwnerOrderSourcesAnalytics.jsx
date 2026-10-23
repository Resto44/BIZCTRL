import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Layers3 } from 'lucide-react';
import { buildOwnerOrderSourceAnalytics } from '@/lib/ownerOrderSourceAnalytics';

const COPY = {
  en: {
    title: 'Order / sales sources analytics',
    subtitle: 'Source breakdown from verified closings',
    details: 'Full analytics',
    allocated: 'Recorded source allocations',
    count: 'Sources',
    leading: 'Largest source share',
    empty: 'No source-level entries were recorded in finalized closings for this period.',
    mismatch: 'Source allocations differ from verified sales by',
    note: 'Source entries are a breakdown, not additional revenue or a count of individual orders.',
    unavailable: 'Source breakdown could not be verified. Refresh the sales records.',
  },
  fa: {
    title: 'آنالیتیکس منابع سفارش و فروش',
    subtitle: 'تفکیک منابع از کلوزینگ‌های تأییدشده',
    details: 'تحلیل کامل',
    allocated: 'مبلغ ثبت‌شده در منابع',
    count: 'منبع',
    leading: 'سهم بزرگ‌ترین منبع',
    empty: 'در این بازه جزئیات منابع در کلوزینگ‌های تأییدشده ثبت نشده است.',
    mismatch: 'اختلاف جزئیات منابع با فروش تأییدشده:',
    note: 'ارقام منابع فقط تفکیک فروش هستند؛ نه درآمد اضافه و نه تعداد سفارش‌ها.',
    unavailable: 'دیتای منابع قابل تأیید نیست. ریکوردهای فروش را دوباره تازه کنید.',
  },
  ar: {
    title: 'تحليلات مصادر الطلبات والمبيعات',
    subtitle: 'تفصيل المصادر من الإقفالات المعتمدة',
    details: 'التحليلات الكاملة',
    allocated: 'المبالغ المسجلة بالمصادر',
    count: 'المصادر',
    leading: 'حصة أكبر مصدر',
    empty: 'لا توجد تفاصيل للمصادر في الإقفالات المعتمدة لهذه الفترة.',
    mismatch: 'فرق تفصيل المصادر عن المبيعات المعتمدة:',
    note: 'تفاصيل المصادر ليست إيرادات إضافية ولا تمثل عدد الطلبات الفردية.',
    unavailable: 'لا يمكن التحقق من بيانات المصادر. أعد تحديث سجلات المبيعات.',
  },
};

export default function OwnerOrderSourcesAnalytics({
  sales = [], revenueSources = [], verifiedSales = 0,
  formatMoney, lang = 'en', periodLabel = '', hasQueryError = false,
}) {
  const navigate = useNavigate();
  const copy = COPY[lang] || COPY.en;
  const report = useMemo(
    () => buildOwnerOrderSourceAnalytics({ sales, revenueSources, verifiedSales, lang }),
    [sales, revenueSources, verifiedSales, lang],
  );
  const leading = report.sources[0];
  return (
    <section data-testid="snapshot-order-sources-analytics" className="min-w-0 rounded-[1.55rem] border border-border/80 bg-card p-3.5 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-600 text-white"><Layers3 className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-foreground sm:text-base">{copy.title}</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{copy.subtitle}{periodLabel ? ' · ' + periodLabel : ''}</p>
          </div>
        </div>
        <button type="button" onClick={() => navigate('/sales-sources')} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2.5 py-1.5 text-[11px] font-bold text-violet-700 transition hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300">
          {copy.details}<ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </button>
      </div>
      {hasQueryError ? (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">{copy.unavailable}</p>
      ) : report.sources.length === 0 ? (
        <p data-testid="owner-sources-empty" className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">{copy.empty}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 min-w-0 rounded-xl border border-violet-100 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/30">
              <p className="text-[10px] font-bold text-muted-foreground">{copy.allocated}</p>
              <strong data-testid="owner-source-allocated-total" dir="ltr" className="mt-1 block break-words text-xl font-black tabular-nums text-foreground">{formatMoney(report.allocatedTotal)}</strong>
            </div>
            <div className="min-w-0 rounded-xl border p-3">
              <p className="text-[10px] font-bold text-muted-foreground">{copy.count}</p>
              <strong data-testid="owner-source-count" className="mt-1 block text-xl font-black tabular-nums text-foreground">{report.sources.length}</strong>
            </div>
          </div>
          <div className="mt-3 space-y-2.5">
            {report.sources.slice(0, 8).map((source, index) => (
              <div data-testid="owner-source-row" key={source.key} className="min-w-0">
                <div className="mb-1 flex min-w-0 items-center justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate font-semibold text-foreground">{index + 1}. {source.name}</span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums"><strong className="text-foreground">{formatMoney(source.amount)}</strong><span className="ms-1.5 text-muted-foreground">{source.share.toFixed(1)}%</span></span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-violet-500" style={{ width: source.share + '%' }} />
                </div>
              </div>
            ))}
          </div>
          {leading && <p className="mt-3 text-[10px] text-muted-foreground">{copy.leading}: <strong>{leading.share.toFixed(1)}%</strong></p>}
          {!report.reconciled && <p data-testid="owner-source-reconciliation" role="status" className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{copy.mismatch} <strong dir="ltr">{formatMoney(Math.abs(report.difference))}</strong></p>}
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{copy.note}</p>
        </>
      )}
    </section>
  );
}
