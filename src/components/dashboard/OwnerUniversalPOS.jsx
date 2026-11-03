import React from 'react';
import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { Activity, MonitorSmartphone, Radio, RefreshCw, ShieldCheck, Store } from 'lucide-react';
import OwnerRestaurantPOS from '@/components/dashboard/OwnerRestaurantPOS';
import { useRetailPOSControl } from '@/hooks/useRetailPOSControl';
import { deviceIsLive } from '@/lib/retailPosControl';
import { isRestaurantPOSPortal, isCommercePOSPortal } from '@/lib/productImportAccess';
import { money } from '@/lib/retailCashier';

const TEXT = {
  en: { title: 'Live cashier POS control', posted: 'Posted POS sales today', receipts: 'Receipts', cashiers: 'Cashiers & devices',
    touch: 'Touch POS', monitor: 'Full live control', active: 'Live channel', sync: 'Polling / reconnecting', noDevices: 'No cashier devices yet. Configure a POS device and assign stocked, sellable products to this branch.',
    noSales: 'No posted sales for this cashier today', offline: 'Offline', online: 'Online', retry: 'Retry', error: 'Live POS totals are unavailable; do not treat this as zero sales.', stock: 'Only products with approved branch stock can be sold. This card does not add sales to ERP totals.' },
  fa: { title: 'کنترول زنده کاشیر POS', posted: 'فروش ثبت‌شده POS امروز', receipts: 'فاکتورها', cashiers: 'کاشیرها و دستگاه‌ها',
    touch: 'POS تاچ‌اسکرین', monitor: 'کنترول زنده کامل', active: 'اتصال زنده', sync: 'در حال همگام‌سازی', noDevices: 'هنوز دستگاه کاشیر ثبت نشده است. دستگاه POS بسازید و اجناس قابل فروش با موجودی همان شعبه را تنظیم کنید.',
    noSales: 'امروز فروش ثبت‌شده ندارد', offline: 'آفلاین', online: 'آنلاین', retry: 'تلاش دوباره', error: 'دریافت فروش POS ناموفق بود؛ این حالت به معنی فروش صفر نیست.', stock: 'فقط اجناس دارای موجودی معتبر شعبه فروخته می‌شوند. این کارت فروش را دوباره به مجموع ERP اضافه نمی‌کند.' },
  ar: { title: 'مراقبة مبيعات الكاشير المباشرة', posted: 'مبيعات POS المسجلة اليوم', receipts: 'الفواتير', cashiers: 'الكاشير والأجهزة',
    touch: 'نقطة البيع باللمس', monitor: 'التحكم المباشر الكامل', active: 'متصل مباشرة', sync: 'مزامنة / إعادة اتصال', noDevices: 'لم يتم إعداد أجهزة الكاشير. أضف جهاز POS ومنتجات قابلة للبيع لها رصيد في الفرع.',
    noSales: 'لم يسجل هذا الكاشير مبيعات اليوم', offline: 'غير متصل', online: 'متصل', retry: 'إعادة المحاولة', error: 'تعذر تحميل مبيعات POS؛ لا يعني ذلك أن المبيعات صفر.', stock: 'لا تُباع إلا الأصناف ذات المخزون المعتمد في الفرع. هذه البطاقة لا تضيف مبيعات مكررة إلى ERP.' },
};

