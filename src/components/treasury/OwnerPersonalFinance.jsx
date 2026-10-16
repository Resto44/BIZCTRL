/**
 * Owner-private accounting. An owner draw is posted to business Treasury
 * atomically by the server, but is a personal cash inflow (NOT an expense).
 * Dashboard is tracked cash FLOW, not a bank balance or full net worth.
 */
import React, { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import useERPSettings from '@/hooks/useERPSettings';
import {
  formatTreasuryCurrency, treasuryCurrencyWarning,
} from '@/lib/treasuryCurrency';
import {
  ownerFinanceSummary, filterOwnerFinance, ownerFinanceTrend,
  ownerFinanceCategories, parseOwnerFinanceAmount, isRealFinanceDate,
  ownerWithdrawalIntegrity, readCompleteOwnerFinance,
  readCompleteOwnerWithdrawalDebits, buildOwnerFinanceCsv,
} from '@/lib/ownerPersonalFinanceAnalytics';
import { createNotification } from '@/lib/notificationEngine';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ArrowDownLeft, ArrowUpRight, Wallet, Camera, ZoomIn, Loader2,
  Trash2, ShieldCheck, AlertTriangle, Download, RefreshCw,
  Search, TrendingUp, Info,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from 'recharts';

const CATEGORIES = [
  { value: 'family', color: '#f59e0b' },
  { value: 'travel', color: '#3b82f6' },
  { value: 'transfers', color: '#8b5cf6' },
  { value: 'vehicles', color: '#6366f1' },
  { value: 'investments', color: '#10b981' },
  { value: 'loans', color: '#ef4444' },
  { value: 'housing', color: '#f97316' },
  { value: 'personal_shopping', color: '#ec4899' },
  { value: 'external_business', color: '#0ea5e9' },
  { value: 'miscellaneous', color: '#94a3b8' },
];
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));
const PERIODS = ['today', 'month', 'previous', '3m', '6m', 'year', 'all'];
const TYPES = ['income','withdrawal','expense'];

