import HelpLink from '@/components/help/HelpLink';
import {supplierInvoiceCurrencyTotals,readAllPortalRows} from '@/lib/portalReliability';
import PortalDataState from '@/components/shared/PortalDataState';
import React, { useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useAuth } from '@/lib/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Package, FileText, CheckCircle2, Clock, LogOut,
  RefreshCw, Search, Calendar, Building2, Home,
  ShoppingCart, History, Truck, ArrowRight, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const PO_STATUS = {
  pending:   { label: 'Pending',   color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  approved:  { label: 'Approved',  color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  shipped:   { label: 'Shipped',   color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
  received:  { label: 'Received',  color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  cancelled: { label: 'Cancelled', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

const INV_STATUS = {
  pending:  { label: 'Pending',  color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  approved: { label: 'Approved', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  paid:     { label: 'Paid',     color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  rejected: { label: 'Rejected', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  overdue:  { label: 'Overdue',  color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
};

const SUPPLIER_COPY = {
  en: {
    workspace:'Supplier workspace',verified:'Verified supplier',subhead:'Purchase orders, invoices and payment tracking in one place.',
    home:'Overview',invoices:'Invoices',orders:'Orders',history:'History',refresh:'Refresh',logout:'Sign out',
    awaiting:'Awaiting shipment',outstanding:'Outstanding',recent:'Recent invoices',viewAll:'View all',
    pendingShipments:'Orders to ship',confirmShip:'Confirm shipment',emptyTitle:'No outstanding activity',
    emptyDesc:'Your assigned purchase orders and invoices will appear here when the organization records them.',
    allInvoices:'Invoice history',invoiceSearch:'Search invoices…',noInvoices:'No invoices recorded yet.',
    noInvoicesHint:'The Owner’s invoices assigned to this supplier and branch will appear here.',
    ordersTitle:'Purchase orders',orderSearch:'Search purchase orders…',noOrders:'No purchase orders recorded yet.',
    historyTitle:'Completed order history',noHistory:'No completed or cancelled orders yet.',
    open:'Open',show:'Show',hide:'Hide',items:'items',loading:'Loading records…',retry:'Refresh records',
    orderProgress:'Order progress',progressHint:'Status of your assigned orders',shipped:'Shipped',received:'Received',
    total:'Total',invoiced:'Invoiced',due:'Due',branch:'Branch',unknownBranch:'Assigned branch',
    allClear:'No actions are required right now.',invoice:'Invoice',purchaseOrder:'Purchase order',
    status:{pending:'Pending',approved:'Approved',shipped:'Shipped',received:'Received',cancelled:'Cancelled',
      paid:'Paid',rejected:'Rejected',overdue:'Overdue',partial:'Part paid'},
  },
  ar: {
    workspace:'بوابة المورّد',verified:'مورّد موثّق',subhead:'أوامر الشراء والفواتير والمستحقات في مكان واحد.',
    home:'نظرة عامة',invoices:'الفواتير',orders:'الطلبات',history:'السجل',refresh:'تحديث',logout:'تسجيل الخروج',
    awaiting:'بانتظار الشحن',outstanding:'المستحقات',recent:'أحدث الفواتير',viewAll:'عرض الكل',
    pendingShipments:'طلبات تحتاج شحناً',confirmShip:'تأكيد الشحن',emptyTitle:'لا توجد أعمال معلّقة',
    emptyDesc:'ستظهر أوامر الشراء والفواتير المسندة لك عندما تسجلها المؤسسة.',
    allInvoices:'سجل الفواتير',invoiceSearch:'ابحث في الفواتير…',noInvoices:'لا توجد فواتير مسجلة بعد.',
    noInvoicesHint:'ستظهر هنا فواتير المالك المسندة إلى هذا المورّد والفرع.',
    ordersTitle:'أوامر الشراء',orderSearch:'ابحث في أوامر الشراء…',noOrders:'لا توجد أوامر شراء بعد.',
    historyTitle:'سجل الطلبات المكتملة',noHistory:'لا توجد طلبات مكتملة أو ملغاة بعد.',
    open:'مفتوح',show:'عرض',hide:'إخفاء',items:'أصناف',loading:'جارٍ تحميل السجلات…',retry:'تحديث السجلات',
    orderProgress:'مراحل الطلبات',progressHint:'حالة أوامر الشراء المسندة لك',shipped:'تم الشحن',received:'تم الاستلام',
    total:'المجموع',invoiced:'قيمة الفواتير',due:'يستحق',branch:'الفرع',unknownBranch:'الفرع المعيّن',
    allClear:'لا توجد إجراءات مطلوبة حالياً.',invoice:'فاتورة',purchaseOrder:'أمر شراء',
    status:{pending:'معلّق',approved:'معتمد',shipped:'تم الشحن',received:'تم الاستلام',cancelled:'ملغى',
      paid:'مدفوع',rejected:'مرفوض',overdue:'متأخر',partial:'دفع جزئي'},
  },
  fa: {
    workspace:'پورتال تأمین‌کننده',verified:'تأمین‌کنندهٔ تأییدشده',subhead:'سفارش‌های خرید، فاکتورها و مطالبات در یک جا.',
    home:'نمای کلی',invoices:'فاکتورها',orders:'سفارش‌ها',history:'تاریخچه',refresh:'تازه‌سازی',logout:'خروج',
    awaiting:'در انتظار ارسال',outstanding:'مطالبات',recent:'آخرین فاکتورها',viewAll:'نمایش همه',
    pendingShipments:'سفارش‌های آمادهٔ ارسال',confirmShip:'تأیید ارسال',emptyTitle:'کار معوقی وجود ندارد',
    emptyDesc:'سفارش‌ها و فاکتورهای مربوط به این تأمین‌کننده و شعبه پس از ثبت نمایش داده می‌شوند.',
    allInvoices:'تاریخچهٔ فاکتورها',invoiceSearch:'جستجوی فاکتور…',noInvoices:'هنوز فاکتوری ثبت نشده است.',
    noInvoicesHint:'فاکتورهای مربوط به همین تأمین‌کننده و شعبه اینجا ظاهر می‌شوند.',
    ordersTitle:'سفارش‌های خرید',orderSearch:'جستجوی سفارش…',noOrders:'هنوز سفارشی ثبت نشده است.',
    historyTitle:'تاریخچهٔ سفارش‌های تکمیل‌شده',noHistory:'سفارش تکمیل‌شده یا لغوشده موجود نیست.',
    open:'باز',show:'نمایش',hide:'پنهان',items:'قلم',loading:'دریافت سوابق…',retry:'تازه‌سازی اطلاعات',
    orderProgress:'مراحل سفارش',progressHint:'وضعیت سفارش‌های مربوط به شما',shipped:'ارسال‌شده',received:'دریافت‌شده',
    total:'مجموع',invoiced:'مبلغ فاکتورها',due:'سررسید',branch:'شعبه',unknownBranch:'شعبهٔ تعیین‌شده',
    allClear:'در حال حاضر اقدام جدیدی لازم نیست.',invoice:'فاکتور',purchaseOrder:'سفارش خرید',
    status:{pending:'در انتظار',approved:'تأییدشده',shipped:'ارسال‌شده',received:'دریافت‌شده',cancelled:'لغوشده',
      paid:'پرداخت‌شده',rejected:'ردشده',overdue:'سررسید گذشته',partial:'پرداخت جزئی'},
  },
};

export default function SupplierPortalERP() {
  const { user, logout } = useAuth();
  const { lang='en', isRTL=false } = useLanguage() || {};
  const copy = SUPPLIER_COPY[lang] || SUPPLIER_COPY.en;
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('home');
  const [search, setSearch] = useState('');

  // ── Own linked Supplier identity, never a tenant-wide suppliers read ─────
  // Supplier memberships intentionally do NOT have viewSuppliers (management).
  // The server RPC validates authenticated user, approved supplier role, exact
  // membership-linked supplier and tenant/branch, including legacy null branch.
  const { data: supplierProfile, isError: supplierProfileError, refetch: retrySupplierProfile, isLoading: supplierProfileLoading } = useQuery({
    queryKey: ['supplier-self-profile', user?.id, user?.restaurant_id, user?.branch_id, user?.linked_entity_id],
    queryFn: async () => {
      const {data,error}=await supabase.rpc('erp_supplier_self_profile');
      if(error) throw error;
      return data || null;
    },
    enabled: Boolean(user?.id && user?.restaurant_id && user?.branch_id && user?.role==='supplier'),
    staleTime:15000,
  });

  // ── Purchase orders for this supplier ─────────────────────────────────────
  const { data: purchaseOrders = [], isLoading, refetch, isError: purchaseOrdersError } = useQuery({
    queryKey: ['supplier-pos', supplierProfile?.id, user?.restaurant_id, user?.branch_id],
    queryFn: async () => {
      if (!supplierProfile?.id) return [];
      return readAllPortalRows(() => supabase
        .from('purchase_orders')
        .select('*')
        .eq('restaurant_id', user.restaurant_id)
        .eq('branch_id', user.branch_id)
        .eq('supplier_id', supplierProfile.id)
        .order('created_date', { ascending: false })
        .order('id', { ascending: true }));
    },
    enabled: !!supplierProfile?.id && !!user?.restaurant_id && !!user?.branch_id,
    refetchInterval: 60000,
  });

  // ── Supplier invoices — canonical supplier id plus tenant and branch ────────
  const { data: invoices = [], isLoading: invoicesLoading, refetch: refetchInvoices, isError: invoicesError } = useQuery({
    queryKey: ['supplier-invoices-portal', supplierProfile?.id, user?.branch_id],
    queryFn: async () => {
      if (!supplierProfile?.id) return [];
      return readAllPortalRows(() => supabase
        .from('supplier_invoices')
        .select('*')
        .eq('restaurant_id', user.restaurant_id)
        .eq('branch_id', user.branch_id)
        .eq('supplier_id', supplierProfile.id)
        .order('created_date', { ascending: false })
        .order('id', { ascending: true }));
    },
    enabled: !!supplierProfile?.id && !!user?.restaurant_id && !!user?.branch_id,
    refetchInterval: 30000,
  });

  const confirmShipmentMutation = useMutation({
    mutationFn: async (poId) => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .update({ status: 'shipped' })
        .eq('id', poId)
        .eq('restaurant_id', user.restaurant_id)
        .eq('branch_id', user.branch_id)
        .eq('supplier_id', supplierProfile.id)
        .eq('status', 'approved')
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Order changed or shipment permission is unavailable. Refresh and retry.');
    },
    onSuccess: () => {
      toast.success('Shipment confirmed!');
      qc.invalidateQueries({ queryKey: ['supplier-pos'] });
    },
    onError: (err) => toast.error(err.message),
  });

  if (supplierProfileError || purchaseOrdersError || invoicesError) return <PortalDataState onRetry={() => {retrySupplierProfile();refetch();refetchInvoices();}}/>;
  // Supplier identity is the access boundary; history and invoice lists are
  // independent widgets and should not hold the entire portal behind a spinner.
  if (supplierProfileLoading) return <PortalDataState loading/>;
  if (!supplierProfile || !user?.branch_id) return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-slate-900 dark:border-amber-900 dark:bg-slate-900 dark:text-white">
        <h2 className="text-base font-bold">Supplier access needs review</h2>
        <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">Your approved account could not be matched to an active supplier record in its assigned branch. Ask the Owner to check the Supplier link and branch assignment. No invoices were changed.</p>
        <Button variant="outline" className="mt-4 min-h-11" onClick={()=>retrySupplierProfile()}>Retry supplier profile</Button>
      </div>
    </div>
  );

  const filteredPOs = purchaseOrders.filter(po =>
    !search ||
    po.id?.toLowerCase().includes(search.toLowerCase()) ||
    po.branch?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredInvoices = invoices.filter(inv =>
    !search ||
    inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
    inv.supplier_name?.toLowerCase().includes(search.toLowerCase())
  );

  const pending = purchaseOrders.filter(po => po.status === 'approved');
  const shippedCount = purchaseOrders.filter(po => po.status === 'shipped').length;
  const receivedCount = purchaseOrders.filter(po => po.status === 'received').length;

  const currencyTotals = supplierInvoiceCurrencyTotals(invoices);
  const showTotal = field => currencyTotals.length ? currencyTotals.map(row => `${row.currency} ${row[field].toLocaleString()}`).join(' · ') : '—';

  const tabs = [
    { id: 'home',     label: copy.home,     icon: Home },
    { id: 'invoices', label: copy.invoices, icon: FileText },
    { id: 'orders',   label: copy.orders,   icon: ShoppingCart },
    { id: 'history',  label: copy.history,  icon: History },
  ];

  return (
    <section data-testid="supplier-erp-workspace" dir={isRTL?'rtl':'ltr'}
      className="min-w-0 bg-slate-50/80 px-3 pb-8 pt-3 text-slate-900 dark:bg-slate-950 dark:text-slate-50 sm:px-5 sm:pt-5">
      <div className="mx-auto w-full max-w-6xl space-y-3.5 sm:space-y-4">
        <header data-testid="supplier-erp-header" className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <Package className="h-5 w-5" aria-hidden="true"/>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">{copy.workspace}</p>
                <h1 className="truncate text-base font-extrabold text-slate-950 dark:text-white sm:text-lg">{supplierProfile?.name || copy.workspace}</h1>
                <p className="min-w-0 break-all text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="hidden items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 sm:inline-flex">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true"/>{copy.verified}
              </span>
              <Button type="button" variant="ghost" size="icon" aria-label={copy.refresh} title={copy.refresh}
                onClick={()=>{retrySupplierProfile();refetch();refetchInvoices();}}
                className="h-10 w-10 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                <RefreshCw className="h-4 w-4" aria-hidden="true"/>
              </Button>
              <HelpLink guide="supplier-portal" />
              <Button type="button" variant="ghost" size="icon" aria-label={copy.logout} title={copy.logout}
                onClick={logout} className="h-10 w-10 rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                <LogOut className="h-4 w-4" aria-hidden="true"/>
              </Button>
            </div>
          </div>
        </header>

        <nav data-testid="supplier-erp-tabs" aria-label={copy.workspace}
          className="grid grid-cols-4 gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {tabs.map(tab=>{
            const Icon=tab.icon;
            return <button key={tab.id} type="button"
              aria-current={activeTab===tab.id?'page':undefined}
              onClick={()=>{setActiveTab(tab.id);setSearch('');}}
              className={'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-[11px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 sm:min-h-11 sm:flex-row sm:gap-2 sm:text-sm '+
                (activeTab===tab.id?'bg-blue-600 text-white shadow-sm dark:bg-blue-500':'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true"/>
              <span className="max-w-full truncate">{tab.label}</span>
            </button>;
          })}
        </nav>

        <main className="space-y-4">
          {activeTab==='home' && <>
            <div className="px-0.5">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white sm:text-lg">{copy.home}</h2>
              <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.subhead}</p>
            </div>
            <div data-testid="supplier-erp-kpis" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <button type="button" onClick={()=>setActiveTab('orders')}
                className="min-w-0 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-start shadow-sm transition-colors hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-amber-600 dark:border-amber-900 dark:bg-amber-950 dark:hover:bg-amber-900">
                <div className="mb-2 flex items-center justify-between text-amber-700 dark:text-amber-300">
                  <Truck className="h-5 w-5"/><ArrowRight className="h-4 w-4"/>
                </div>
                <p className="text-2xl font-black tabular-nums text-slate-950 dark:text-white">{isLoading?'…':pending.length}</p>
                <p className="mt-1 text-xs font-semibold leading-4 text-slate-700 dark:text-slate-200">{copy.awaiting}</p>
              </button>
              <button type="button" onClick={()=>setActiveTab('invoices')}
                className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 text-start shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800">
                <div className="mb-2 flex items-center justify-between text-blue-600 dark:text-blue-400">
                  <FileText className="h-5 w-5"/><ArrowRight className="h-4 w-4"/>
                </div>
                <p className="text-2xl font-black tabular-nums text-slate-950 dark:text-white">{invoicesLoading?'…':invoices.length}</p>
                <p className="mt-1 text-xs font-semibold leading-4 text-slate-600 dark:text-slate-300">{copy.invoices}</p>
              </button>
              <button type="button" onClick={()=>setActiveTab('invoices')}
                className="col-span-2 min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 text-start shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 sm:col-span-1">
                <div className="mb-2 flex items-center justify-between text-rose-600 dark:text-rose-400">
                  <ShoppingCart className="h-5 w-5"/><ArrowRight className="h-4 w-4"/>
                </div>
                <p dir="ltr" className="break-words text-start text-lg font-extrabold leading-6 text-slate-950 dark:text-white sm:text-base">{invoicesLoading ? '…' : showTotal('outstanding')}</p>
                <p className="mt-1 text-xs font-semibold leading-4 text-slate-600 dark:text-slate-300">{copy.outstanding}</p>
              </button>
            </div>

            {purchaseOrders.length>0 && !isLoading && <section data-testid="supplier-order-progress" className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{copy.orderProgress}</h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">{copy.progressHint}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {label:copy.awaiting,value:pending.length,color:'bg-amber-500'},
                  {label:copy.shipped,value:shippedCount,color:'bg-blue-500'},
                  {label:copy.received,value:receivedCount,color:'bg-emerald-500'},
                ].map(item=><div key={item.label} className="min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-1 text-xs font-bold text-slate-700 dark:text-slate-200">
                    <span className="truncate">{item.label}</span><span className="tabular-nums">{item.value}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={'h-full rounded-full '+item.color} style={{width:Math.min(100,100*item.value/purchaseOrders.length)+'%'}}/>
                  </div>
                </div>)}
              </div>
            </section>}

            {(isLoading||invoicesLoading) && <p role="status" className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300"><RefreshCw className="h-4 w-4 animate-spin"/>{copy.loading}</p>}
            {!invoicesLoading && invoices.length>0 && <section className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{copy.recent}</h3>
                <button type="button" className="min-h-10 text-xs font-bold text-blue-700 hover:underline dark:text-blue-300" onClick={()=>setActiveTab('invoices')}>{copy.viewAll} →</button>
              </div>
              <div className="grid gap-2.5 lg:grid-cols-2">
                {invoices.slice(0,3).map(inv=><InvoiceCard key={inv.id} inv={inv} copy={copy}/>)}
              </div>
            </section>}
            {!isLoading && pending.length>0 && <section className="space-y-2">
              <h3 className="px-0.5 text-sm font-bold text-slate-900 dark:text-white">{copy.pendingShipments} · {pending.length}</h3>
              <div className="grid gap-2.5 lg:grid-cols-2">
                {pending.map(po=><POCard key={po.id} po={po} copy={copy} onConfirmShipment={()=>confirmShipmentMutation.mutate(po.id)} loading={confirmShipmentMutation.isPending}/>)}
              </div>
            </section>}
            {!isLoading && !invoicesLoading && pending.length===0 && invoices.length===0 &&
              <div data-testid="supplier-erp-empty" className="flex min-w-0 items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true"/>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{copy.emptyTitle}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{copy.emptyDesc}</p>
                  <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">{copy.allClear}</p>
                </div>
              </div>}
          </>}

          {activeTab==='invoices' && <section className="space-y-3" data-testid="supplier-invoice-tab">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">{copy.allInvoices}</h2>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">{invoicesLoading?'…':invoices.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Card className="min-w-0 rounded-2xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><CardContent className="p-3.5">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.invoiced}</p>
                <p dir="ltr" className="mt-2 break-words text-start text-base font-extrabold text-slate-950 dark:text-white">{invoicesLoading?'…':showTotal('invoiced')}</p>
              </CardContent></Card>
              <Card className="min-w-0 rounded-2xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><CardContent className="p-3.5">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{copy.outstanding}</p>
                <p dir="ltr" className="mt-2 break-words text-start text-base font-extrabold text-rose-700 dark:text-rose-300">{invoicesLoading?'…':showTotal('outstanding')}</p>
              </CardContent></Card>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true"/>
              <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder={copy.invoiceSearch} aria-label={copy.invoiceSearch}
                className="h-11 rounded-xl border-slate-200 bg-white ps-10 text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"/>
            </div>
            {invoicesLoading?<p role="status" className="p-4 text-xs text-slate-600">{copy.loading}</p>:
              filteredInvoices.length===0?<div className="rounded-2xl border border-slate-200 bg-white p-5 text-center dark:border-slate-800 dark:bg-slate-900">
                <FileText className="mx-auto mb-2 h-6 w-6 text-slate-400"/><p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{copy.noInvoices}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy.noInvoicesHint}</p>
              </div>:<div className="grid gap-2.5 lg:grid-cols-2">{filteredInvoices.map(inv=><InvoiceCard key={inv.id} inv={inv} copy={copy}/>)}</div>}
          </section>}

          {activeTab==='orders' && <section data-testid="supplier-order-tab" className="space-y-3">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">{copy.ordersTitle}</h2>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">{isLoading?'…':purchaseOrders.length}</span>
            </div>
            <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true"/>
              <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder={copy.orderSearch} aria-label={copy.orderSearch}
                className="h-11 rounded-xl border-slate-200 bg-white ps-10 text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"/>
            </div>
            {isLoading?<p role="status" className="p-4 text-xs text-slate-600">{copy.loading}</p>:
              filteredPOs.length===0?<div className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">{copy.noOrders}</div>:
              <div className="grid gap-2.5 lg:grid-cols-2">{filteredPOs.map(po=><POCard key={po.id} po={po} copy={copy} onConfirmShipment={()=>confirmShipmentMutation.mutate(po.id)} loading={confirmShipmentMutation.isPending}/>)}</div>}
          </section>}

          {activeTab==='history' && <section data-testid="supplier-history-tab" className="space-y-3">
            <h2 className="px-0.5 text-base font-extrabold text-slate-900 dark:text-white">{copy.historyTitle}</h2>
            {isLoading?<p role="status" className="p-4 text-xs text-slate-600">{copy.loading}</p>:
              purchaseOrders.filter(po=>['received','cancelled'].includes(po.status)).length===0?
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">{copy.noHistory}</div>:
                <div className="grid gap-2.5 lg:grid-cols-2">
                  {purchaseOrders.filter(po=>['received','cancelled'].includes(po.status))
                    .map(po=><POCard key={po.id} po={po} copy={copy} loading={false} onConfirmShipment={()=>{}}/>)}
                </div>}
          </section>}
        </main>
      </div>
    </section>
  );
}

// ── Invoice card ──────────────────────────────────────────────────────────────
function InvoiceCard({ inv }) {
  const statusConf = INV_STATUS[inv.status] || INV_STATUS.pending;
  return (
    <Card className="bg-white/5 border-white/10">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white font-bold text-sm">
              Invoice #{inv.invoice_number || inv.id?.slice(0, 8)}
            </p>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
              <Calendar className="w-3 h-3" />
              {inv.date ? format(new Date(inv.date), 'MMM d, yyyy') : (inv.created_date ? format(new Date(inv.created_date), 'MMM d, yyyy') : '—')}
              {inv.due_date && (
                <>
                  <Clock className="w-3 h-3 ml-1" />
                  Due {format(new Date(inv.due_date), 'MMM d')}
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-white font-bold text-sm">
              {inv.currency || ''} {parseFloat(inv.total_amount || 0).toLocaleString()}
            </p>
            <Badge className={`text-[10px] border ${statusConf.color}`}>{statusConf.label}</Badge>
          </div>
        </div>
        {inv.notes && (
          <p className="text-slate-500 text-xs mt-2 truncate">{inv.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Purchase order card ───────────────────────────────────────────────────────
function POCard({ po, onConfirmShipment, loading }) {
  const statusConf = PO_STATUS[po.status] || PO_STATUS.pending;
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="bg-white/5 border-white/10">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-white font-bold text-sm">PO #{po.id?.slice(0, 8)}</p>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
              <Building2 className="w-3 h-3" />
              {po.branch || 'Unknown Branch'}
              <Calendar className="w-3 h-3 ml-1" />
              {po.created_date ? format(new Date(po.created_date), 'MMM d') : ''}
            </div>
          </div>
          <div className="text-right">
            <p className="text-white font-bold text-sm">{(Number(po.total_amount) || 0).toLocaleString()}</p>
            <Badge className={`text-[10px] border ${statusConf.color}`}>{statusConf.label}</Badge>
          </div>
        </div>

        {po.items?.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-slate-500 text-xs hover:text-slate-300 mb-2"
          >
            {expanded ? 'Hide' : 'Show'} {po.items.length} item{po.items.length > 1 ? 's' : ''}
          </button>
        )}

        {expanded && po.items?.length > 0 && (
          <div className="space-y-1 mb-3 bg-white/5 rounded-lg p-2">
            {po.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{item.product_name || item.name || 'Item'}</span>
                <span className="text-white">×{item.quantity} @ {item.unit_price}</span>
              </div>
            ))}
          </div>
        )}

        {po.status === 'approved' && (
          <Button
            size="sm"
            onClick={onConfirmShipment}
            disabled={loading}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white text-xs h-8 mt-2"
          >
            <Package className="w-3.5 h-3.5 mr-1.5" />
            Confirm Shipment
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
