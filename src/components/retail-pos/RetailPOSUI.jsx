import React from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  Building2,
  CalendarDays,
  Loader2,
  MonitorSmartphone,
  Radio,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/lib/LanguageContext';

const EN = {
  executive: 'Executive dashboard', branches: 'Branches & POS', device: 'Device account', audit: 'Audit & alerts',
  today: 'Today', week: 'This week', month: 'This month', live: 'Live', syncing: 'Syncing', offline: 'Offline',
  refresh: 'Refresh', noData: 'No POS devices are configured in this scope.', setup: 'Configure 10 POS devices for a branch to start live control.',
  unavailable: 'Retail POS database setup is not deployed yet.', retry: 'Retry', supermarketOnly: 'Retail POS Control is available only in the Supermarket portal.',
};

const COPY = {
  en: EN,
  fa: {
    ...EN,
    executive: 'داشبورد اجرایی', branches: 'فرع‌ها و POS', device: 'حساب دستگاه', audit: 'بررسی و هشدارها',
    today: 'امروز', week: 'این هفته', month: 'این ماه', live: 'زنده', syncing: 'در حال همگام‌سازی', offline: 'آفلاین',
    refresh: 'تازه‌سازی', noData: 'در این محدوده هنوز دستگاه POS تنظیم نشده است.', setup: 'برای آغاز کنترل زنده، ۱۰ دستگاه POS فرع را تنظیم کنید.',
    unavailable: 'ساختار دیتابیس Retail POS هنوز دیپلوی نشده است.', retry: 'تلاش دوباره', supermarketOnly: 'کنترل Retail POS فقط در پورتل سوپرمارکت فعال است.',
  },
  ar: {
    ...EN,
    executive: 'لوحة القيادة', branches: 'الفروع وPOS', device: 'حساب الجهاز', audit: 'التدقيق والتنبيهات',
    today: 'اليوم', week: 'هذا الأسبوع', month: 'هذا الشهر', live: 'مباشر', syncing: 'جارٍ التزامن', offline: 'غير متصل',
    refresh: 'تحديث', noData: 'لا توجد أجهزة POS مهيأة في هذا النطاق.', setup: 'هيّئ 10 أجهزة POS للفرع لبدء التحكم المباشر.',
    unavailable: 'لم يتم نشر بنية قاعدة بيانات Retail POS بعد.', retry: 'إعادة المحاولة', supermarketOnly: 'التحكم في Retail POS متاح فقط في بوابة السوبرماركت.',
  },
};

export const POS_PAGES = [
  { key: 'executive', path: '/retail/pos-control', icon: Activity },
  { key: 'branches', path: '/retail/pos-branches', icon: Building2 },
  { key: 'device', path: '/retail/pos-device', icon: MonitorSmartphone },
  { key: 'audit', path: '/retail/pos-audit', icon: ShieldCheck },
];

export function useRetailPosCopy() {
  const { lang } = useLanguage();
  return COPY[lang] || COPY.en;
}