const UI = {
  en: {
    title:'Owner Personal Finance', subtitle:'Private cash-flow ledger and documented owner drawings',
    private:'Owner-only private records', privateDetail:'Owner drawings reduce Treasury, never restaurant operating profit. The cash-flow figure below is not your bank balance.',
    newExpense:'Personal expense', newIncome:'Personal income', draw:'Treasury withdrawal',
    dashboard:'Overview', history:'Ledger', charts:'Analytics',
    income:'Personal income', expense:'Personal expenses', withdrawal:'Treasury drawings',
    inflow:'Personal cash inflows', net:'Net recorded cash flow', count:'Records',
    movement:'Money received minus personal spending in the selected period. No opening personal balance is assumed.',
    recent:'Recent activity', noRecords:'No personal entries in this period',
    period:'Period', today:'Today', month:'This month', previous:'Last month', '3m':'Last 3 months', '6m':'Last 6 months', year:'This year', all:'All time',
    allTypes:'All types', search:'Search descriptions, sources and categories',
    export:'Export CSV', chartTitle:'Cash-flow trend — last 6 months',
    byCategory:'Personal expenses by category', noCategory:'No expenses in this period',
    monthNet:'Six-month net flow', loading:'Loading financial records…',
    readFailed:'Personal finance data could not be loaded completely. Totals are hidden.', retry:'Retry',
    ledgerUnavailable:'Treasury posting verification is currently unavailable. Do not assume a withdrawal was reconciled.',
    unmatched:'One or more withdrawals need Treasury reconciliation.',
    matched:'Posted to Treasury', mismatch:'Needs review', pending:'Not verified',
    date:'Date', amount:'Amount', category:'Category', source:'Income source',
    fromWallet:'Treasury wallet', ownerCash:'Owner cash', ownerNetwork:'Owner network',
    method:'Payment method', cash:'Cash', network:'Network / card', bank:'Bank transfer',
    notes:'Description / notes', proof:'Receipt / attachment (optional)',
    upload:'Take photo / choose file', uploading:'Uploading…', attached:'Attachment saved',
    viewProof:'Open attachment', cancel:'Cancel', save:'Save entry', saving:'Saving…',
    confirmDelete:'Delete this unposted personal entry?', delete:'Delete', confirm:'Confirm',
    warn:'This action reduces the selected owner Treasury account. It is separate from restaurant expenses and P&L.',
    saved:'Financial entry saved and confirmed.', deleted:'Entry deleted.', uploadFailed:'Attachment was not uploaded.',
    required:'Enter a valid positive amount (up to 2 decimal places) and real date.',
    ownerOnly:'Select an owner business to continue.', failed:'Save failed. Check the fields and retry.',
    noBalance:'Insufficient balance in the selected Treasury account.',
    noWallet:'Active owner Treasury account is not configured.',
    denied:'You do not have permission to post this entry.',
    immutable:'Posted withdrawals require a separate audited reversal.',
    duplicate:'The entry is not confirmed. Retry the same entry; do not create a second one.',
    record:'Entry', outflow:'Outgoing', noChart:'No chart data yet',
    family:'Family', travel:'Travel', transfers:'Remittance', vehicles:'Vehicles',
    investments:'Investments', loans:'Loans', housing:'Rent / housing',
    personal_shopping:'Shopping', external_business:'External business', miscellaneous:'Other',
    from:'From', type:'Type', reference:'Reference', clear:'Clear',
  },
  fa: {
    title:'حساب‌دهی شخصی مالک',subtitle:'جریان پول شخصی و برداشت‌های مستند از خزانه',
    private:'سوابق خصوصی مالک',privateDetail:'برداشت مالک موجودی خزانه را کم می‌کند، اما هزینه عملیاتی رستورانت نیست. جریان نقدی زیر مانده حساب بانکی شما نیست.',
    newExpense:'مصرف شخصی',newIncome:'درآمد شخصی',draw:'برداشت از خزانه',
    dashboard:'داشبورد',history:'دفتر معاملات',charts:'تحلیل‌ها',
    income:'درآمد شخصی',expense:'مصارف شخصی',withdrawal:'برداشت از خزانه',
    inflow:'ورودی پول شخصی',net:'جریان خالص ثبت‌شده',count:'تعداد اسناد',
    movement:'پول دریافت‌شده منهای مصارف شخصی در دوره انتخاب‌شده؛ مانده ابتدایی شخصی فرض نشده است.',
    recent:'معاملات اخیر',noRecords:'در این دوره سند شخصی ثبت نشده است',
    period:'دوره',today:'امروز',month:'این ماه',previous:'ماه گذشته','3m':'۳ ماه اخیر','6m':'۶ ماه اخیر',year:'امسال',all:'تمام دوره‌ها',
    allTypes:'تمام نوع‌ها',search:'جست‌وجوی توضیحات، منبع و کتگوری',
    export:'خروجی CSV',chartTitle:'روند جریان نقدی — ۶ ماه اخیر',
    byCategory:'مصارف شخصی به تفکیک کتگوری',noCategory:'در این دوره مصرفی وجود ندارد',
    monthNet:'جریان خالص شش ماه',loading:'سوابق مالی بارگذاری می‌شود…',
    readFailed:'بارگذاری کامل حساب‌دهی شخصی ناموفق بود؛ مجموع‌ها نمایش داده نمی‌شوند.',retry:'تلاش دوباره',
    ledgerUnavailable:'تطبیق با دفتر خزانه فعلاً در دسترس نیست؛ برداشت را تطبیق‌شده فرض نکنید.',
    unmatched:'یک یا چند برداشت به بررسی و تطبیق با خزانه نیاز دارد.',
    matched:'ثبت‌شده در خزانه',mismatch:'نیاز به بررسی',pending:'تأییدنشده',
    date:'تاریخ',amount:'مبلغ',category:'کتگوری',source:'منبع درآمد',
    fromWallet:'حساب خزانه',ownerCash:'نقد مالک',ownerNetwork:'شبکه مالک',
    method:'روش پرداخت',cash:'نقد',network:'شبکه / کارت',bank:'حواله بانکی',
    notes:'توضیحات / یادداشت',proof:'رسید / ضمیمه (اختیاری)',
    upload:'عکس بگیرید / فایل انتخاب کنید',uploading:'در حال آپلود…',attached:'ضمیمه ذخیره شد',
    viewProof:'بازکردن ضمیمه',cancel:'لغو',save:'ذخیره سند',saving:'در حال ذخیره…',
    confirmDelete:'این سند شخصی که به خزانه وصل نیست حذف شود؟',delete:'حذف',confirm:'تأیید',
    warn:'این برداشت موجودی حساب انتخاب‌شده مالک را کم می‌کند؛ هزینه رستورانت و سود و زیان عملیاتی را تغییر نمی‌دهد.',
    saved:'سند مالی با موفقیت ثبت و تأیید شد.',deleted:'سند حذف شد.',uploadFailed:'آپلود ضمیمه ناموفق بود.',
    required:'مبلغ مثبت معتبر (حداکثر دو رقم اعشار) و تاریخ واقعی وارد کنید.',
    ownerOnly:'ابتدا کسب‌وکار مالک را انتخاب کنید.',failed:'ذخیره ناموفق بود؛ فیلدها را بررسی و دوباره تلاش کنید.',
    noBalance:'موجودی حساب انتخاب‌شده خزانه کافی نیست.',noWallet:'حساب فعال خزانه مالک تنظیم نشده است.',
    denied:'اجازه ثبت این سند را ندارید.',immutable:'برداشت ثبت‌شده فقط با سند برگشت حسابرسی‌شده قابل اصلاح است.',
    duplicate:'تأیید ثبت مشخص نیست؛ همین سند را تکرار کنید، سند دیگری ایجاد نکنید.',
    record:'سند',outflow:'خروجی',noChart:'هنوز معلومات چارت وجود ندارد',
    family:'خانواده',travel:'سفر',transfers:'حواله',vehicles:'موتر',investments:'سرمایه‌گذاری',
    loans:'قرض‌ها',housing:'کرایه / خانه',personal_shopping:'خرید شخصی',
    external_business:'تجارت بیرونی',miscellaneous:'سایر',
    from:'از',type:'نوع',reference:'مرجع',clear:'پاک‌کردن',
  },
  ar: {
    title:'المالية الشخصية للمالك',subtitle:'التدفقات النقدية الشخصية وسحوبات المالك الموثّقة',
    private:'سجلات خاصة بالمالك',privateDetail:'سحب المالك يخفض الخزينة، لكنه ليس مصروفًا تشغيليًا للمطعم. التدفق النقدي المعروض ليس رصيد حسابك البنكي.',
    newExpense:'مصروف شخصي',newIncome:'دخل شخصي',draw:'سحب من الخزينة',
    dashboard:'لوحة الملخص',history:'دفتر الحركات',charts:'التحليلات',
    income:'الدخل الشخصي',expense:'المصروفات الشخصية',withdrawal:'السحب من الخزينة',
    inflow:'التدفقات الشخصية الواردة',net:'صافي التدفق المسجل',count:'عدد السجلات',
    movement:'المبالغ المستلمة ناقص المصروفات الشخصية خلال الفترة المحددة، دون افتراض رصيد شخصي افتتاحي.',
    recent:'الحركات الأخيرة',noRecords:'لا توجد قيود شخصية خلال هذه الفترة',
    period:'الفترة',today:'اليوم',month:'هذا الشهر',previous:'الشهر السابق','3m':'آخر ٣ أشهر','6m':'آخر ٦ أشهر',year:'هذه السنة',all:'كل الفترات',
    allTypes:'جميع الأنواع',search:'ابحث في الوصف والمصدر والفئة',
    export:'تصدير CSV',chartTitle:'اتجاه التدفق النقدي — آخر ٦ أشهر',
    byCategory:'المصروفات الشخصية حسب الفئة',noCategory:'لا توجد مصروفات في هذه الفترة',
    monthNet:'صافي تدفق ستة أشهر',loading:'جارٍ تحميل السجلات المالية…',
    readFailed:'تعذر تحميل بيانات المالية الشخصية بالكامل؛ تم إخفاء الإجماليات.',retry:'إعادة المحاولة',
    ledgerUnavailable:'تعذر التحقق من ترحيل السحب إلى دفتر الخزينة. لا تعتبر السحب مطابقًا.',
    unmatched:'هناك سحوبات تحتاج مراجعة ومطابقة مع الخزينة.',
    matched:'مرحل إلى الخزينة',mismatch:'يحتاج مراجعة',pending:'غير مؤكد',
    date:'التاريخ',amount:'المبلغ',category:'الفئة',source:'مصدر الدخل',
    fromWallet:'حساب الخزينة',ownerCash:'نقد المالك',ownerNetwork:'شبكة المالك',
    method:'طريقة الدفع',cash:'نقدًا',network:'شبكة / بطاقة',bank:'تحويل بنكي',
    notes:'الوصف / ملاحظات',proof:'إيصال / مرفق (اختياري)',
    upload:'التقاط صورة / اختيار ملف',uploading:'جارٍ الرفع…',attached:'تم إرفاق الملف',
    viewProof:'فتح المرفق',cancel:'إلغاء',save:'حفظ القيد',saving:'جارٍ الحفظ…',
    confirmDelete:'هل تريد حذف هذا القيد الشخصي غير المرحّل؟',delete:'حذف',confirm:'تأكيد',
    warn:'يخفض هذا السحب رصيد خزينة المالك المحددة، دون التأثير على مصروفات المطعم أو الأرباح والخسائر التشغيلية.',
    saved:'تم حفظ القيد المالي وتأكيده.',deleted:'تم حذف القيد.',uploadFailed:'تعذر رفع المرفق.',
    required:'أدخل مبلغًا موجبًا صحيحًا (حتى منزلتين عشريتين) وتاريخًا فعليًا.',
    ownerOnly:'اختر منشأة تملكها أولاً.',failed:'تعذر الحفظ؛ تحقق من الحقول وحاول مجددًا.',
    noBalance:'رصيد حساب الخزينة المحدد غير كافٍ.',noWallet:'لم يتم إعداد حساب خزينة نشط للمالك.',
    denied:'ليست لديك صلاحية تسجيل هذا القيد.',immutable:'السحوبات المرحلة تتطلب قيدًا عكسيًا موثقًا.',
    duplicate:'لم يتم تأكيد التسجيل؛ أعد محاولة القيد نفسه ولا تنشئ قيدًا آخر.',
    record:'القيد',outflow:'صادر',noChart:'لا توجد بيانات للرسم بعد',
    family:'الأسرة',travel:'السفر',transfers:'الحوالات',vehicles:'السيارات',
    investments:'الاستثمارات',loans:'القروض',housing:'الإيجار / السكن',
    personal_shopping:'المشتريات الشخصية',external_business:'نشاط خارجي',miscellaneous:'أخرى',
    from:'من',type:'النوع',reference:'المرجع',clear:'مسح',
  },
};
const initialForm = () => ({
  record_type: 'expense', date: format(new Date(), 'yyyy-MM-dd'), amount: '',
  category: 'miscellaneous', source: '', payment_method: 'cash',
  wallet_source: 'owner_cash', notes: '',
});

