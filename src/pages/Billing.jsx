import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useSubscription } from '@/lib/SubscriptionContext';
import { createPaymentProvider } from '@/lib/payment/PaymentProvider';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  Building2, Check, CircleDollarSign, Clock3, CreditCard, FileText, Loader2,
  Sparkles, UserRound, Users, RotateCcw, Camera, Database, Landmark, Copy,
} from 'lucide-react';

const COPY = {
  en: {
    title: 'Billing & Subscription', currentPlan: 'Current plan', status: 'Subscription status',
    trial: 'Free trial', trialRemaining: 'days remaining', starts: 'Start date', ends: 'End date',
    renewal: 'Next renewal', planAccess: 'ERP access', granted: 'Available', restricted: 'Billing only',
    usage: 'Usage & limits', availablePlans: 'Available plans', paymentHistory: 'Payment history',
    subscriptionHistory: 'Subscription history', choose: 'Choose Plan', upgrade: 'Upgrade plan', downgrade: 'Downgrade plan', current: 'Current plan',
    pending: 'Payment pending', cancel: 'Cancel at period end', renew: 'Keep subscription',
    ibanTitle: 'Manual IBAN payment', ibanInstructions: 'Transfer the exact amount using the information below, then upload a PDF or image proof for Platform Owner review.', paymentReference: 'Bank transfer reference', uploadProof: 'Upload payment proof', submitProof: 'Submit proof for review', proofAccepted: 'Your proof has been submitted. The subscription will activate only after Platform Owner approval.', ownerOnly: 'Billing actions are available to the organization owner.',
    priceMonth: '/ month', original: 'Original', final: 'Final', noRecords: 'No records yet.',
    paymentSelected: 'A manual IBAN payment request has been created. This plan remains unavailable until your payment proof is approved by the Platform Owner.',
    paddlePending: 'Paddle checkout has opened. Your plan will update only after Paddle sends a verified subscription event.', managePaddle: 'Manage in Paddle',
    actionFailed: 'The requested billing action could not be completed.', limits: 'Limits', modules: 'Included modules',
    pendingDetails: 'This paid plan is awaiting payment confirmation. It has not been activated.',
    reactivate: 'Reactivate with payment', reactivateDetails: 'Reactivation requires a new payment request and Platform Owner approval. Your ERP access will resume only after approval.',
    testOnly: 'Test payment', iban: 'IBAN', bank: 'Bank', beneficiary: 'Account holder', company: 'Company', amount: 'Amount', selectedPlan: 'Selected plan', currency: 'Currency', paymentStatus: 'Payment status', proofStatus: 'Payment proof', waitingForPayment: 'Waiting for payment', pendingReview: 'Pending review', proofReady: 'Ready to submit', proofNotSubmitted: 'Not submitted', transferInstructions: 'Transfer instructions', paymentReferenceRules: 'Payment reference rules', selectedFile: 'Selected file', copyIban: 'Copy IBAN', copied: 'Copied', ibanCopied: 'IBAN copied successfully', loadingSubscription: 'Loading subscription…', retry: 'Retry',
  },
  ar: {
    title: 'الفوترة والاشتراك', currentPlan: 'الخطة الحالية', status: 'حالة الاشتراك',
    trial: 'التجربة المجانية', trialRemaining: 'يوماً متبقياً', starts: 'تاريخ البدء', ends: 'تاريخ الانتهاء',
    renewal: 'التجديد القادم', planAccess: 'دخول نظام ERP', granted: 'متاح', restricted: 'الفوترة فقط',
    usage: 'الاستخدام والحدود', availablePlans: 'الخطط المتاحة', paymentHistory: 'سجل المدفوعات',
    subscriptionHistory: 'سجل الاشتراك', choose: 'اختر الخطة', upgrade: 'ترقية الخطة', downgrade: 'تخفيض الخطة', current: 'الخطة الحالية',
    pending: 'الدفع قيد الانتظار', cancel: 'إلغاء عند نهاية الفترة', renew: 'الاحتفاظ بالاشتراك',
    ibanTitle: 'دفع يدوي عبر IBAN', ibanInstructions: 'حوّل المبلغ الدقيق بالمعلومات أدناه، ثم ارفع إثبات PDF أو صورة لمراجعة مالك المنصة.', paymentReference: 'مرجع التحويل البنكي', uploadProof: 'رفع إثبات الدفع', submitProof: 'إرسال الإثبات للمراجعة', proofAccepted: 'تم إرسال الإثبات. لا يُفعّل الاشتراك إلا بعد موافقة مالك المنصة.', ownerOnly: 'إجراءات الفوترة متاحة لمالك المؤسسة فقط.',
    priceMonth: '/ شهرياً', original: 'الأصلي', final: 'النهائي', noRecords: 'لا توجد سجلات بعد.',
    paymentSelected: 'تم إنشاء طلب دفع يدوي عبر IBAN. تظل الخطة غير نشطة حتى يوافق مالك المنصة على إثبات الدفع.',
    paddlePending: 'تم فتح صفحة Paddle. لا تتغير الخطة إلا بعد وصول حدث اشتراك موثّق من Paddle.', managePaddle: 'الإدارة في Paddle',
    actionFailed: 'تعذر إكمال إجراء الفوترة المطلوب.', limits: 'الحدود', modules: 'الوحدات المتاحة',
    pendingDetails: 'هذه الخطة المدفوعة بانتظار تأكيد الدفع ولم يتم تفعيلها.',
    reactivate: 'إعادة التفعيل عبر الدفع', reactivateDetails: 'تتطلب إعادة التفعيل طلب دفع جديداً وموافقة مالك المنصة. سيعود الوصول إلى ERP بعد الموافقة فقط.',
    testOnly: 'دفعة اختبار', iban: 'IBAN', bank: 'البنك', beneficiary: 'صاحب الحساب', company: 'الشركة', amount: 'المبلغ', selectedPlan: 'الخطة المختارة', currency: 'العملة', paymentStatus: 'حالة الدفع', proofStatus: 'إثبات الدفع', waitingForPayment: 'بانتظار الدفع', pendingReview: 'قيد المراجعة', proofReady: 'جاهز للإرسال', proofNotSubmitted: 'لم يُرسل', transferInstructions: 'تعليمات التحويل', paymentReferenceRules: 'قواعد مرجع الدفع', selectedFile: 'الملف المحدد', copyIban: 'نسخ IBAN', copied: 'تم النسخ', ibanCopied: 'تم نسخ IBAN بنجاح', loadingSubscription: 'جارٍ تحميل الاشتراك…', retry: 'إعادة المحاولة',
  },
  fa: {
    title: 'صورتحساب و اشتراک', currentPlan: 'طرح فعلی', status: 'وضعیت اشتراک',
    trial: 'دوره آزمایشی رایگان', trialRemaining: 'روز باقی‌مانده', starts: 'تاریخ شروع', ends: 'تاریخ پایان',
    renewal: 'تمدید بعدی', planAccess: 'دسترسی ERP', granted: 'در دسترس', restricted: 'فقط صورتحساب',
    usage: 'مصرف و محدودیت‌ها', availablePlans: 'طرح‌های موجود', paymentHistory: 'تاریخچه پرداخت',
    subscriptionHistory: 'تاریخچه اشتراک', choose: 'انتخاب طرح', upgrade: 'ارتقای طرح', downgrade: 'کاهش طرح', current: 'طرح فعلی',
    pending: 'پرداخت در انتظار', cancel: 'لغو در پایان دوره', renew: 'ادامه اشتراک',
    ibanTitle: 'پرداخت دستی IBAN', ibanInstructions: 'مبلغ دقیق را با اطلاعات زیر انتقال دهید و سپس مدرک PDF یا تصویر را برای بررسی مالک پلتفرم بارگذاری کنید.', paymentReference: 'مرجع انتقال بانکی', uploadProof: 'بارگذاری مدرک پرداخت', submitProof: 'ارسال مدرک برای بررسی', proofAccepted: 'مدرک ارسال شد. اشتراک فقط پس از تأیید مالک پلتفرم فعال می‌شود.', ownerOnly: 'اقدامات صورتحساب فقط برای مالک سازمان در دسترس است.',
    priceMonth: '/ ماه', original: 'قیمت اصلی', final: 'قیمت نهایی', noRecords: 'هنوز رکوردی وجود ندارد.',
    paymentSelected: 'درخواست پرداخت دستی IBAN ایجاد شد. این طرح تا تأیید مدرک پرداخت توسط مالک پلتفرم فعال نمی‌شود.',
    paddlePending: 'پرداخت Paddle باز شد. طرح فقط پس از رویداد تأییدشده اشتراک از Paddle به‌روزرسانی می‌شود.', managePaddle: 'مدیریت در Paddle',
    actionFailed: 'اقدام صورتحساب مورد نظر انجام نشد.', limits: 'محدودیت‌ها', modules: 'ماژول‌های شامل',
    pendingDetails: 'این طرح پولی در انتظار تأیید پرداخت است و فعال نشده است.',
    reactivate: 'فعال‌سازی مجدد با پرداخت', reactivateDetails: 'فعال‌سازی مجدد به درخواست پرداخت جدید و تأیید مالک پلتفرم نیاز دارد. دسترسی ERP فقط پس از تأیید بازمی‌گردد.',
    testOnly: 'پرداخت آزمایشی', iban: 'IBAN', bank: 'بانک', beneficiary: 'صاحب حساب', company: 'شرکت', amount: 'مبلغ', selectedPlan: 'طرح انتخاب‌شده', currency: 'ارز', paymentStatus: 'وضعیت پرداخت', proofStatus: 'مدرک پرداخت', waitingForPayment: 'در انتظار پرداخت', pendingReview: 'در انتظار بررسی', proofReady: 'آماده ارسال', proofNotSubmitted: 'ارسال نشده', transferInstructions: 'دستورالعمل انتقال', paymentReferenceRules: 'قوانین مرجع پرداخت', selectedFile: 'فایل انتخاب‌شده', copyIban: 'کپی IBAN', copied: 'کپی شد', ibanCopied: 'IBAN با موفقیت کپی شد', loadingSubscription: 'در حال بارگذاری اشتراک…', retry: 'تلاش دوباره',
  },
};