export function RetailPOSWorkspace({
  activePage,
  title,
  subtitle = '',
  period = null,
  onPeriodChange = null,
  realtimeStatus,
  isFetching = false,
  onRefresh = null,
  children,
  actions = null,
}) {
  const copy = useRetailPosCopy();
  const subscribed = realtimeStatus === 'SUBSCRIBED';
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 pb-28 lg:pb-8">
      <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="page-title truncate text-xl font-black text-slate-950 dark:text-white sm:text-2xl">{title}</h1>
              <Badge className={cn('gap-1 border', subscribed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700')}>
                <Radio className={cn('h-3.5 w-3.5', subscribed && 'animate-pulse')} />
                {subscribed ? copy.live : realtimeStatus === 'CONNECTING' ? copy.syncing : copy.offline}
              </Badge>
            </div>
            {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {period && onPeriodChange ? (
              <div className="flex rounded-xl border bg-slate-50 p-1 dark:bg-slate-900" aria-label="Report period">
                {['today', 'week', 'month'].map((key) => (
                  <button key={key} type="button" onClick={() => onPeriodChange(key)} className={cn('rounded-lg px-3 py-2 text-xs font-bold transition-colors', period === key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white')}>
                    {copy[key]}
                  </button>
                ))}
              </div>
            ) : null}
            {actions}
            {onRefresh ? (
              <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isFetching} className="h-10 gap-2 rounded-xl">
                <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
                <span className="hidden sm:inline">{copy.refresh}</span>
              </Button>
            ) : null}
          </div>
        </div>
        <nav className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Retail POS control pages">
          {POS_PAGES.map((page) => {
            const Icon = page.icon;
            return (
              <Link key={page.key} to={page.path} reloadDocument className={cn('flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-center text-xs font-bold transition-all sm:text-sm', activePage === page.key ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-primary/40 hover:text-primary dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300')}>
                <Icon className="h-4 w-4 shrink-0" />
                <span>{copy[page.key]}</span>
              </Link>
            );
          })}
        </nav>
      </section>
      {children}
    </div>
  );
}

export function POSMetricCard({ label, value, hint, icon: Icon, tone = 'blue' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    red: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  };
  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm dark:border-slate-800">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
          <p className="kpi-value mt-1 truncate text-2xl font-black tracking-tight text-slate-950 dark:text-white">{value}</p>
          {hint ? <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p> : null}
        </div>
        {Icon ? <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[tone] || tones.blue)}><Icon className="h-5 w-5" /></span> : null}
      </CardContent>
    </Card>
  );
}

export function POSPanel({ title, description = '', action = null, children, className = '' }) {
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950', className)}>
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-900">
        <div className="min-w-0">
          <h2 className="section-title text-sm font-extrabold text-slate-900 dark:text-white">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p> : null}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function POSStatus({ live, label, compact = false }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border font-bold', compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs', live ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40')}>
      <span className={cn('h-2 w-2 rounded-full', live ? 'bg-emerald-500' : 'bg-red-500')} />
      {label}
    </span>
  );
}

export function RetailPOSLoading() {
  return <div className="flex min-h-[45vh] items-center justify-center rounded-3xl border bg-card"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
}

export function RetailPOSError({ error, onRetry }) {
  const copy = useRetailPosCopy();
  const migrationMissing = ['PGRST202', '42883'].includes(error?.code) || /erp_retail_pos_control_snapshot/i.test(error?.message || '');
  return (
    <div className="flex min-h-[42vh] flex-col items-center justify-center rounded-3xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950/30">
      <AlertCircle className="h-10 w-10 text-red-600" />
      <h2 className="mt-3 text-lg font-black text-slate-950 dark:text-white">{migrationMissing ? copy.unavailable : 'Unable to load Retail POS Control'}</h2>
      <p className="mt-2 max-w-xl text-sm text-slate-600 dark:text-slate-300">{migrationMissing ? copy.setup : error?.message}</p>
      <Button type="button" className="mt-4 rounded-xl" onClick={onRetry}>{copy.retry}</Button>
    </div>
  );
}

export function RetailPOSEmpty({ action = null }) {
  const copy = useRetailPosCopy();
  return (
    <div className="flex min-h-[36vh] flex-col items-center justify-center rounded-3xl border border-dashed bg-card p-8 text-center">
      <MonitorSmartphone className="h-11 w-11 text-slate-300" />
      <h2 className="mt-3 text-base font-black">{copy.noData}</h2>
      <p className="mt-1 max-w-lg text-sm text-muted-foreground">{copy.setup}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function POSDateStamp({ value }) {
  if (!value) return <span>—</span>;
  const date = new Date(value);
  return <span className="inline-flex items-center gap-1 whitespace-nowrap"><CalendarDays className="h-3.5 w-3.5" />{Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()}</span>;
}