const recordTypeLabel = (ui, type) => type === 'income' ? ui.income : type === 'withdrawal' ? ui.withdrawal : ui.expense;
const walletLabel = (ui, value) => value === 'owner_network' ? ui.ownerNetwork : ui.ownerCash;

function EntryRow({ entry, money, ui, onDelete, onAttachment, integrity }) {
  const type = entry.record_type || entry.type;
  const isIncome = type === 'income';
  const matched = type === 'withdrawal' && integrity?.get(entry.id);
  const cat = CAT_MAP[entry.category];
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border/80 bg-background px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2">
        <span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' +
          (isIncome || type === 'withdrawal' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
          {isIncome || type === 'withdrawal' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
            <span>{recordTypeLabel(ui, type)}</span>
            {cat && type === 'expense' && <Badge variant="secondary" className="text-[10px]">{ui[cat.value]}</Badge>}
            {type === 'withdrawal' && integrity && <Badge variant="outline" className={'text-[10px] ' +
              (matched === 'matched' ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 text-amber-700')}>
              {matched === 'matched' ? ui.matched : ui.mismatch}
            </Badge>}
          </div>
          <p dir="auto" className="mt-0.5 max-w-full break-words text-xs text-muted-foreground">
            {entry.date} {entry.source ? ' · ' + entry.source : ''}
            {type === 'withdrawal' ? ' · ' + walletLabel(ui, entry.wallet_source) : ''}
          </p>
          {entry.notes && <p dir="auto" className="mt-1 break-words text-xs text-muted-foreground">{entry.notes}</p>}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 self-end sm:self-auto">
        <strong dir="ltr" className={'whitespace-nowrap text-sm tabular-nums ' +
          (isIncome || type === 'withdrawal' ? 'text-emerald-700' : 'text-rose-600')}>
          {(isIncome || type === 'withdrawal' ? '+' : '−') + money(entry.amount)}
        </strong>
        {entry.proof_url && <Button type="button" size="icon" variant="outline" className="h-8 w-8"
          aria-label={ui.viewProof} onClick={() => onAttachment(entry.proof_url)}><ZoomIn className="h-4 w-4" /></Button>}
        {type !== 'withdrawal' && <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive"
          aria-label={ui.delete} onClick={() => onDelete(entry.id)}><Trash2 className="h-4 w-4" /></Button>}
      </div>
    </div>
  );
}

export default function OwnerPersonalFinance() {
  const { user } = useAuth();
  const { currency, lang } = useLanguage();
  const { orgId, activeRestaurantId, activeRestaurant } = useTenant();
  const { settings: erpSettings, lastSavedAt } = useERPSettings();
  const ui = UI[lang] || UI.en;
  const moneyOptions = {
    appCurrency: currency, restaurantCurrency: activeRestaurant?.currency,
    financeCurrency: lastSavedAt ? erpSettings?.finance?.currencyCode : null, lang,
  };
  const money = (value) => formatTreasuryCurrency(value, moneyOptions);
  const qc = useQueryClient();
  const [tab, setTab] = useState('dashboard');
  const [period, setPeriod] = useState('month');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const [formType, setFormType] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [proofUrl, setProofUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [attachmentUrl, setAttachmentUrl] = useState(null);
  const pendingId = useRef(null);
  const saveLock = useRef(false);
  const proofRef = useRef(null);
  const isOwner = Boolean(activeRestaurantId && user?.email && user?.role === 'owner');

  const { data: records = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['owner_personal_finance', activeRestaurantId, user?.email],
    queryFn: () => readCompleteOwnerFinance(supabase, activeRestaurantId, user.email),
    enabled: isOwner, staleTime: 30000, retry: 1,
  });
  const hasWithdrawals = records.some((r) => (r.record_type || r.type) === 'withdrawal');
  const { data: debitRows = [], isError: ledgerError, isLoading: ledgerLoading, refetch: refetchDebits } = useQuery({
    queryKey: ['owner_personal_finance_ledger', activeRestaurantId],
    queryFn: () => readCompleteOwnerWithdrawalDebits(supabase, activeRestaurantId),
    enabled: isOwner && hasWithdrawals, staleTime: 30000, retry: 1,
  });

  const visible = useMemo(() => filterOwnerFinance(records, { period }), [records, period]);
  const listRecords = useMemo(() => filterOwnerFinance(records, { period, type, search }), [records, period, type, search]);
  const summary = useMemo(() => ownerFinanceSummary(visible), [visible]);
  const trend = useMemo(() => ownerFinanceTrend(records), [records]);
  const breakdown = useMemo(() => ownerFinanceCategories(visible), [visible]);
  const integrityRows = useMemo(() => ownerWithdrawalIntegrity(records, debitRows), [records, debitRows]);
  const integrity = useMemo(() => new Map(integrityRows.map(r => [r.id, r.status])), [integrityRows]);
  const unmatched = !ledgerError && !ledgerLoading && integrityRows.filter(r => r.status !== 'matched').length;

  const saveMut = useMutation({
    mutationFn: async (record) => {
      try {
        return await base44.entities.OwnerPersonalFinance.create(record);
      } catch (error) {
        // On uncertain network confirmation a retry reuses the same record id.
        if (error?.code === '23505' && record.id) {
          const { data, error: verify } = await supabase.from('owner_personal_finance')
            .select('id,restaurant_id,record_type,amount,created_by')
            .eq('id', record.id).eq('restaurant_id', record.restaurant_id)
            .eq('created_by', user.email).maybeSingle();
          if (!verify && data?.id === record.id && data.record_type === record.record_type &&
              Number(data.amount) === record.amount) return data;
        }
        throw error;
      }
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.OwnerPersonalFinance.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owner_personal_finance'] });
      setDeleteId(null);
      toast.success(ui.deleted);
    },
    onError: () => toast.error(ui.failed),
  });
  const setField = (key, value) => {
    pendingId.current = null;
    setSaveError('');
    setForm(prev => ({ ...prev, [key]: value }));
  };
  const openForm = (newType) => {
    pendingId.current = null;
    setForm({ ...initialForm(), record_type: newType });
    setProofUrl(''); setSaveError(''); setFormType(newType);
  };
  const saveMessage = (error) => {
    const message = String(error?.message || '');
    if (message.includes('ERP_PERSONAL_FINANCE_INSUFFICIENT_BALANCE')) return ui.noBalance;
    if (message.includes('ERP_PERSONAL_FINANCE_WALLET_NOT_CONFIGURED')) return ui.noWallet;
    if (message.includes('ERP_PERSONAL_FINANCE_POSTED_IMMUTABLE')) return ui.immutable;
    if (error?.code === '42501' || message.includes('row-level security')) return ui.denied;
    return ui.failed;
  };
  const uploadProof = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      if (!result?.file_url) throw new Error('Upload not confirmed');
      setProofUrl(result.file_url);
      pendingId.current = null;
    } catch {
      toast.error(ui.uploadFailed);
    } finally {
      setUploading(false);
    }
  };
  const save = async () => {
    if (saveLock.current || saveMut.isPending || uploading) return;
    setSaveError('');
    const amount = parseOwnerFinanceAmount(form.amount);
    if (amount === null || !isRealFinanceDate(form.date)) {
      setSaveError(ui.required); return;
    }
    if (!isOwner) { setSaveError(ui.ownerOnly); return; }
    pendingId.current ||= crypto.randomUUID();
    saveLock.current = true;
    try {
      const payload = {
        ...form, id: pendingId.current, amount,
        restaurant_id: activeRestaurantId, org_id: orgId,
        type: form.record_type, description: form.notes?.trim() || null,
        notes: form.notes?.trim() || null, source: form.source?.trim() || null,
        recorded_by: user.email, proof_url: proofUrl || null,
      };
      const saved = await saveMut.mutateAsync(payload);
      if (!saved?.id) throw new Error('No saved row confirmation');
      pendingId.current = null;
      setFormType(null); setForm(initialForm()); setProofUrl('');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['owner_personal_finance'] }),
        qc.invalidateQueries({ queryKey: ['owner_personal_finance_ledger'] }),
        qc.invalidateQueries({ queryKey: ['wallet_transactions'] }),
        qc.invalidateQueries({ queryKey: ['treasury_owner_central_transactions'] }),
        qc.invalidateQueries({ queryKey: ['treasury_accounts'] }),
      ]);
      toast.success(ui.saved);
      if (payload.record_type === 'withdrawal' && amount > 5000) {
        try {
          await createNotification({
            orgId, type: 'info', severity: 'warning', targetRole: 'owner',
            title: '⚠️ Large Personal Withdrawal',
            message: 'Owner withdrew ' + money(amount) + ' from Treasury for personal use',
            amount, actorEmail: user.email, actorName: user?.full_name,
          });
        } catch (notificationError) {
          console.warn('[OwnerPersonalFinance] optional notification failed', notificationError);
        }
      }
    } catch (error) {
      const msg = saveMessage(error);
      setSaveError(msg); toast.error(msg);
    } finally { saveLock.current = false; }
  };
  const refresh = () => { refetch(); if (hasWithdrawals) refetchDebits(); };
  const downloadCsv = () => {
    if (!listRecords.length || isError || !isOwner) return;
    const columns = [
      { label: ui.date, get: r => r.date },
      { label: ui.type, get: r => recordTypeLabel(ui, r.record_type || r.type) },
      { label: ui.amount, get: r => Number(r.amount || 0).toFixed(2) },
      { label: ui.category, get: r => ui[r.category] || r.category },
      { label: ui.source, get: r => r.source },
      { label: ui.fromWallet, get: r => (r.record_type || r.type) === 'withdrawal' ? walletLabel(ui, r.wallet_source) : '' },
      { label: ui.method, get: r => r.payment_method },
      { label: ui.notes, get: r => r.notes },
      { label: ui.reference, get: r => r.id },
    ];
    const csv = buildOwnerFinanceCsv(listRecords, columns);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'BizCTRL-Owner-Personal-Finance-' + format(new Date(),'yyyyMMdd') + '.csv';
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  };
  const chartColors = { Income:'#10b981', Withdrawals:'#f59e0b', Expenses:'#ef4444' };

  if (!isOwner) return <Card role="alert" className="p-4">{ui.ownerOnly}</Card>;
  if (isError) return <Card role="alert" className="space-y-3 border-rose-300 p-5">
    <p className="font-semibold text-rose-700">{ui.readFailed}</p>
    <Button type="button" variant="outline" onClick={refresh}><RefreshCw className="me-2 h-4 w-4"/>{ui.retry}</Button>
  </Card>;

  if (isLoading) return <Card role="status" className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin"/>{ui.loading}
  </Card>;

  const rowProps = { money, ui, onDelete:setDeleteId, onAttachment:setAttachmentUrl,
    integrity: hasWithdrawals && !ledgerError && !ledgerLoading ? integrity : null };

  return <section dir={lang === 'en' ? 'ltr' : 'rtl'} className="min-w-0 space-y-4 pb-4">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">{ui.title}</h2>
        <p className="text-xs text-muted-foreground sm:text-sm">{ui.subtitle}</p>
      </div>
      <Button size="sm" type="button" variant="outline" onClick={refresh} disabled={isLoading}>
        <RefreshCw className={'me-1.5 h-4 w-4 ' + (isLoading ? 'animate-spin' : '')}/>{ui.retry}
      </Button>
    </div>

    <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-3 text-violet-800">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <div><p className="text-xs font-bold">{ui.private}</p>
          <p className="mt-1 text-xs leading-5">{ui.privateDetail}</p>
        </div>
      </div>
    </div>
    {treasuryCurrencyWarning(moneyOptions) && <p role="note" className="rounded-lg border border-amber-300 px-3 py-2 text-xs text-amber-800">
      {treasuryCurrencyWarning(moneyOptions)}
    </p>}
    {hasWithdrawals && ledgerError && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-300 p-3 text-xs text-rose-800">
      <AlertTriangle className="h-4 w-4 shrink-0" />{ui.ledgerUnavailable}
    </div>}
    {Boolean(unmatched) && <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-300 p-3 text-xs text-amber-800">
      <AlertTriangle className="h-4 w-4 shrink-0" />{ui.unmatched}
    </div>}

    <div className="grid min-w-0 grid-cols-3 gap-2">
      <Button type="button" variant="outline" onClick={() => openForm('expense')} className="h-auto min-h-16 flex-col gap-1 whitespace-normal border-rose-200 px-1 py-2 text-center text-[11px] font-semibold leading-tight text-rose-700 sm:text-sm">
        <ArrowUpRight className="h-4 w-4 shrink-0" />{ui.newExpense}
      </Button>
      <Button type="button" variant="outline" onClick={() => openForm('income')} className="h-auto min-h-16 flex-col gap-1 whitespace-normal border-emerald-200 px-1 py-2 text-center text-[11px] font-semibold leading-tight text-emerald-700 sm:text-sm">
        <ArrowDownLeft className="h-4 w-4 shrink-0" />{ui.newIncome}
      </Button>
      <Button type="button" variant="outline" onClick={() => openForm('withdrawal')} className="h-auto min-h-16 flex-col gap-1 whitespace-normal border-amber-200 px-1 py-2 text-center text-[11px] font-semibold leading-tight text-amber-700 sm:text-sm">
        <Wallet className="h-4 w-4 shrink-0" />{ui.draw}
      </Button>
    </div>

    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Label className="text-xs font-semibold">{ui.period}</Label>
      <Select value={period} onValueChange={setPeriod}>
        <SelectTrigger className="h-9 w-44 max-w-full text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>{PERIODS.map(p => <SelectItem key={p} value={p}>{ui[p]}</SelectItem>)}</SelectContent>
      </Select>
    </div>

    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="grid w-full min-w-0 grid-cols-3">
        <TabsTrigger value="dashboard" className="min-w-0 text-xs sm:text-sm">{ui.dashboard}</TabsTrigger>
        <TabsTrigger value="history" className="min-w-0 text-xs sm:text-sm">{ui.history}</TabsTrigger>
        <TabsTrigger value="charts" className="min-w-0 text-xs sm:text-sm">{ui.charts}</TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard" className="mt-3 space-y-3">
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
          {[
            { key:'income', value:summary.income, tone:'border-emerald-200 bg-emerald-50 text-emerald-800', icon:<ArrowDownLeft className="h-4 w-4"/> },
            { key:'withdrawal', value:summary.withdrawal, tone:'border-amber-200 bg-amber-50 text-amber-800', icon:<Wallet className="h-4 w-4"/> },
            { key:'expense', value:summary.expense, tone:'border-rose-200 bg-rose-50 text-rose-700', icon:<ArrowUpRight className="h-4 w-4"/> },
            { key:'net', value:summary.netFlow, tone:summary.netFlow < 0 ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-blue-200 bg-blue-50 text-blue-800',icon:<TrendingUp className="h-4 w-4"/> },
          ].map(kpi => <Card key={kpi.key} className={'min-w-0 space-y-1 rounded-2xl p-3 sm:p-4 ' + kpi.tone}>
            <div className="flex items-center gap-1.5 text-xs font-semibold">{kpi.icon}<span>{ui[kpi.key]}</span></div>
            <p dir="ltr" className="break-all text-start text-lg font-extrabold tabular-nums sm:text-xl">{money(kpi.value)}</p>
          </Card>)}
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0"/>{ui.movement}
        </p>
        <Card className="p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold">{ui.recent}</h3>
            <Badge variant="outline">{ui.count}: {summary.count}</Badge>
          </div>
          {isLoading ? <p className="py-6 text-center text-xs text-muted-foreground">{ui.loading}</p>
            : visible.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{ui.noRecords}</p>
              : <div className="space-y-2">{visible.slice(0, 8).map(entry => <EntryRow key={entry.id} entry={entry} {...rowProps} />)}</div>}
        </Card>
      </TabsContent>

      <TabsContent value="history" className="mt-3 space-y-3">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="min-w-0 sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{ui.allTypes}</SelectItem>
              {TYPES.map(t => <SelectItem key={t} value={t}>{recordTypeLabel(ui,t)}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="min-w-0 ps-8" value={search} onChange={e=>setSearch(e.target.value)} placeholder={ui.search} />
          </div>
          <Button type="button" variant="outline" onClick={downloadCsv} disabled={!listRecords.length || isLoading} className="shrink-0">
            <Download className="me-1.5 h-4 w-4"/>{ui.export}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{ui.count}: {listRecords.length}</p>
        {isLoading ? <p className="py-6 text-center text-sm">{ui.loading}</p>
          : listRecords.length === 0 ? <Card className="p-7 text-center text-sm text-muted-foreground">{ui.noRecords}</Card>
            : <div className="space-y-2">{listRecords.map(entry => <EntryRow key={entry.id} entry={entry} {...rowProps}/>)}</div>}
      </TabsContent>

      <TabsContent value="charts" className="mt-3 space-y-3">
        <Card className="min-w-0 p-3 sm:p-4">
          <h3 className="mb-3 text-sm font-bold">{ui.chartTitle}</h3>
          {trend.every(r=>r.Income===0 && r.Withdrawals===0 && r.Expenses===0)
            ? <p className="py-10 text-center text-xs text-muted-foreground">{ui.noChart}</p>
            : <div dir="ltr" className="h-64 min-w-0 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{top:8,right:4,left:-22,bottom:10}}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                  <XAxis dataKey="label" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/>
                  <Tooltip formatter={(v, key) => [money(v), key]}/>
                  <Legend wrapperStyle={{fontSize:10}} />
                  <Bar name={ui.income} dataKey="Income" stackId="in" fill={chartColors.Income}/>
                  <Bar name={ui.withdrawal} dataKey="Withdrawals" stackId="in" fill={chartColors.Withdrawals}/>
                  <Bar name={ui.expense} dataKey="Expenses" fill={chartColors.Expenses}/>
                </BarChart>
              </ResponsiveContainer>
            </div>}
        </Card>
        <Card className="min-w-0 p-3 sm:p-4">
          <h3 className="mb-3 text-sm font-bold">{ui.byCategory} · {ui[period]}</h3>
          {!breakdown.length ? <p className="py-10 text-center text-xs text-muted-foreground">{ui.noCategory}</p> :
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div dir="ltr" className="h-56 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={breakdown.map(r=>({ ...r, name:ui[r.key]||r.key, value:r.amount }))} dataKey="value" nameKey="name"
                    innerRadius={48} outerRadius={78} cx="50%" cy="50%">
                    {breakdown.map(r=><Cell key={r.key} fill={CAT_MAP[r.key]?.color || '#94a3b8'}/>)}
                  </Pie><Tooltip formatter={v=>money(v)}/></PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex min-w-0 flex-col justify-center gap-2">
                {breakdown.map(r => <div key={r.key} className="flex min-w-0 items-center justify-between gap-3 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{backgroundColor:CAT_MAP[r.key]?.color || '#94a3b8'}}/>
                    <span>{ui[r.key] || r.key}</span>
                  </span><span dir="ltr" className="shrink-0 font-bold tabular-nums">{money(r.amount)}</span>
                </div>)}
              </div>
            </div>}
        </Card>
      </TabsContent>
    </Tabs>

    <Dialog open={Boolean(formType)} onOpenChange={open => {if (!open && !saveMut.isPending) {
      setFormType(null); setSaveError(''); setProofUrl(''); pendingId.current=null;
    }}}>
      <DialogContent dir={lang === 'en'?'ltr':'rtl'} className="max-h-[88dvh] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader><DialogTitle className="text-base sm:text-lg">{recordTypeLabel(ui, formType)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {formType === 'withdrawal' && <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>{ui.warn}
          </div>}
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0"><Label className="text-xs">{ui.date} *</Label>
              <Input type="date" dir="ltr" className="mt-1 w-full min-w-0 max-w-full text-base"
                value={form.date} onChange={e=>setField('date',e.target.value)} /></div>
            <div className="min-w-0"><Label className="text-xs">{ui.amount} *</Label>
              <Input dir="ltr" type="text" inputMode="decimal" className="mt-1 w-full min-w-0 max-w-full text-base tabular-nums"
                value={form.amount} onChange={e=>setField('amount',e.target.value)} placeholder="0.00"/></div>
          </div>
          {formType === 'expense' && <div><Label>{ui.category}</Label>
            <Select value={form.category} onValueChange={v=>setField('category',v)}>
              <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c=><SelectItem key={c.value} value={c.value}>{ui[c.value]}</SelectItem>)}</SelectContent>
            </Select></div>}
          {formType === 'income' && <div><Label>{ui.source}</Label>
            <Input className="mt-1" dir="auto" value={form.source} onChange={e=>setField('source',e.target.value)} /></div>}
          {formType === 'withdrawal' && <div><Label>{ui.fromWallet}</Label>
            <Select value={form.wallet_source} onValueChange={v=>{
              pendingId.current=null; setSaveError('');
              setForm(current=>({...current,wallet_source:v,payment_method:v==='owner_cash'?'cash':'network'}));
            }}>
              <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="owner_cash">{ui.ownerCash}</SelectItem>
                <SelectItem value="owner_network">{ui.ownerNetwork}</SelectItem>
              </SelectContent>
            </Select></div>}
          <div><Label>{ui.method}</Label>
            <Select value={form.payment_method} onValueChange={v=>setField('payment_method',v)}>
              <SelectTrigger className="mt-1"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{ui.cash}</SelectItem>
                <SelectItem value="network">{ui.network}</SelectItem>
                <SelectItem value="bank_transfer">{ui.bank}</SelectItem>
              </SelectContent>
            </Select></div>
          <div><Label>{ui.notes}</Label>
            <Input dir="auto" className="mt-1" value={form.notes} onChange={e=>setField('notes',e.target.value)} /></div>
          <div><Label className="mb-1 block">{ui.proof}</Label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed px-3 py-3 text-xs text-muted-foreground">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Camera className="h-4 w-4"/>}
              {uploading ? ui.uploading : proofUrl ? ui.attached : ui.upload}
              <input ref={proofRef} type="file" className="hidden" accept="image/*,.pdf" onChange={uploadProof} disabled={uploading}/>
            </label>
            {proofUrl && <Button type="button" size="sm" variant="link" onClick={()=>setAttachmentUrl(proofUrl)}>{ui.viewProof}</Button>}
          </div>
          {saveError && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{saveError}</p>}
          <div className="flex min-w-0 gap-2 pt-1">
            <Button type="button" className="min-w-0 flex-1" disabled={saveMut.isPending || uploading || !form.amount} onClick={save}>
              {saveMut.isPending ? <Loader2 className="me-1 h-4 w-4 animate-spin"/> : null}
              {saveMut.isPending ? ui.saving : ui.save}
            </Button>
            <Button type="button" className="min-w-0 flex-1" variant="outline" disabled={saveMut.isPending} onClick={()=>setFormType(null)}>{ui.cancel}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={Boolean(deleteId)} onOpenChange={open=>{if(!open && !deleteMut.isPending)setDeleteId(null)}}>
      <AlertDialogContent dir={lang==='en'?'ltr':'rtl'}>
        <AlertDialogHeader><AlertDialogTitle>{ui.confirmDelete}</AlertDialogTitle></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMut.isPending}>{ui.cancel}</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground" disabled={deleteMut.isPending} onClick={()=>deleteMut.mutate(deleteId)}>{ui.delete}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog open={Boolean(attachmentUrl)} onOpenChange={open=>{if(!open)setAttachmentUrl(null)}}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-xl">
        <DialogHeader><DialogTitle>{ui.viewProof}</DialogTitle></DialogHeader>
        {attachmentUrl && (attachmentUrl.toLowerCase().split('?')[0].endsWith('.pdf') ?
          <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="underline">{ui.viewProof}</a> :
          <a href={attachmentUrl} target="_blank" rel="noopener noreferrer">
            <img src={attachmentUrl} alt={ui.proof} className="max-h-[70dvh] w-full rounded-lg object-contain"/>
          </a>)}
      </DialogContent>
    </Dialog>
  </section>;
}