const STATUS_STYLE = {
  TRIAL: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  PENDING_PAYMENT: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  PAST_DUE: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
  CANCELED: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
  EXPIRED: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
};

const FEATURE_LABELS = {
  en: { sales: 'Sales', purchases: 'Purchases', expenses: 'Expenses', inventory: 'Inventory', basic_reports: 'Basic reports', treasury: 'Treasury', suppliers: 'Suppliers', reports: 'Reports', pdf_exports: 'PDF exports', ocr: 'OCR', advanced_analytics: 'Advanced analytics', driver_analytics: 'Driver analytics', scheduled_reports: 'Scheduled reports', cashflow_forecast: 'Cash-flow forecast', network_management: 'Network management', ai_copilot: 'AI copilot' },
  ar: { sales: 'المبيعات', purchases: 'المشتريات', expenses: 'المصروفات', inventory: 'المخزون', basic_reports: 'التقارير الأساسية', treasury: 'الخزينة', suppliers: 'الموردون', reports: 'التقارير', pdf_exports: 'تصدير PDF', ocr: 'OCR', advanced_analytics: 'التحليلات المتقدمة', driver_analytics: 'تحليلات السائقين', scheduled_reports: 'التقارير المجدولة', cashflow_forecast: 'توقعات التدفق النقدي', network_management: 'إدارة الشبكة', ai_copilot: 'مساعد الذكاء الاصطناعي' },
  fa: { sales: 'فروش', purchases: 'خرید', expenses: 'هزینه‌ها', inventory: 'انبار', basic_reports: 'گزارش‌های پایه', treasury: 'خزانه', suppliers: 'تأمین‌کنندگان', reports: 'گزارش‌ها', pdf_exports: 'خروجی PDF', ocr: 'OCR', advanced_analytics: 'تحلیل پیشرفته', driver_analytics: 'تحلیل رانندگان', scheduled_reports: 'گزارش‌های زمان‌بندی‌شده', cashflow_forecast: 'پیش‌بینی جریان نقدی', network_management: 'مدیریت شبکه', ai_copilot: 'دستیار هوش مصنوعی' },
};

