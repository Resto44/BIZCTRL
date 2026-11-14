import HelpLink from '@/components/help/HelpLink';
import {supplierInvoiceCurrencyTotals,readAllPortalRows} from '@/lib/portalReliability';
import {supplierInvoicePaymentEvidence,supplierInvoiceProgress} from '@/lib/supplierInvoicePaymentEvidence';
import PortalDataState from '@/components/shared/PortalDataState';
import SupplierPortalAnalytics from '@/components/suppliers/SupplierPortalAnalytics';
import {buildSupplierGoodsTimeline,completedSupplierGoodsHistory} from '@/lib/supplierGoodsTimeline';
import React, { useState } from 'react';
import {Link} from 'react-router-dom';
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
  ShoppingCart, History, Truck, ArrowRight, ShieldCheck, ChevronDown, Wallet, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

const PO_STATUS = {
  draft:     { label: 'Draft', color: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200' },
  sent:      { label: 'Sent', color: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300' },
  pending:   { label: 'Pending',   color: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300' },
  approved:  { label: 'Approved',  color: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300' },
  shipped:   { label: 'Shipped',   color: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300' },
  received:  { label: 'Received',  color: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300' },
  cancelled: { label: 'Cancelled', color: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300' },
};
const INV_STATUS = {
  pending:  PO_STATUS.pending,
  approved: PO_STATUS.approved,
  paid:     PO_STATUS.received,
  partial:  PO_STATUS.shipped,
  rejected: PO_STATUS.cancelled,
  overdue:  { label:'Overdue',color:'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300' },
};
const dateLabel = value => value && !Number.isNaN(new Date(value).getTime()) ? String(value).slice(0,10) : '—';
const moneyLabel = value => value == null || value === '' || !Number.isFinite(Number(value))
  ? '—' : Number(value).toLocaleString(undefined,{maximumFractionDigits:2});


const SUPPLIER_COPY = {
  en: {
    workspace:'Supplier workspace',verified:'Verified supplier',subhead:'Purchase orders, invoices and payment tracking in one place.',
    home:'Overview',invoices:'Invoices',orders:'Orders',history:'History',refresh:'Refresh',logout:'Sign out',
    awaiting:'Awaiting shipment',outstanding:'Outstanding',recent:'Recent invoices',viewAll:'View all',
    pendingShipments:'Orders to ship',newOrders:'New purchase orders · ready to ship',priceHidden:'Prices hidden by Owner',confirmShip:'Confirm shipment',emptyTitle:'No outstanding activity',
    emptyDesc:'Your assigned purchase orders and invoices will appear here when the organization records them.',
    allInvoices:'Invoice history',invoiceSearch:'Search invoices…',noInvoices:'No invoices recorded yet.',
    noInvoicesHint:'The Owner’s invoices assigned to this supplier and branch will appear here.',
    ordersTitle:'Purchase orders',orderSearch:'Search purchase orders…',noOrders:'No purchase orders recorded yet.',
    historyTitle:'Completed order history',noHistory:'No completed or cancelled orders yet.',
    goodsOrdersTitle:'Invoice goods delivery progress',goodsHistoryTitle:'Owner-confirmed invoice deliveries',
    goodsRecord:'Invoice goods',goodsRecorded:'Invoice recorded',goodsPendingApproval:'Awaiting invoice approval',
    goodsAwaitingOwner:'Awaiting Owner physical receipt verification',goodsReceived:'Goods received and verified',
    goodsVerifiedAt:'Owner confirmed',goodsEmpty:'No supplier invoices are assigned to this branch.',
    goodsHistoryError:'Goods receipt history is temporarily unavailable. Refresh to retry.',
    goodsStatusHint:'Invoice payment and physical goods delivery are separate.',moreGoods:'Show more invoice goods',retry:'Retry',
    open:'Open',show:'Show',hide:'Hide',details:'Details',items:'items',loading:'Loading records…',retry:'Refresh records',
    orderProgress:'Order progress',progressHint:'Status of your assigned orders',shipped:'Shipped',received:'Received',
    total:'Total',invoiced:'Invoiced',due:'Due',branch:'Branch',unknownBranch:'Assigned branch',
    allClear:'No actions are required right now.',invoice:'Invoice',purchaseOrder:'Purchase order',
    waitingOwner:'Awaiting Owner verification',ownerApproved:'Owner-verified delivery',verifiedItems:'Verified products',
    status:{draft:'New order',sent:'New order',pending:'Pending',approved:'Approved',shipped:'Shipped',received:'Received',cancelled:'Cancelled',
      paid:'Paid',rejected:'Rejected',overdue:'Overdue',partial:'Part paid'},
  },
  ar: {
    workspace:'بوابة المورّد',verified:'مورّد موثّق',subhead:'أوامر الشراء والفواتير والمستحقات في مكان واحد.',
    home:'نظرة عامة',invoices:'الفواتير',orders:'الطلبات',history:'السجل',refresh:'تحديث',logout:'تسجيل الخروج',
    awaiting:'بانتظار الشحن',outstanding:'المستحقات',recent:'أحدث الفواتير',viewAll:'عرض الكل',
    pendingShipments:'طلبات تحتاج شحناً',newOrders:'أوامر شراء جديدة · جاهزة للشحن',priceHidden:'الأسعار مخفية من المالك',confirmShip:'تأكيد الشحن',emptyTitle:'لا توجد أعمال معلّقة',
    emptyDesc:'ستظهر أوامر الشراء والفواتير المسندة لك عندما تسجلها المؤسسة.',
    allInvoices:'سجل الفواتير',invoiceSearch:'ابحث في الفواتير…',noInvoices:'لا توجد فواتير مسجلة بعد.',
    noInvoicesHint:'ستظهر هنا فواتير المالك المسندة إلى هذا المورّد والفرع.',
    ordersTitle:'أوامر الشراء',orderSearch:'ابحث في أوامر الشراء…',noOrders:'لا توجد أوامر شراء بعد.',
    historyTitle:'سجل الطلبات المكتملة',noHistory:'لا توجد طلبات مكتملة أو ملغاة بعد.',
    goodsOrdersTitle:'مراحل تسليم بضائع الفواتير',goodsHistoryTitle:'تسليمات الفواتير المؤكدة من المالك',
    goodsRecord:'بضائع الفاتورة',goodsRecorded:'تم تسجيل الفاتورة',goodsPendingApproval:'بانتظار اعتماد الفاتورة',
    goodsAwaitingOwner:'بانتظار تحقق المالك من الاستلام الفعلي',goodsReceived:'تم استلام البضاعة والتحقق منها',
    goodsVerifiedAt:'تأكيد المالك',goodsEmpty:'لا توجد فواتير مورّد مسندة لهذا الفرع.',
    goodsHistoryError:'تعذر تحميل سجل استلام البضائع. حدّث البيانات للمحاولة مجدداً.',
    goodsStatusHint:'سداد الفاتورة منفصل عن استلام البضاعة فعلياً.',moreGoods:'عرض المزيد من بضائع الفواتير',retry:'إعادة المحاولة',
    open:'مفتوح',show:'عرض',hide:'إخفاء',details:'التفاصيل',items:'أصناف',loading:'جارٍ تحميل السجلات…',retry:'تحديث السجلات',
    orderProgress:'مراحل الطلبات',progressHint:'حالة أوامر الشراء المسندة لك',shipped:'تم الشحن',received:'تم الاستلام',
    total:'المجموع',invoiced:'قيمة الفواتير',due:'يستحق',branch:'الفرع',unknownBranch:'الفرع المعيّن',
    allClear:'لا توجد إجراءات مطلوبة حالياً.',invoice:'فاتورة',purchaseOrder:'أمر شراء',
    waitingOwner:'بانتظار تأكيد استلام المالك',ownerApproved:'تم تأكيد الاستلام من المالك',verifiedItems:'الأصناف والكميات المؤكدة',
    status:{draft:'طلب جديد',sent:'طلب جديد',pending:'معلّق',approved:'معتمد',shipped:'تم الشحن',received:'تم الاستلام',cancelled:'ملغى',
      paid:'مدفوع',rejected:'مرفوض',overdue:'متأخر',partial:'دفع جزئي'},
  },
  fa: {
    workspace:'پورتال تأمین‌کننده',verified:'تأمین‌کنندهٔ تأییدشده',subhead:'سفارش‌های خرید، فاکتورها و مطالبات در یک جا.',
    home:'نمای کلی',invoices:'فاکتورها',orders:'سفارش‌ها',history:'تاریخچه',refresh:'تازه‌سازی',logout:'خروج',
    awaiting:'در انتظار ارسال',outstanding:'مطالبات',recent:'آخرین فاکتورها',viewAll:'نمایش همه',
    pendingShipments:'سفارش‌های آمادهٔ ارسال',newOrders:'سفارش‌های جدید · آمادهٔ ارسال',priceHidden:'قیمت توسط اونر پنهان شده',confirmShip:'تأیید ارسال',emptyTitle:'کار معوقی وجود ندارد',
    emptyDesc:'سفارش‌ها و فاکتورهای مربوط به این تأمین‌کننده و شعبه پس از ثبت نمایش داده می‌شوند.',
    allInvoices:'تاریخچهٔ فاکتورها',invoiceSearch:'جستجوی فاکتور…',noInvoices:'هنوز فاکتوری ثبت نشده است.',
    noInvoicesHint:'فاکتورهای مربوط به همین تأمین‌کننده و شعبه اینجا ظاهر می‌شوند.',
    ordersTitle:'سفارش‌های خرید',orderSearch:'جستجوی سفارش…',noOrders:'هنوز سفارشی ثبت نشده است.',
    historyTitle:'تاریخچهٔ سفارش‌های تکمیل‌شده',noHistory:'سفارش تکمیل‌شده یا لغوشده موجود نیست.',
    goodsOrdersTitle:'مراحل تحویل محصولات فاکتور',goodsHistoryTitle:'تحویل‌های تأییدشده توسط اونر',
    goodsRecord:'محصولات فاکتور',goodsRecorded:'فاکتور ثبت شده',goodsPendingApproval:'در انتظار تأیید فاکتور',
    goodsAwaitingOwner:'در انتظار بررسی و تأیید دریافت فیزیکی توسط اونر',goodsReceived:'محصول دریافت و تأیید شد',
    goodsVerifiedAt:'تأیید اونر',goodsEmpty:'فاکتور سپلایر برای این شعبه ثبت نشده است.',
    goodsHistoryError:'تاریخچهٔ تحویل محصول در دسترس نیست. دوباره تازه‌سازی کن.',
    goodsStatusHint:'پرداخت فاکتور با تحویل فیزیکی محصول فرق دارد.',moreGoods:'نمایش محصولات بیشتر',retry:'تلاش دوباره',
    open:'باز',show:'نمایش',hide:'پنهان',details:'جزئیات',items:'قلم',loading:'دریافت سوابق…',retry:'تازه‌سازی اطلاعات',
    orderProgress:'مراحل سفارش',progressHint:'وضعیت سفارش‌های مربوط به شما',shipped:'ارسال‌شده',received:'دریافت‌شده',
    total:'مجموع',invoiced:'مبلغ فاکتورها',due:'سررسید',branch:'شعبه',unknownBranch:'شعبهٔ تعیین‌شده',
    allClear:'در حال حاضر اقدام جدیدی لازم نیست.',invoice:'فاکتور',purchaseOrder:'سفارش خرید',
    waitingOwner:'در انتظار تأیید دریافت از طرف اونر',ownerApproved:'تحویل به تأیید اونر رسید',verifiedItems:'محصولات و مقدار تأییدشده',
    status:{draft:'سفارش جدید',sent:'سفارش جدید',pending:'در انتظار',approved:'تأییدشده',shipped:'ارسال‌شده',received:'دریافت‌شده',cancelled:'لغوشده',
      paid:'پرداخت‌شده',rejected:'ردشده',overdue:'سررسید گذشته',partial:'پرداخت جزئی'},
  },
};

const SUPPLIER_PAYMENT_COPY={
 en:{detail:'Invoice details',itemsTitle:'Invoice items',paymentsTitle:'Payment history',paid:'Paid',remaining:'Remaining',
    paidInvoices:'Paid invoices',partialInvoices:'Partially paid',recentPayments:'Recent payments',
    noPayments:'No payment recorded for this invoice.',noPaymentFeed:'Payment history is temporarily unavailable. Refresh to confirm payments.',
    paymentHistoryLoading:'Refreshing payment history…',paymentMethod:'Method',subtotal:'Subtotal',tax:'Tax',discount:'Discount',
    additionalCosts:'Additional costs',notes:'Notes',paymentBalance:'Payment progress',
    historyGap:'The invoice records a paid amount, but individual historical payment transactions are not available.',
    historyMismatch:'Invoice paid amount and recorded payment transactions differ. Ask the Owner to reconcile.',
    viewDetails:'View invoice details',hideDetails:'Hide invoice details',paidInFull:'Paid in full',recorded:'Recorded payment',
    cash:'Cash',network:'Network',bank_transfer:'Bank transfer'},
 ar:{detail:'تفاصيل الفاتورة',itemsTitle:'أصناف الفاتورة',paymentsTitle:'سجل الدفعات',paid:'المدفوع',remaining:'المتبقي',
    paidInvoices:'فواتير مدفوعة',partialInvoices:'مدفوعة جزئياً',recentPayments:'آخر الدفعات',
    noPayments:'لم تسجل دفعة لهذه الفاتورة.',noPaymentFeed:'تعذر تحميل سجل الدفعات. حدّث الصفحة للتأكد.',
    paymentHistoryLoading:'جار تحديث سجل الدفعات…',paymentMethod:'طريقة الدفع',subtotal:'المجموع الفرعي',tax:'الضريبة',discount:'الخصم',
    additionalCosts:'تكاليف إضافية',notes:'ملاحظات',paymentBalance:'تقدم السداد',
    historyGap:'الفاتورة تسجل مبلغاً مدفوعاً لكن تفاصيل الدفعات التاريخية غير متوفرة.',
    historyMismatch:'مجموع الدفعات يختلف عن المدفوع المسجل بالفاتورة. راجع مالك المؤسسة.',
    viewDetails:'عرض تفاصيل الفاتورة',hideDetails:'إخفاء التفاصيل',paidInFull:'مدفوع بالكامل',recorded:'دفعة مسجلة',
    cash:'نقدي',network:'شبكة',bank_transfer:'تحويل بنكي'},
 fa:{detail:'جزئیات فاکتور',itemsTitle:'اقلام فاکتور',paymentsTitle:'تاریخچهٔ پرداخت',paid:'پرداخت‌شده',remaining:'باقی‌مانده',
    paidInvoices:'فاکتورهای پرداخت‌شده',partialInvoices:'پرداخت جزئی',recentPayments:'آخرین پرداخت‌ها',
    noPayments:'برای این فاکتور هنوز پرداختی ثبت نشده است.',noPaymentFeed:'تاریخچهٔ پرداخت در دسترس نیست. برای تأیید، تازه‌سازی کن.',
    paymentHistoryLoading:'تاریخچهٔ پرداخت تازه می‌شود…',paymentMethod:'روش پرداخت',subtotal:'جمع قبل از هزینه‌ها',tax:'مالیات',discount:'تخفیف',
    additionalCosts:'هزینه‌های اضافی',notes:'یادداشت',paymentBalance:'پیشرفت پرداخت',
    historyGap:'فاکتور مبلغ پرداخت‌شده دارد، اما جزئیات تراکنش‌های قبلی موجود نیست.',
    historyMismatch:'جمع تراکنش‌ها با مبلغ ثبت‌شدهٔ فاکتور مطابقت ندارد. از مالک درخواست بررسی کن.',
    viewDetails:'بازکردن جزئیات فاکتور',hideDetails:'بستن جزئیات',paidInFull:'تسویهٔ کامل',recorded:'پرداخت ثبت‌شده',
    cash:'نقد',network:'شبکه',bank_transfer:'انتقال بانکی'},
};

export default function SupplierPortalERP() {
  const { user, logout } = useAuth();
  const { lang='en', isRTL=false } = useLanguage() || {};
  const copy = {...(SUPPLIER_COPY[lang] || SUPPLIER_COPY.en), ...(SUPPLIER_PAYMENT_COPY[lang] || SUPPLIER_PAYMENT_COPY.en)};
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('home');
  const [search, setSearch] = useState('');
  const [visibleGoodsCount,setVisibleGoodsCount]=useState(20);

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
      // The server validates tenant, branch and linked supplier, and redacts
      // unit prices and totals BEFORE any payload reaches this browser.
      const {data,error}=await supabase.rpc('erp_supplier_visible_purchase_orders');
      if(error)throw error;
      if(!Array.isArray(data))throw Error('SUPPLIER_PURCHASE_ORDER_RESPONSE_INVALID');
      return data;
    },
    enabled: !!supplierProfile?.id && !!user?.restaurant_id && !!user?.branch_id,
    refetchInterval: 5000,refetchOnWindowFocus:true,
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
    refetchInterval: 12000,
    refetchOnWindowFocus: true,
  });

  // Actual payment transactions posted by Owner/Manager are read-only here.
  // The RLS policy now limits Supplier to their membership-linked supplier ID.
  const {data: payments=[], isLoading: paymentsLoading, isError: paymentsError,
    refetch: refetchPayments} = useQuery({
    queryKey:['supplier-payments-portal',supplierProfile?.id,user?.restaurant_id,user?.branch_id],
    queryFn:()=>readAllPortalRows(()=>supabase.from('supplier_payments')
      .select('id,invoice_id,amount,date,payment_method,created_date')
      .eq('restaurant_id',user.restaurant_id)
      .eq('branch_id',user.branch_id)
      .eq('supplier_id',supplierProfile.id)
      .order('created_date',{ascending:false})
      .order('id',{ascending:false})),
    enabled:Boolean(supplierProfile?.id&&user?.restaurant_id&&user?.branch_id),
    refetchInterval:12000,refetchOnWindowFocus:true,
  });

  // Owner confirmation snapshots are scoped to the signed-in supplier by server RPC.
  const {data:verifiedDeliveries=[],isError:verifiedDeliveriesError,refetch:refetchDeliveries}=useQuery({
    queryKey:['supplier-verified-deliveries',supplierProfile?.id,user?.branch_id],
    queryFn:async()=>{
      const {data,error}=await supabase.rpc('erp_supplier_verified_deliveries');
      if(error)throw error;
      return Array.isArray(data)?data:[];
    },
    enabled:Boolean(supplierProfile?.id&&user?.restaurant_id&&user?.branch_id),
    refetchInterval:12000,refetchOnWindowFocus:true,retry:1,
  });

  const {data:invoiceDeliveries=[],isLoading:invoiceDeliveryLoading,isError:invoiceDeliveryError,refetch:refetchInvoiceDeliveries}=useQuery({
    queryKey:['supplier-invoice-deliveries-portal',supplierProfile?.id,user?.restaurant_id,user?.branch_id],
    enabled:Boolean(supplierProfile?.id&&user?.restaurant_id&&user?.branch_id),
    queryFn:async()=>{
      const {data,error}=await supabase.rpc('erp_supplier_invoice_delivery_receipts',{
        p_restaurant_id:user.restaurant_id
      });
      if(error)throw error;
      if(!Array.isArray(data))throw new Error('SUPPLIER_INVOICE_RECEIPTS_INVALID_RESPONSE');
      return data;
    },
    refetchInterval:12000,refetchOnWindowFocus:true,retry:1,
  });

  const confirmShipmentMutation = useMutation({
    mutationFn: async (poId) => {
      const {data,error}=await supabase.rpc('erp_supplier_mark_order_shipped',{p_order_id:poId});
      if(error)throw error;
      if(data?.status!=='shipped')throw new Error('Shipment was not confirmed. Refresh and retry.');
    },
    onSuccess: () => {
      toast.success('Shipment confirmed!');
      qc.invalidateQueries({ queryKey: ['supplier-pos'] });
      qc.invalidateQueries({ queryKey: ['supplier-verified-deliveries'] });
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

  const deliveryByOrder=new Map(verifiedDeliveries.map(row=>[String(row.order_id),row]));
  const invoiceDeliveryById=new Map(invoiceDeliveries.map(row=>[String(row.invoice_id),row]));
  // Invoice goods and purchase-order shipment are independent procurement flows.
  // A paid/approved invoice is never treated as physically received without Owner evidence.
  const goodsTimeline=buildSupplierGoodsTimeline(invoices,invoiceDeliveries);
  const completedGoods=completedSupplierGoodsHistory(goodsTimeline);
  const completedPOHistory=purchaseOrders.filter(po=>['received','cancelled'].includes(po.status));
  const filteredGoods=goodsTimeline.filter(({invoice})=>!search
    || String(invoice.id||'').toLowerCase().includes(search.toLowerCase())
    || String(invoice.invoice_number||'').toLowerCase().includes(search.toLowerCase()));
  const newPurchaseOrders = purchaseOrders.filter(po => ['draft','sent','pending'].includes(po.status));
  const pending = purchaseOrders.filter(po => po.status === 'approved');
  const actionableCount = newPurchaseOrders.length + pending.length;
  const shippedCount = purchaseOrders.filter(po => po.status === 'shipped').length;
  const receivedCount = purchaseOrders.filter(po => po.status === 'received').length;

  const invoiceProgress=supplierInvoiceProgress(invoices);
  const paymentsByInvoice=new Map();
  const availableInvoiceIds=new Set(invoices.map(inv=>String(inv.id)));
  for(const payment of payments){
    if(!availableInvoiceIds.has(String(payment.invoice_id)))continue;
    const key=String(payment.invoice_id);
    paymentsByInvoice.set(key,[...(paymentsByInvoice.get(key)||[]),payment]);
  }
  const recentPayments=payments.filter(p=>availableInvoiceIds.has(String(p.invoice_id)))
    .slice(0,5).map(p=>({payment:p,invoice:invoices.find(i=>String(i.id)===String(p.invoice_id))}));
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
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="flex w-full min-w-0 items-start gap-3 sm:w-auto sm:flex-1 sm:items-center">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <Package className="h-5 w-5" aria-hidden="true"/>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">{copy.workspace}</p>
                <h1 data-testid="supplier-full-name" className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere] text-lg font-extrabold leading-6 text-slate-950 dark:text-white sm:text-xl">{supplierProfile?.name || copy.workspace}</h1>
                <p data-testid="supplier-account-email" className="mt-1 min-w-0 break-all text-xs leading-5 text-slate-500 dark:text-slate-400">{user?.email}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-1.5 self-end sm:self-auto">
              <span className="hidden items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 sm:inline-flex">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true"/>{copy.verified}
              </span>
              <Button type="button" variant="ghost" size="icon" aria-label={copy.refresh} title={copy.refresh}
                onClick={()=>{retrySupplierProfile();refetch();refetchInvoices();refetchPayments();refetchDeliveries();refetchInvoiceDeliveries();}}
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

        <Link to="/portal-order-entry" data-testid="supplier-customer-order-entry" className="flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-black text-white">{lang==='ar'?'إرسال طلب العميل':lang==='fa'?'ثبت سفارش مشتری':'Customer order intake'}</Link>
        <nav data-testid="supplier-erp-tabs" aria-label={copy.workspace}
          className="grid grid-cols-4 gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {tabs.map(tab=>{
            const Icon=tab.icon;
            return <button key={tab.id} type="button"
              aria-current={activeTab===tab.id?'page':undefined}
              onClick={()=>{setActiveTab(tab.id);setSearch('');setVisibleGoodsCount(20);}}
              className={'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-[11px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 sm:min-h-11 sm:flex-row sm:gap-2 sm:text-sm '+
                (activeTab===tab.id?'bg-blue-600 text-white shadow-sm dark:bg-blue-500':'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true"/>
              <span className="max-w-full truncate">{tab.label}</span>
            </button>;
          })}
        </nav>

        <main className="space-y-4">
          {paymentsError && <div role="alert" data-testid="supplier-payment-history-error"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <span className="min-w-0 flex-1">{copy.noPaymentFeed}</span>
            <Button type="button" variant="outline" size="sm" onClick={()=>refetchPayments()}>{copy.retry}</Button>
          </div>}
          {activeTab==='home' && <>
            <div className="px-0.5">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white sm:text-lg">{copy.home}</h2>
              <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.subhead}</p>
            </div>
            <SupplierPortalAnalytics orders={purchaseOrders} invoices={invoices} payments={payments} deliveries={verifiedDeliveries}
              lang={lang} loading={isLoading||invoicesLoading||paymentsLoading}
              onOpenOrders={()=>setActiveTab('orders')} onOpenInvoices={()=>setActiveTab('invoices')}/>
            <div data-testid="supplier-erp-kpis" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <button type="button" onClick={()=>setActiveTab('orders')}
                className="min-w-0 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-start shadow-sm transition-colors hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-amber-600 dark:border-amber-900 dark:bg-amber-950 dark:hover:bg-amber-900">
                <div className="mb-2 flex items-center justify-between text-amber-700 dark:text-amber-300">
                  <Truck className="h-5 w-5"/><ArrowRight className="h-4 w-4"/>
                </div>
                <p className="text-2xl font-black tabular-nums text-slate-950 dark:text-white">{isLoading?'…':actionableCount}</p>
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

            {!invoicesLoading && invoices.length>0 && <div data-testid="supplier-invoice-settlement-status"
              className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={()=>setActiveTab('invoices')}
                className="flex min-h-14 min-w-0 items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 text-start hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300"/>
                <div className="min-w-0"><p className="text-lg font-extrabold tabular-nums text-slate-950 dark:text-white">{invoiceProgress.fullyPaid}</p>
                  <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{copy.paidInvoices}</p></div>
              </button>
              <button type="button" onClick={()=>setActiveTab('invoices')}
                className="flex min-h-14 min-w-0 items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-3.5 text-start hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950">
                <Wallet className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-300"/>
                <div className="min-w-0"><p className="text-lg font-extrabold tabular-nums text-slate-950 dark:text-white">{invoiceProgress.partiallyPaid}</p>
                  <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{copy.partialInvoices}</p></div>
              </button>
            </div>}

            {!paymentsLoading && !paymentsError && recentPayments.length>0 && <section data-testid="supplier-recent-payments" className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{copy.recentPayments}</h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentPayments.map(({payment,invoice})=><div key={payment.id}
                  className="flex min-w-0 items-start justify-between gap-2 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-semibold text-slate-900 dark:text-white">{invoice?.invoice_number||invoice?.id?.slice(0,8)}</p>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">{dateLabel(payment.date)} · {copy[payment.payment_method]||payment.payment_method||'—'}</p>
                  </div>
                  <strong dir="ltr" className="shrink-0 tabular-nums text-emerald-700 dark:text-emerald-300">
                    {invoice?.currency||'—'} {moneyLabel(payment.amount)}
                  </strong>
                </div>)}
              </div>
            </section>}

            {purchaseOrders.length>0 && !isLoading && <section data-testid="supplier-order-progress" className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{copy.orderProgress}</h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">{copy.progressHint}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {label:copy.awaiting,value:actionableCount,color:'bg-amber-500'},
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

            {(isLoading||invoicesLoading||paymentsLoading) && <p role="status" className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300"><RefreshCw className="h-4 w-4 animate-spin"/>{copy.loading}</p>}
            {!invoicesLoading && invoices.length > 0 && <section className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{copy.recent}</h3>
                <button type="button" className="min-h-10 text-xs font-bold text-blue-700 hover:underline dark:text-blue-300" onClick={()=>setActiveTab('invoices')}>{copy.viewAll} →</button>
              </div>
              <div className="grid gap-2.5 lg:grid-cols-2">
                {invoices.slice(0,3).map(inv=><InvoiceCard key={inv.id} inv={inv} copy={copy} deliveryReceipt={invoiceDeliveryById.get(String(inv.id))} payments={paymentsByInvoice.get(String(inv.id))||[]} paymentsLoading={paymentsLoading} paymentsError={paymentsError}/>)}
              </div>
            </section>}
            {!isLoading && newPurchaseOrders.length>0 && <section data-testid="supplier-new-purchase-orders" className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="px-0.5 text-sm font-bold text-slate-900 dark:text-white">{copy.newOrders} · {newPurchaseOrders.length}</h3>
                <button type="button" className="min-h-10 text-xs font-bold text-blue-700" onClick={()=>setActiveTab('orders')}>{copy.viewAll}</button>
              </div>
              <div className="grid gap-2.5 lg:grid-cols-2">
                {newPurchaseOrders.map(po=><POCard key={po.id} po={po} copy={copy} ownerVerification={deliveryByOrder.get(String(po.id))} loading={false} onConfirmShipment={()=>confirmShipmentMutation.mutate(po.id)}/>)}
              </div>
            </section>}
            {!isLoading && pending.length>0 && <section className="space-y-2">
              <h3 className="px-0.5 text-sm font-bold text-slate-900 dark:text-white">{copy.pendingShipments} · {pending.length}</h3>
              <div className="grid gap-2.5 lg:grid-cols-2">
                {pending.map(po=><POCard key={po.id} po={po} copy={copy} ownerVerification={deliveryByOrder.get(String(po.id))} onConfirmShipment={()=>confirmShipmentMutation.mutate(po.id)} loading={confirmShipmentMutation.isPending}/>)}
              </div>
            </section>}
            {!isLoading && !invoicesLoading && pending.length === 0 && newPurchaseOrders.length === 0 && invoices.length === 0 &&
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
              </div>:<div className="grid gap-2.5 lg:grid-cols-2">{filteredInvoices.map(inv=><InvoiceCard key={inv.id} inv={inv} copy={copy} deliveryReceipt={invoiceDeliveryById.get(String(inv.id))} payments={paymentsByInvoice.get(String(inv.id))||[]} paymentsLoading={paymentsLoading} paymentsError={paymentsError}/>)}</div>}
          </section>}

          {activeTab==='orders' && <section data-testid="supplier-order-tab" className="space-y-3">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">{copy.orders}</h2>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">{(isLoading||invoicesLoading)?'…':purchaseOrders.length+invoices.length}</span>
            </div>
            <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true"/>
              <Input value={search} onChange={e=>{setSearch(e.target.value);setVisibleGoodsCount(20);}} placeholder={copy.orderSearch} aria-label={copy.orderSearch}
                className="h-11 rounded-xl border-slate-200 bg-white ps-10 text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"/>
            </div>
            {isLoading?<p role="status" className="p-4 text-xs text-slate-600">{copy.loading}</p>:
              filteredPOs.length>0&&<section className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{copy.ordersTitle} · {filteredPOs.length}</h3>
                <div className="grid gap-2.5 lg:grid-cols-2">{filteredPOs.map(po=><POCard key={po.id} po={po} copy={copy} ownerVerification={deliveryByOrder.get(String(po.id))} onConfirmShipment={()=>confirmShipmentMutation.mutate(po.id)} loading={confirmShipmentMutation.isPending}/>)}</div>
              </section>}
            <section data-testid="supplier-invoice-goods-orders" className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{copy.goodsOrdersTitle}</h3>
              {invoiceDeliveryError&&<div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <span>{copy.goodsHistoryError}</span><Button variant="outline" size="sm" onClick={()=>refetchInvoiceDeliveries()}>{copy.retry}</Button>
              </div>}
              {(invoicesLoading||invoiceDeliveryLoading)?<p role="status" className="p-3 text-xs text-slate-600">{copy.loading}</p>:
                invoiceDeliveryError?null:
                filteredGoods.length===0?<p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{copy.goodsEmpty}</p>:
                <div className="space-y-3">
                  <div className="grid gap-2.5 lg:grid-cols-2">{filteredGoods.slice(0,visibleGoodsCount).map(entry=><InvoiceGoodsCard key={entry.invoice.id} entry={entry} copy={copy}/>)}</div>
                  {filteredGoods.length>visibleGoodsCount&&<Button type="button" variant="outline" className="min-h-11 w-full" onClick={()=>setVisibleGoodsCount(n=>n+20)}>{copy.moreGoods} · {filteredGoods.length-visibleGoodsCount}</Button>}
                </div>}
            </section>
          </section>}

          {activeTab==='history' && <section data-testid="supplier-history-tab" className="space-y-3">
            <h2 className="px-0.5 text-base font-extrabold text-slate-900 dark:text-white">{copy.historyTitle}</h2>
            {(invoiceDeliveryError||verifiedDeliveriesError)&&<div role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <span>{copy.goodsHistoryError}</span>
              <Button variant="outline" size="sm" onClick={()=>{refetchInvoiceDeliveries();refetchDeliveries();}}>{copy.retry}</Button>
            </div>}
            {(isLoading||invoicesLoading||invoiceDeliveryLoading)?<p role="status" className="p-4 text-xs text-slate-600">{copy.loading}</p>:<>
              {completedGoods.length>0&&<section data-testid="supplier-goods-delivery-history" className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{copy.goodsHistoryTitle} · {completedGoods.length}</h3>
                <div className="grid gap-2.5 lg:grid-cols-2">{completedGoods.map(entry=><InvoiceGoodsCard key={entry.invoice.id} entry={entry} copy={copy}/>)}</div>
              </section>}
              {completedPOHistory.length>0&&<section className="space-y-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{copy.ordersTitle} · {completedPOHistory.length}</h3>
                <div className="grid gap-2.5 lg:grid-cols-2">{completedPOHistory.map(po=><POCard key={po.id} po={po} copy={copy} ownerVerification={deliveryByOrder.get(String(po.id))} loading={false} onConfirmShipment={()=>{}}/>)}</div>
              </section>}
              {completedPOHistory.length===0&&completedGoods.length===0&&!invoiceDeliveryError&&
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">{copy.noHistory}</div>}
            </>}
          </section>}
        </main>
      </div>
    </section>
  );
}

// ── Invoice card: accessible financial detail, no duplicate totals ──────────
function InvoiceCard({inv,copy,deliveryReceipt=null,payments=[],paymentsLoading=false,paymentsError=false}){
  const [expanded,setExpanded]=useState(false);
  const statusConf=INV_STATUS[inv.status]||INV_STATUS.pending;
  const evidence=supplierInvoicePaymentEvidence(inv,payments,!paymentsLoading&&!paymentsError);
  const currency=inv.currency||'—';
  const itemRows=Array.isArray(inv.items)?inv.items:[];
  const extraRows=Array.isArray(inv.additional_costs)?inv.additional_costs:[];
  const formatValue=value=>value==null?'—':currency+' '+moneyLabel(value);
  const paymentDetailId='supplier-invoice-detail-'+String(inv.id||'').replace(/[^a-zA-Z0-9-]/g,'');
  return <Card data-testid="supplier-invoice-card" className="min-w-0 overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <CardContent className="min-w-0 space-y-2.5 p-3.5 sm:p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="min-w-0 break-all text-sm font-extrabold text-slate-900 dark:text-white">
            {copy.invoice} #{inv.invoice_number||inv.id?.slice(0,8)}
          </p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5 shrink-0"/>{dateLabel(inv.date||inv.created_date)}</span>
            {inv.due_date && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 shrink-0"/>{copy.due}: {dateLabel(inv.due_date)}</span>}
          </div>
        </div>
        <Badge className={'shrink-0 rounded-full border px-2.5 py-1 text-[11px] '+statusConf.color}>
          {copy.status[inv.status]||statusConf.label}
        </Badge>
      </div>
      {deliveryReceipt&&<div data-testid="supplier-invoice-goods-delivered"
         className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        <p>{copy.ownerApproved} · {dateLabel(deliveryReceipt.confirmed_at)}</p>
        <div className="mt-2 space-y-1">
          {(deliveryReceipt.verified_items||[]).map((item,i)=><div key={i} className="flex min-w-0 justify-between gap-3">
            <span className="min-w-0 break-words">{item.product_name||item.name||'—'}</span>
            <strong className="shrink-0 tabular-nums">{item.received_quantity} {item.unit||''}</strong>
          </div>)}
        </div>
       </div>}
      <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{copy.total}</p>
          <p dir="ltr" className="break-words text-start text-xs font-extrabold tabular-nums text-slate-900 dark:text-white sm:text-sm">{formatValue(evidence.total)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{copy.paid}</p>
          <p dir="ltr" data-testid="supplier-invoice-paid" className="break-words text-start text-xs font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300 sm:text-sm">{formatValue(evidence.paid)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{copy.remaining}</p>
          <p dir="ltr" data-testid="supplier-invoice-remaining" className="break-words text-start text-xs font-extrabold tabular-nums text-rose-700 dark:text-rose-300 sm:text-sm">{formatValue(evidence.remaining)}</p>
        </div>
      </div>
      {evidence.paidPercent!=null && <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        aria-label={copy.paymentBalance} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={evidence.paidPercent}>
        <div className="h-full rounded-full bg-emerald-500" style={{width:evidence.paidPercent+'%'}}/>
      </div>}
      <button type="button" aria-expanded={expanded} aria-controls={paymentDetailId}
        data-testid="supplier-invoice-open-details"
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
        onClick={()=>setExpanded(v=>!v)}>
        <span>{expanded?copy.hideDetails:copy.viewDetails}</span>
        <ChevronDown className={'h-4 w-4 shrink-0 transition-transform '+(expanded?'rotate-180':'')}/>
      </button>
      {expanded && <div id={paymentDetailId} data-testid="supplier-invoice-detail" className="min-w-0 space-y-4 border-t border-slate-200 pt-3 dark:border-slate-700">
        <section aria-label={copy.itemsTitle} className="space-y-2">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{copy.itemsTitle} ({itemRows.length})</h3>
          {itemRows.length>0 ? <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
            {itemRows.map((item,i)=><div key={i} className="flex min-w-0 flex-wrap items-start justify-between gap-2 p-2.5 text-xs">
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold text-slate-900 dark:text-white">{item.product_name||item.name||'—'}</p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  {item.quantity??item.qty??'—'} × {moneyLabel(item.unit_cost??item.unit_price??item.price)} {item.unit||''}
                </p>
              </div>
              <span dir="ltr" className="shrink-0 font-bold tabular-nums text-slate-900 dark:text-white">{formatValue(item.line_total)}</span>
            </div>)}
          </div> : <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-300">{copy.noInvoicesHint}</p>}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800">
            {[[copy.subtotal,inv.subtotal],[copy.tax,inv.tax_amount],[copy.discount,inv.discount_amount]].map(([label,value])=>
              <React.Fragment key={label}><span className="text-slate-600 dark:text-slate-300">{label}</span><strong dir="ltr" className="text-end tabular-nums text-slate-900 dark:text-white">{formatValue(value)}</strong></React.Fragment>)}
            {extraRows.map((item,i)=><React.Fragment key={i}>
              <span className="min-w-0 break-words text-slate-600 dark:text-slate-300">{item.label||item.name||copy.additionalCosts}</span>
              <strong dir="ltr" className="text-end tabular-nums text-slate-900 dark:text-white">{formatValue(item.amount??item.total)}</strong>
            </React.Fragment>)}
            <span className="border-t border-slate-200 pt-2 font-bold text-slate-900 dark:border-slate-700 dark:text-white">{copy.total}</span>
            <strong dir="ltr" className="border-t border-slate-200 pt-2 text-end tabular-nums text-slate-900 dark:border-slate-700 dark:text-white">{formatValue(evidence.total)}</strong>
          </div>
          {inv.notes && <p className="break-words rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{copy.notes}: {inv.notes}</p>}
        </section>
        <section aria-label={copy.paymentsTitle} data-testid="supplier-invoice-payment-history" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white"><Wallet className="h-4 w-4 text-blue-600"/>{copy.paymentsTitle}</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">{evidence.paymentCount}</span>
          </div>
          {paymentsError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{copy.noPaymentFeed}</p>
          : paymentsLoading ? <p role="status" className="text-xs text-slate-600 dark:text-slate-300">{copy.paymentHistoryLoading}</p>
          : evidence.paymentHistory.length===0 ? <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{copy.noPayments}</p>
          : <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
              {evidence.paymentHistory.map(payment=><div key={payment.id} data-testid="supplier-recorded-payment"
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 p-3 text-xs">
                <div><p className="font-semibold text-slate-900 dark:text-white">{copy.recorded} · {dateLabel(payment.date)}</p>
                  <p className="mt-1 text-slate-500 dark:text-slate-400">{copy.paymentMethod}: {copy[payment.payment_method]||payment.payment_method||'—'}</p></div>
                <strong dir="ltr" className="tabular-nums text-emerald-700 dark:text-emerald-300">{formatValue(payment.amount)}</strong>
              </div>)}
            </div>}
          {evidence.historyNeedsReview && <p role="alert" className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>{copy.historyMismatch}
          </p>}
          {evidence.legacyHistoryMissing && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{copy.historyGap}</p>}
          <div className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-700">
            <span className="text-slate-700 dark:text-slate-200">{copy.remaining}</span>
            <strong dir="ltr" className="tabular-nums text-slate-900 dark:text-white">{formatValue(evidence.remaining)}</strong>
          </div>
        </section>
      </div>}
    </CardContent>
  </Card>;
}


function InvoiceGoodsCard({entry,copy}){
  const {invoice,receipt,stage}=entry;
  const [expanded,setExpanded]=useState(false);
  const verified=stage==='received'&&Boolean(receipt);
  const stageLabel=verified?copy.goodsReceived:stage==='awaiting_owner'?copy.goodsAwaitingOwner:copy.goodsPendingApproval;
  const lines=verified&&Array.isArray(receipt.verified_items)?receipt.verified_items:[];
  const draftLines=Array.isArray(invoice.items)?invoice.items:[];
  return <Card data-testid="supplier-invoice-goods-card" className="min-w-0 rounded-2xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <CardContent className="min-w-0 space-y-3 p-3.5 sm:p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="break-all text-sm font-extrabold">{copy.goodsRecord} #{invoice.invoice_number||String(invoice.id).slice(0,8)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{dateLabel(invoice.date||invoice.created_date)}</p>
        </div>
        <Badge className={'max-w-full whitespace-normal rounded-full border px-2.5 py-1 text-[11px] '+
          (verified?PO_STATUS.received.color:stage==='awaiting_owner'?PO_STATUS.shipped.color:PO_STATUS.pending.color)}>{stageLabel}</Badge>
      </div>
      <div data-testid="supplier-goods-progress" className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] font-semibold">
        <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{copy.goodsRecorded}</span>
        <ArrowRight aria-hidden="true" className="h-3 w-3 shrink-0 text-slate-400"/>
        <span className={'min-w-0 rounded-lg px-2 py-1 '+(verified?'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200':'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200')}>{stageLabel}</span>
      </div>
      {verified?<div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
        <p className="flex items-center gap-1.5 font-bold"><CheckCircle2 className="h-4 w-4 shrink-0"/>{copy.goodsVerifiedAt} · {dateLabel(receipt.confirmed_at)}</p>
        <div className="divide-y divide-emerald-200/60 dark:divide-emerald-800">
          {lines.map((item,i)=><div key={i} data-testid="supplier-verified-goods-line" className="flex min-w-0 items-start justify-between gap-2 py-1.5">
            <span className="min-w-0 flex-1 break-words">{item.product_name||item.name||'—'}</span>
            <strong className="shrink-0 tabular-nums">{item.received_quantity} {item.unit||''}</strong>
          </div>)}
        </div>
      </div>:<>
        <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{copy.goodsStatusHint}</p>
        {draftLines.length>0&&<>
          <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}
            className="min-h-10 rounded-lg px-2 text-xs font-bold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950">
            {expanded?copy.hide:copy.show} · {draftLines.length} {copy.items}
          </button>
          {expanded&&<div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800">
            {draftLines.map((item,i)=><div key={i} className="flex min-w-0 justify-between gap-2">
              <span className="min-w-0 break-words">{item.product_name||item.name||'—'}</span>
              <strong className="shrink-0 tabular-nums">×{item.quantity??item.qty??'—'}</strong>
            </div>)}
          </div>}
        </>}
      </>}
    </CardContent>
  </Card>;
}

// ── Purchase order card: unchanged branch-scoped confirmShipment mutation ────
export function POCard({ po, onConfirmShipment, loading, copy, ownerVerification=null }) {
  const statusConf = PO_STATUS[po.status] || PO_STATUS.pending;
  const [expanded,setExpanded]=useState(false);
  const detailsId = React.useId();
  const orderLabel = String(po.order_number || po.id?.slice(0,8) || '—');
  const itemCount = Array.isArray(po.items) ? po.items.length : 0;
  const verifiedCount = Array.isArray(ownerVerification?.verified_items) ? ownerVerification.verified_items.length : 0;
  const shippable = ['draft','sent','pending','approved'].includes(po.status);

  return <Card data-testid="supplier-purchase-order-card" data-compact-default="true"
    className="min-w-0 rounded-2xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <CardContent className="min-w-0 p-3 sm:p-3.5">
      {/* Keep number and status on one mobile row; never force a full heading to wrap. */}
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white"
          title={copy.purchaseOrder+' #'+orderLabel}>
          <Package className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true"/>
          <span className="sr-only">{copy.purchaseOrder}</span>
          <span dir="ltr" className="min-w-0 truncate text-start">#{orderLabel}</span>
        </p>
        <Badge className={'max-w-[45%] shrink-0 truncate rounded-full border px-2.5 py-1 text-[11px] '+statusConf.color}>
          {copy.status[po.status]||statusConf.label}
        </Badge>
      </div>

      <div className="mt-1.5 flex min-w-0 items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/>
          <span className="min-w-0 truncate">{po.branch||copy.unknownBranch}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <Calendar className="h-3.5 w-3.5" aria-hidden="true"/>{dateLabel(po.created_date)}
        </span>
      </div>

      <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-100 pt-2 dark:border-slate-800">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {itemCount} {copy.items}
          {po.status==='received'&&ownerVerification&&<span data-testid="supplier-owner-verified-badge"
            className="ms-2 inline-flex max-w-full items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/>{copy.ownerApproved}
          </span>}
        </span>
        <strong dir="ltr" className="min-w-0 text-end text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
          {po.price_hidden?copy.priceHidden:(po.currency||'')+' '+moneyLabel(po.total_amount)}
        </strong>
      </div>

      <button type="button" data-testid="supplier-po-expand-toggle"
        aria-expanded={expanded} aria-controls={detailsId}
        aria-label={(expanded?copy.hide:copy.show)+' '+copy.details+' #'+orderLabel}
        onClick={()=>setExpanded(v=>!v)}
        className="mt-1.5 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-300">
        <span>{expanded?copy.hide:copy.show} {copy.details}</span>
        <ChevronDown className={'h-4 w-4 transition-transform '+(expanded?'rotate-180':'')} aria-hidden="true"/>
      </button>

      {expanded&&<div id={detailsId} data-testid="supplier-po-expanded-details"
        className="mt-2 space-y-2 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800">
        {itemCount>0&&<div className="space-y-1.5" data-testid="supplier-po-item-lines">
          <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{copy.items} · {itemCount}</p>
          {po.items.map((item,i)=><div key={i} className="flex min-w-0 items-start justify-between gap-2 text-xs">
            <span className="min-w-0 flex-1 break-words text-slate-700 dark:text-slate-200">{item.product_name||item.name||'—'}</span>
            <span dir="ltr" className="shrink-0 whitespace-nowrap font-semibold text-slate-900 dark:text-white">
              ×{item.quantity??item.qty??'—'} {item.unit||''}{po.price_hidden?'':' · '+moneyLabel(item.unit_price)}
            </span>
          </div>)}
        </div>}
        {po.status==='shipped'&&<p data-testid="supplier-awaiting-owner-status"
          className="text-xs font-semibold text-amber-700 dark:text-amber-300">{copy.waitingOwner}</p>}
        {po.status==='received'&&ownerVerification&&<div data-testid="supplier-verified-order-items"
          className="space-y-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs dark:border-emerald-900 dark:bg-emerald-950">
          <p className="font-bold text-emerald-900 dark:text-emerald-100">
            {copy.verifiedItems} · {verifiedCount} · {dateLabel(ownerVerification.confirmed_at)}
          </p>
          {(ownerVerification.verified_items||[]).map((item,i)=><div key={i} className="flex min-w-0 justify-between gap-2">
            <span className="min-w-0 break-words">{item.product_name||item.name||'—'}</span>
            <strong className="shrink-0 tabular-nums">×{item.received_quantity}</strong>
          </div>)}
        </div>}
      </div>}

      {['draft','sent','pending','approved'].includes(po.status) && <Button type="button" disabled={loading} onClick={onConfirmShipment}
        className="mt-2 min-h-11 w-full rounded-xl bg-blue-600 font-bold text-white hover:bg-blue-700">
        <Truck className="me-2 h-4 w-4" aria-hidden="true"/>{copy.confirmShip}
      </Button>}
    </CardContent>
  </Card>;
}