function CommercePOSMonitor({ branchId, lang, currency }) {
  const c = TEXT[lang] || TEXT.en;
  const control = useRetailPOSControl({ period: 'today', branchId: branchId || null });
  const { activeRestaurant } = useTenant();
  const data = control.snapshot;
  // Posted per-cashier totals are read from transaction.shift_id, NOT from the
  // latest cashier on a device (which may have had several shifts today).
  const cashiers = useQuery({
    queryKey: ['owner_commerce_pos_cashiers', activeRestaurant?.id, branchId, control.period.from],
    enabled: Boolean(activeRestaurant?.id),
    queryFn: async () => {
      const { data: result, error } = await supabase.rpc('erp_commerce_pos_owner_cashiers', {
        p_restaurant_id: activeRestaurant.id,
        p_branch_id: branchId || null,
        p_date: new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),
      });
      if (error) throw error;
      return result;
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  useEffect(() => {
    if (control.lastEventAt) void cashiers.refetch();
  }, [control.lastEventAt]);
  return <section data-testid="owner-universal-commerce-pos" className="min-w-0 space-y-3 rounded-2xl border border-blue-200 bg-card p-3 sm:p-4" aria-label={c.title}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold"><MonitorSmartphone className="h-5 w-5 text-blue-600" />{c.title}</h2>
      <span role="status" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Radio className={'h-3.5 w-3.5 ' + (control.realtimeStatus === 'SUBSCRIBED' ? 'text-green-600' : 'text-amber-500')} />
        {control.realtimeStatus === 'SUBSCRIBED' ? c.active : c.sync}
      </span>
    </div>
    <div className="flex flex-wrap gap-2 text-xs">
      <Link to="/pos" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-3 font-semibold text-white"><Store className="h-4 w-4" />{c.touch}</Link>
      <Link to="/retail/pos-control" className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 font-semibold"><ShieldCheck className="h-4 w-4" />{c.monitor}</Link>
      <Link to="/pos/stock" className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 font-semibold">{lang === 'fa' ? 'موجودی POS' : lang === 'ar' ? 'مخزون POS' : 'POS stock setup'}</Link>
      <button type="button" onClick={control.refetch} className="inline-flex min-h-11 items-center rounded-xl border px-3" aria-label={c.retry}><RefreshCw className="h-4 w-4" /></button>
    </div>
    {control.error ? <p role="alert" className="rounded-xl border border-red-300 p-3 text-sm text-red-600">{c.error}</p> :
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-muted p-3"><span>{c.posted}</span><strong className="mt-1 block text-base" dir="ltr">{control.isLoading ? '—' : money(data.summary.net_sales, currency)}</strong></div>
        <div className="rounded-lg bg-muted p-3"><span>{c.receipts}</span><strong className="mt-1 block text-base">{control.isLoading ? '—' : Number(data.summary.transaction_count || 0).toLocaleString()}</strong></div>
      </div>}
    {!control.error && !control.isLoading && !data.devices.length && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">{c.noDevices}</p>}
    {cashiers.error && <p role="alert" className="rounded-lg border border-amber-300 p-3 text-xs text-amber-800">{c.error}</p>}
    {!cashiers.error && !!data.devices.length && <div className="space-y-2">
      <h3 className="text-xs font-bold">{c.cashiers} ({cashiers.data?.cashiers?.length ?? '—'})</h3>
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {(cashiers.data?.cashiers || []).map(shift => <div key={shift.shift_id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-xs">
          <div className="min-w-0">
            <p className="font-semibold">{shift.cashier_name || shift.device_code}</p>
            <p className="truncate text-muted-foreground">{shift.branch_name} · {shift.device_code}</p>
            <p className="text-muted-foreground">{c.receipts}: {shift.receipt_count || 0}</p>
          </div>
          <strong dir="ltr" className="shrink-0 text-sm">{money(shift.net_sales, currency)}</strong>
        </div>)}
        {!cashiers.isLoading && !cashiers.data?.cashiers?.length && <p className="text-xs text-muted-foreground">{c.noSales}</p>}
      </div>
      <p className="text-xs text-muted-foreground">{data.devices.filter(deviceIsLive).length}/{data.devices.length} {c.online}</p>
    </div>}
    <p className="text-[11px] leading-5 text-muted-foreground">{c.stock}</p>
  </section>;
}

export default function OwnerUniversalPOS({ restaurant, branchId, lang = 'en' }) {
  if (isRestaurantPOSPortal(restaurant)) return <OwnerRestaurantPOS restaurant={restaurant} branchId={branchId} lang={lang} />;
  if (isCommercePOSPortal(restaurant)) return <CommercePOSMonitor branchId={branchId} lang={lang} currency={restaurant?.currency || 'SAR'} />;
  return null;
}