function displayStatus(status) {
  return String(status || 'EXPIRED').replaceAll('_', ' ');
}

function formatDate(value, lang) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(lang === 'fa' ? 'fa-IR' : lang === 'ar' ? 'ar-SA' : 'en-GB', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return value;
  }
}

function money(cents, currency = 'USD', lang = 'en') {
  const amount = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat(lang === 'fa' ? 'fa-IR' : lang === 'ar' ? 'ar-SA' : 'en-US', { style: 'currency', currency: String(currency || 'USD').toUpperCase(), maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${String(currency || 'USD').toUpperCase()} ${amount.toFixed(2)}`;
  }
}

function capacitySummary(item, lang) {
  if (lang === 'ar') return `${item.max_users} مستخدمين · ${item.max_branches} فروع · ${item.max_employees} موظفين`;
  if (lang === 'fa') return `${item.max_users} کاربر · ${item.max_branches} شعبه · ${item.max_employees} کارمند`;
  return `${item.max_users} users · ${item.max_branches} branches · ${item.max_employees} employees`;
}

export default function Billing() {
  const { lang, isRTL } = useLanguage();
  const subscription = useSubscription();
  const {
    summary, plans, payments, events, loading, error, status, plan, planName, limits, usage, exceededLimits, isWithinCapacity, refresh,
    trialDaysRemaining, isActive, pendingPaymentId, canManageBilling, cancelAtPeriodEnd, renewSubscription,
    getManualPaymentInstructions, submitManualPaymentProof,
  } = subscription;
  const provider = useMemo(() => createPaymentProvider(subscription), [subscription]);
  const [acting, setActing] = useState('');
  const [notice, setNotice] = useState('');
  const [manualPayment, setManualPayment] = useState(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentProof, setPaymentProof] = useState(null);
  const [pendingInstructions, setPendingInstructions] = useState(null);
  const [ibanCopied, setIbanCopied] = useState(false);
  const paymentIntentInFlight = useRef(false);
  const copy = COPY[lang] || COPY.en;
  const safePlans = Array.isArray(plans) ? plans : [];
  const selectedPlan = safePlans.find((item) => item.id === (manualPayment?.plan_id || plan)) || null;
  const isPaddleProvider = provider.id === 'paddle';
  const isPaddleSubscription = summary.payment_provider === 'paddle';

  useEffect(() => {
    let mounted = true;
    if (!canManageBilling || status !== 'PENDING_PAYMENT' || manualPayment?.instructions) return undefined;
    getManualPaymentInstructions()
      .then((instructions) => { if (mounted) setPendingInstructions(instructions); })
      .catch(() => {
        if (mounted) {
          setPendingInstructions(null);
          setNotice(copy.actionFailed);
        }
      });
    return () => { mounted = false; };
  }, [canManageBilling, copy.actionFailed, getManualPaymentInstructions, manualPayment?.instructions, status]);

  const runAction = async (action, work, successMessage = '') => {
    setActing(action);
    setNotice('');
    try {
      await work();
      setNotice(successMessage);
    } catch (nextError) {
      setNotice(nextError?.message || copy.actionFailed);
    } finally {
      setActing('');
    }
  };

  const usageItems = [
    { key: 'branches', label: lang === 'ar' ? 'الفروع' : lang === 'fa' ? 'شعبه‌ها' : 'Branches', icon: Building2 },
    { key: 'employees', label: lang === 'ar' ? 'الموظفون' : lang === 'fa' ? 'کارمندان' : 'Employees', icon: Users },
    { key: 'users', label: lang === 'ar' ? 'المستخدمون' : lang === 'fa' ? 'کاربران' : 'Users', icon: UserRound },
    { key: 'storage_mb', label: lang === 'ar' ? 'التخزين' : lang === 'fa' ? 'فضای ذخیره‌سازی' : 'Storage', icon: Database },
    { key: 'pdf_exports', label: lang === 'ar' ? 'تقارير PDF' : lang === 'fa' ? 'گزارش PDF' : 'PDF reports', icon: FileText },
    { key: 'ocr_scans', label: 'OCR', icon: Camera },
  ];

  const beginManualPayment = async (planId) => {
    if (paymentIntentInFlight.current) return;
    paymentIntentInFlight.current = true;
    setActing(`plan-${planId}`);
    setNotice('');
    try {
      const intent = await provider.createCheckout(planId);
      if (isPaddleProvider) {
        if (intent?.flow === 'manage_existing_subscription' && intent?.url) {
          window.location.assign(intent.url);
          return;
        }
        await refresh();
        setNotice(copy.paddlePending);
        return;
      }
      const instructions = await getManualPaymentInstructions();
      setManualPayment({ ...intent, instructions });
      setPendingInstructions(instructions);
      setNotice(copy.paymentSelected);
    } catch (nextError) {
      setNotice(nextError?.message || copy.actionFailed);
    } finally {
      paymentIntentInFlight.current = false;
      setActing('');
    }
  };

  const beginReactivation = async () => {
    setActing('reactivate');
    setNotice('');
    try {
      if (isPaddleProvider) {
        const intent = await provider.createCheckout(plan);
        if (intent?.flow === 'manage_existing_subscription' && intent?.url) {
          window.location.assign(intent.url);
          return;
        }
        await refresh();
        setNotice(copy.paddlePending);
        return;
      }
      const intent = await renewSubscription();
      const instructions = await getManualPaymentInstructions();
      setManualPayment({ ...intent, instructions });
      setPendingInstructions(instructions);
      setNotice(copy.paymentSelected);
    } catch (nextError) {
      setNotice(nextError?.message || copy.actionFailed);
    } finally {
      setActing('');
    }
  };

  const openPaddlePortal = () => runAction('paddle-portal', async () => {
    const url = await provider.openCustomerPortal();
    window.location.assign(url);
  });
  const submitProof = () => runAction('submit-proof', () => submitManualPaymentProof(manualPayment?.payment_id || pendingPaymentId, paymentReference, paymentProof), copy.proofAccepted);
  const billingInstructions = manualPayment?.instructions || pendingInstructions;
  const billingAmountCents = manualPayment?.amount_cents || summary.pricing?.monthly_price_cents;
  const billingCurrency = manualPayment?.currency || billingInstructions?.currency || 'USD';
  const paymentStatus = manualPayment?.status || (pendingPaymentId ? 'pending' : 'waiting_for_payment');
  const proofStatus = paymentProof ? 'ready_to_submit' : (payments.find((payment) => payment.id === (manualPayment?.payment_id || pendingPaymentId))?.payment_proof_key ? 'submitted' : 'not_submitted');
  const paymentStatusLabel = paymentStatus === 'pending' ? copy.pendingReview : copy.waitingForPayment;
  const proofStatusLabel = proofStatus === 'ready_to_submit' ? copy.proofReady : proofStatus === 'submitted' ? copy.pendingReview : copy.proofNotSubmitted;
  const reactivationRequiresPayment = canManageBilling
    && ['CANCELED', 'EXPIRED', 'PAST_DUE'].includes(status)
    && Boolean(plan)
    && Number(summary.pricing?.monthly_price_cents || 0) > 0;

  const copyIban = async () => {
    const iban = String(billingInstructions?.iban || '').trim();
    if (!iban) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(iban);
      } else {
        const fallback = document.createElement('textarea');
        fallback.value = iban;
        fallback.setAttribute('readonly', '');
        fallback.style.position = 'fixed';
        fallback.style.opacity = '0';
        document.body.appendChild(fallback);
        fallback.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(fallback);
        if (!copied) throw new Error('CLIPBOARD_WRITE_FAILED');
      }
      setIbanCopied(true);
      setNotice(copy.ibanCopied);
      window.setTimeout(() => setIbanCopied(false), 1800);
    } catch (nextError) {
      setNotice(nextError?.message || copy.actionFailed);
    }
  };

  return (
    <div className="space-y-6 pb-10" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader title={copy.title} />

      {notice && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          <span>{error.message}</span>
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={loading}><RotateCcw className="me-1 h-4 w-4" />{copy.retry}</Button>
        </div>
      )}

      <Card className="overflow-hidden border-primary/20 shadow-sm">
        <div className="bg-gradient-to-br from-primary/15 via-background to-amber-50/80 px-5 py-5 dark:to-amber-950/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{copy.currentPlan}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">{planName}</h1>
                <Badge className={`border-0 font-semibold ${STATUS_STYLE[status] || STATUS_STYLE.EXPIRED}`}>{displayStatus(status)}</Badge>
              </div>
              {status === 'PENDING_PAYMENT' && <p className="mt-2 max-w-2xl text-sm text-amber-800 dark:text-amber-200">{copy.pendingDetails}</p>}
            </div>
            <div className="grid grid-cols-2 gap-x-7 gap-y-3 text-sm sm:grid-cols-3">
              <div><p className="text-xs text-muted-foreground">{copy.starts}</p><p className="mt-0.5 font-semibold">{formatDate(summary.current_period_start || summary.trial_start, lang)}</p></div>
              <div><p className="text-xs text-muted-foreground">{status === 'TRIAL' ? copy.ends : copy.renewal}</p><p className="mt-0.5 font-semibold">{formatDate(status === 'TRIAL' ? summary.trial_end : summary.current_period_end, lang)}</p></div>
              <div><p className="text-xs text-muted-foreground">{copy.planAccess}</p><p className={`mt-0.5 font-semibold ${isActive ? 'text-emerald-600' : 'text-rose-600'}`}>{isActive ? copy.granted : copy.restricted}</p></div>
            </div>
          </div>
          {status === 'TRIAL' && (
            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-sky-950 px-4 py-3 text-sky-50 shadow-sm">
              <Clock3 className="h-5 w-5 shrink-0 text-sky-300" />
              <p className="font-semibold">{copy.trial}: {trialDaysRemaining} {copy.trialRemaining}</p>
              <p className="text-sm text-sky-200">{formatDate(summary.trial_end, lang)}</p>
            </div>
          )}
        </div>
        <CardContent className="pt-5">
          <div className="flex flex-wrap gap-2">
            {canManageBilling && isPaddleSubscription && (
              <Button variant="outline" onClick={openPaddlePortal} disabled={Boolean(acting)}>{acting === 'paddle-portal' && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{copy.managePaddle}</Button>
            )}
            {canManageBilling && !isPaddleSubscription && status === 'ACTIVE' && !summary.cancel_at_period_end && (
              <Button variant="outline" onClick={() => runAction('cancel', cancelAtPeriodEnd)} disabled={Boolean(acting)}>{acting === 'cancel' && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{copy.cancel}</Button>
            )}
            {canManageBilling && !isPaddleSubscription && status === 'ACTIVE' && summary.cancel_at_period_end && (
              <Button onClick={() => runAction('renew', renewSubscription)} disabled={Boolean(acting)}><RotateCcw className="me-2 h-4 w-4" />{copy.renew}</Button>
            )}
            {reactivationRequiresPayment && (
              <div className="flex flex-wrap items-center gap-2"><Button onClick={beginReactivation} disabled={Boolean(acting)}>{acting === 'reactivate' && <Loader2 className="me-2 h-4 w-4 animate-spin" />}<RotateCcw className="me-2 h-4 w-4" />{copy.reactivate}</Button><span className="text-sm text-muted-foreground">{copy.reactivateDetails}</span></div>
            )}
            {!canManageBilling && <p className="text-sm text-muted-foreground">{copy.ownerOnly}</p>}
          </div>
        </CardContent>
      </Card>

      <section>
        <div className="mb-3 flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-primary" /><h2 className="text-lg font-bold">{copy.usage}</h2></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {usageItems.map(({ key, label, icon: Icon }) => {
            const used = Number(usage[key] || 0);
            const limit = Number(limits[key] || 0);
            const exceeded = limit > 0 && used > limit;
            const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
            return <Card key={key} className={exceeded ? 'border-rose-300 bg-rose-50/50 dark:border-rose-900 dark:bg-rose-950/20' : ''}><CardContent className="p-4"><div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-medium"><Icon className={`h-4 w-4 ${exceeded ? 'text-rose-600' : 'text-muted-foreground'}`} />{label}</span><span className={`text-xs ${exceeded ? 'font-semibold text-rose-700 dark:text-rose-300' : 'text-muted-foreground'}`}>{used} / {limit || '—'}</span></div><Progress value={percent} className={percent >= 80 || exceeded ? '[&>div]:bg-rose-500' : ''} />{exceeded && <p className="mt-2 text-xs font-medium text-rose-700 dark:text-rose-300">Limit exceeded — Upgrade Plan required for additional {label.toLowerCase()}.</p>}</CardContent></Card>;
          })}
        </div>
        {!isWithinCapacity && exceededLimits.length > 0 && (
          <div role="alert" className="mt-4 flex flex-col gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold">Upgrade Plan required for additional resources.</p><p className="mt-1">Existing data is retained. Creation is blocked only for resources above the current plan limit.</p><ul className="mt-2 list-inside list-disc">{exceededLimits.map((item) => <li key={item.resource}>{item.resource}: {item.used} / {item.limit}</li>)}</ul></div>
            <Button asChild className="shrink-0"><a href="#available-plans">Upgrade Plan</a></Button>
          </div>
        )}
      </section>

      <section id="available-plans">
        <div className="mb-3 flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><h2 className="text-lg font-bold">{copy.availablePlans}</h2></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {safePlans.map((item) => {
            const isCurrent = item.id === plan && ['TRIAL', 'ACTIVE', 'PENDING_PAYMENT'].includes(status);
            const discount = Boolean(item.discount_active) && Number(item.original_price_cents) > Number(item.monthly_price_cents);
            const selectedPending = status === 'PENDING_PAYMENT' && item.id === plan;
            const allModules = lang === 'ar' ? 'جميع وحدات ERP' : lang === 'fa' ? 'همه ماژول‌های ERP' : 'All ERP modules';
            const featureFlags = Array.isArray(item.feature_flags) ? item.feature_flags : [];
            const features = featureFlags.includes('all') ? [allModules] : featureFlags.map((feature) => FEATURE_LABELS[lang]?.[feature] || FEATURE_LABELS.en[feature] || String(feature).replaceAll('_', ' '));
            const isDowngrade = Number(item.monthly_price_cents) < Number(summary.pricing?.monthly_price_cents || 0);
            const paidAction = isDowngrade ? copy.downgrade : copy.upgrade;
            return <Card key={item.id} className={`relative overflow-hidden ${isCurrent ? 'ring-2 ring-primary shadow-md' : ''}`}>
              {discount && <Badge className="absolute end-3 top-3 bg-rose-600 text-white">{item.discount_label || `-${item.discount_percent}%`}</Badge>}
              <CardHeader className="pb-2"><CardTitle className="text-lg">{item.display_name}</CardTitle><div className="flex items-end gap-2"><span className="text-3xl font-black">{money(item.monthly_price_cents)}</span><span className="pb-1 text-xs text-muted-foreground">{copy.priceMonth}</span></div>{discount && <p className="text-xs text-muted-foreground"><span className="line-through">{copy.original}: {money(item.original_price_cents)}</span> · <span className="font-semibold text-emerald-700">{copy.final}: {money(item.monthly_price_cents)}</span></p>}{Number(item.trial_days) > 0 && <p className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs leading-5 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">First month free ({item.trial_days}-day trial). After the free month, your subscription renews at {money(item.monthly_price_cents)}{copy.priceMonth} unless cancelled.</p>}</CardHeader>
              <CardContent className="space-y-4"><p className="text-xs text-muted-foreground">{capacitySummary(item, lang)}</p><ul className="space-y-1.5 text-sm text-muted-foreground">{features.slice(0, 5).map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />{feature}</li>)}</ul>{isCurrent && !selectedPending ? <Badge variant="secondary" className="w-full justify-center py-2">{copy.current}</Badge> : !canManageBilling ? <Button className="w-full" disabled>{copy.ownerOnly}</Button> : <Button className="w-full" disabled={Boolean(acting) || selectedPending} onClick={() => beginManualPayment(item.id)}><CreditCard className="me-2 h-4 w-4" />{selectedPending ? copy.pending : paidAction}</Button>}</CardContent>
            </Card>;
          })}
        </div>
        {!safePlans.length && !loading && <p className="mt-3 text-sm text-muted-foreground">{copy.noRecords}</p>}
      </section>

      {canManageBilling && (manualPayment || (status === 'PENDING_PAYMENT' && summary.payment_provider === 'manual_iban')) && (
        <Card className="border-violet-300 bg-violet-50/60 dark:bg-violet-950/15">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-violet-900 dark:text-violet-200"><Landmark className="h-5 w-5" />{copy.ibanTitle}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-violet-900/80 dark:text-violet-100/80">{copy.ibanInstructions}</p>
            <div className="grid gap-3 rounded-xl border bg-background p-4 text-sm sm:grid-cols-2">
              <p><span className="text-muted-foreground">{copy.selectedPlan}</span><br /><strong>{selectedPlan?.display_name || planName}</strong></p>
              <p><span className="text-muted-foreground">{copy.amount}</span><br /><strong>{money(billingAmountCents, billingCurrency, lang)}</strong></p>
              <p><span className="text-muted-foreground">{copy.currency}</span><br /><strong>{billingCurrency}</strong></p>
              <p><span className="text-muted-foreground">{copy.paymentStatus}</span><br /><strong>{paymentStatusLabel}</strong></p>
              <p><span className="text-muted-foreground">{copy.proofStatus}</span><br /><strong>{proofStatusLabel}</strong></p>
            </div>
            {billingInstructions && <>
              <div className="grid gap-3 rounded-xl border bg-background p-4 text-sm sm:grid-cols-2">
                <p><span className="text-muted-foreground">{copy.company}</span><br /><strong>{billingInstructions.company_name || '—'}</strong></p>
                <p><span className="text-muted-foreground">{copy.bank}</span><br /><strong>{billingInstructions.bank_name || '—'}</strong></p>
                <div className="sm:col-span-2"><span className="text-muted-foreground">{copy.iban}</span><div className="mt-1 flex flex-wrap items-center gap-2"><strong className="select-all break-all font-mono tracking-wide" dir="ltr">{billingInstructions.iban}</strong><Button type="button" size="sm" variant="outline" onClick={copyIban} aria-label={copy.copyIban}><Copy className="me-1 h-4 w-4" />{ibanCopied ? copy.copied : copy.copyIban}</Button></div></div>
                <p><span className="text-muted-foreground">{copy.beneficiary}</span><br /><strong>{billingInstructions.account_holder || billingInstructions.beneficiary_name || '—'}</strong></p>
                {billingInstructions.payment_reference_rules && <p><span className="text-muted-foreground">{copy.paymentReferenceRules}</span><br /><strong>{billingInstructions.payment_reference_rules}</strong></p>}
                {billingInstructions.instructions && <p className="sm:col-span-2"><span className="font-semibold">{copy.transferInstructions}: </span>{billingInstructions.instructions}</p>}
              </div>
            </>}
            <div className="grid gap-3 sm:grid-cols-2"><div><label className="text-sm font-medium">{copy.paymentReference}</label><Input className="mt-1" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></div><div><label className="text-sm font-medium">{copy.uploadProof}</label><Input className="mt-1" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setPaymentProof(event.target.files?.[0] || null)} />{paymentProof && <p className="mt-1 text-xs text-muted-foreground">{copy.selectedFile}: {paymentProof.name}</p>}</div></div>
            <Button disabled={Boolean(acting) || !billingInstructions || !paymentReference || !paymentProof} onClick={submitProof}>{acting === 'submit-proof' && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{copy.submitProof}</Button>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-5 xl:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">{copy.paymentHistory}</CardTitle></CardHeader><CardContent className="space-y-3">{payments.length ? payments.map((payment) => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><div><p className="font-semibold">{payment.display_label || `${payment.plan_id} · ${payment.status}`}</p><p className="text-xs text-muted-foreground">{formatDate(payment.created_at, lang)} · {money(payment.amount_cents)}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{payment.status}</Badge>{payment.is_test && <Badge className="bg-amber-500 text-amber-950">{copy.testOnly}</Badge>}</div></div>) : <p className="text-sm text-muted-foreground">{copy.noRecords}</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">{copy.subscriptionHistory}</CardTitle></CardHeader><CardContent className="space-y-3">{events.length ? events.map((event) => <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"><div><p className="font-semibold">{String(event.event_type || '').replaceAll('_', ' ')}</p><p className="text-xs text-muted-foreground">{formatDate(event.created_at, lang)}</p></div><Badge variant="outline">{event.next_status || '—'}</Badge></div>) : <p className="text-sm text-muted-foreground">{copy.noRecords}</p>}</CardContent></Card>
      </section>

      {loading && <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{copy.loadingSubscription}</div>}
    </div>
  );
}
