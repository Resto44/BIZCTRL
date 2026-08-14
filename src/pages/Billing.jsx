import React, { useMemo, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useSubscription } from '@/lib/SubscriptionContext';
import { createPaymentProvider } from '@/lib/payment/PaymentProvider';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle, BadgeCheck, Building2, CalendarClock, Check, CircleDollarSign,
  Clock3, CreditCard, FileText, FlaskConical, Loader2, ShieldCheck, Sparkles,
  UserRound, Users, XCircle, RotateCcw, Camera, Database,
} from 'lucide-react';

const COPY = {
  en: {
    title: 'Billing & Subscription', currentPlan: 'Current plan', status: 'Subscription status',
    trial: 'Free trial', trialRemaining: 'days remaining', starts: 'Start date', ends: 'End date',
    renewal: 'Next renewal', planAccess: 'ERP access', granted: 'Available', restricted: 'Billing only',
    usage: 'Usage & limits', availablePlans: 'Available plans', paymentHistory: 'Payment history',
    subscriptionHistory: 'Subscription history', choose: 'Choose Plan', upgrade: 'Upgrade plan', downgrade: 'Downgrade plan', current: 'Current plan',
    selectFree: 'Select Free', pending: 'Payment pending', cancel: 'Cancel at period end', renew: 'Keep subscription',
    testMode: 'TEST MODE — Mock Payment Provider', testOnly: 'TEST ONLY', simulateSuccess: 'Simulate successful payment',
    simulateFailure: 'Simulate failed payment', simulateRenewal: 'Simulate renewal', simulateCancellation: 'Simulate cancellation',
    simulateExpiration: 'Simulate expiration', noGateway: 'No live payment gateway is connected. Simulations never create a real transaction.',
    disabledTest: 'TEST MODE is disabled in this environment.', ownerOnly: 'Billing actions are available to the organization owner.',
    priceMonth: '/ month', original: 'Original', final: 'Final', noRecords: 'No records yet.',
    paymentSelected: 'A TEST ONLY payment request has been created. This plan remains unavailable until a simulated confirmation is run by an owner in enabled TEST MODE.',
    actionFailed: 'The requested billing action could not be completed.', limits: 'Limits', modules: 'Included modules',
    pendingDetails: 'This paid plan is awaiting payment confirmation. It has not been activated.',
  },
  ar: {
    title: 'الفوترة والاشتراك', currentPlan: 'الخطة الحالية', status: 'حالة الاشتراك',
    trial: 'التجربة المجانية', trialRemaining: 'يوماً متبقياً', starts: 'تاريخ البدء', ends: 'تاريخ الانتهاء',
    renewal: 'التجديد القادم', planAccess: 'دخول نظام ERP', granted: 'متاح', restricted: 'الفوترة فقط',
    usage: 'الاستخدام والحدود', availablePlans: 'الخطط المتاحة', paymentHistory: 'سجل المدفوعات',
    subscriptionHistory: 'سجل الاشتراك', choose: 'اختر الخطة', upgrade: 'ترقية الخطة', downgrade: 'تخفيض الخطة', current: 'الخطة الحالية',
    selectFree: 'اختر الخطة المجانية', pending: 'الدفع قيد الانتظار', cancel: 'إلغاء عند نهاية الفترة', renew: 'الاحتفاظ بالاشتراك',
    testMode: 'وضع الاختبار — مزود دفع وهمي', testOnly: 'للاختبار فقط', simulateSuccess: 'محاكاة دفع ناجح',
    simulateFailure: 'محاكاة دفع فاشل', simulateRenewal: 'محاكاة التجديد', simulateCancellation: 'محاكاة الإلغاء',
    simulateExpiration: 'محاكاة الانتهاء', noGateway: 'لا توجد بوابة دفع فعلية. عمليات المحاكاة لا تنشئ أي معاملة حقيقية.',
    disabledTest: 'وضع الاختبار معطل في هذه البيئة.', ownerOnly: 'إجراءات الفوترة متاحة لمالك المؤسسة فقط.',
    priceMonth: '/ شهرياً', original: 'الأصلي', final: 'النهائي', noRecords: 'لا توجد سجلات بعد.',
    paymentSelected: 'تم إنشاء طلب دفع للاختبار فقط. تظل الخطة غير نشطة حتى يؤكدها المالك في وضع الاختبار المفعّل.',
    actionFailed: 'تعذر إكمال إجراء الفوترة المطلوب.', limits: 'الحدود', modules: 'الوحدات المتاحة',
    pendingDetails: 'هذه الخطة المدفوعة بانتظار تأكيد الدفع ولم يتم تفعيلها.',
  },
  fa: {
    title: 'صورتحساب و اشتراک', currentPlan: 'طرح فعلی', status: 'وضعیت اشتراک',
    trial: 'دوره آزمایشی رایگان', trialRemaining: 'روز باقی‌مانده', starts: 'تاریخ شروع', ends: 'تاریخ پایان',
    renewal: 'تمدید بعدی', planAccess: 'دسترسی ERP', granted: 'در دسترس', restricted: 'فقط صورتحساب',
    usage: 'مصرف و محدودیت‌ها', availablePlans: 'طرح‌های موجود', paymentHistory: 'تاریخچه پرداخت',
    subscriptionHistory: 'تاریخچه اشتراک', choose: 'انتخاب طرح', upgrade: 'ارتقای طرح', downgrade: 'کاهش طرح', current: 'طرح فعلی',
    selectFree: 'انتخاب رایگان', pending: 'پرداخت در انتظار', cancel: 'لغو در پایان دوره', renew: 'ادامه اشتراک',
    testMode: 'حالت آزمایش — ارائه‌دهنده پرداخت ساختگی', testOnly: 'فقط آزمایشی', simulateSuccess: 'شبیه‌سازی پرداخت موفق',
    simulateFailure: 'شبیه‌سازی پرداخت ناموفق', simulateRenewal: 'شبیه‌سازی تمدید', simulateCancellation: 'شبیه‌سازی لغو',
    simulateExpiration: 'شبیه‌سازی انقضا', noGateway: 'هیچ درگاه پرداخت واقعی متصل نیست. شبیه‌سازی‌ها تراکنش واقعی ایجاد نمی‌کنند.',
    disabledTest: 'حالت آزمایش در این محیط غیرفعال است.', ownerOnly: 'اقدامات صورتحساب فقط برای مالک سازمان در دسترس است.',
    priceMonth: '/ ماه', original: 'قیمت اصلی', final: 'قیمت نهایی', noRecords: 'هنوز رکوردی وجود ندارد.',
    paymentSelected: 'درخواست پرداخت فقط آزمایشی ایجاد شد. این طرح تا تأیید شبیه‌سازی‌شده توسط مالک در حالت آزمایش فعال نمی‌شود.',
    actionFailed: 'اقدام صورتحساب مورد نظر انجام نشد.', limits: 'محدودیت‌ها', modules: 'ماژول‌های شامل',
    pendingDetails: 'این طرح پولی در انتظار تأیید پرداخت است و فعال نشده است.',
  },
};

const STATUS_STYLE = {
  TRIAL: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  FREE: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
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

function money(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(0)}`;
}

function capacitySummary(item, lang) {
  if (lang === 'ar') return `${item.max_restaurants} مطاعم · ${item.max_branches} فروع · ${item.max_employees} موظفين`;
  if (lang === 'fa') return `${item.max_restaurants} رستوران · ${item.max_branches} شعبه · ${item.max_employees} کارمند`;
  return `${item.max_restaurants} restaurants · ${item.max_branches} branches · ${item.max_employees} employees`;
}

export default function Billing() {
  const { lang, isRTL } = useLanguage();
  const subscription = useSubscription();
  const {
    summary, plans, payments, events, loading, error, status, plan, planName, limits, usage,
    trialDaysRemaining, isActive, isPendingPayment, pendingPaymentId, isTestModeEnabled,
    canManageBilling, selectFreePlan, cancelAtPeriodEnd, renewSubscription,
  } = subscription;
  const provider = useMemo(() => createPaymentProvider(subscription), [subscription]);
  const [acting, setActing] = useState('');
  const [notice, setNotice] = useState('');
  const copy = COPY[lang] || COPY.en;

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

  return (
    <div className="space-y-6 pb-10" dir={isRTL ? 'rtl' : 'ltr'}>
      <PageHeader title={copy.title} />

      {notice && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          {error.message}
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
                {summary.payment_provider === 'mock_test' && <Badge variant="outline" className="border-amber-500 text-amber-700">{copy.testOnly}</Badge>}
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
            {canManageBilling && status === 'ACTIVE' && !summary.cancel_at_period_end && (
              <Button variant="outline" onClick={() => runAction('cancel', cancelAtPeriodEnd)} disabled={Boolean(acting)}>{acting === 'cancel' && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{copy.cancel}</Button>
            )}
            {canManageBilling && status === 'ACTIVE' && summary.cancel_at_period_end && (
              <Button onClick={() => runAction('renew', renewSubscription)} disabled={Boolean(acting)}><RotateCcw className="me-2 h-4 w-4" />{copy.renew}</Button>
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
            const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
            return <Card key={key}><CardContent className="p-4"><div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-muted-foreground" />{label}</span><span className="text-xs text-muted-foreground">{used} / {limit || '—'}</span></div><Progress value={percent} className={percent >= 80 ? '[&>div]:bg-rose-500' : ''} /></CardContent></Card>;
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><h2 className="text-lg font-bold">{copy.availablePlans}</h2></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((item) => {
            const isCurrent = item.id === plan && ['TRIAL', 'FREE', 'ACTIVE', 'PENDING_PAYMENT'].includes(status);
            const isFree = Number(item.monthly_price_cents) === 0;
            const discount = Boolean(item.discount_active) && Number(item.original_price_cents) > Number(item.monthly_price_cents);
            const selectedPending = status === 'PENDING_PAYMENT' && item.id === plan;
            const allModules = lang === 'ar' ? 'جميع وحدات ERP' : lang === 'fa' ? 'همه ماژول‌های ERP' : 'All ERP modules';
            const features = item.feature_flags?.includes('all') ? [allModules] : (item.feature_flags || []).map((feature) => FEATURE_LABELS[lang]?.[feature] || FEATURE_LABELS.en[feature] || feature.replaceAll('_', ' '));
            const isDowngrade = Number(item.monthly_price_cents) < Number(summary.pricing?.monthly_price_cents || 0);
            const paidAction = isDowngrade ? copy.downgrade : copy.upgrade;
            return <Card key={item.id} className={`relative overflow-hidden ${isCurrent ? 'ring-2 ring-primary shadow-md' : ''}`}>
              {discount && <Badge className="absolute end-3 top-3 bg-rose-600 text-white">{item.discount_label || `-${item.discount_percent}%`}</Badge>}
              <CardHeader className="pb-2"><CardTitle className="text-lg">{item.display_name}</CardTitle><div className="flex items-end gap-2"><span className="text-3xl font-black">{money(item.monthly_price_cents)}</span><span className="pb-1 text-xs text-muted-foreground">{copy.priceMonth}</span></div>{discount && <p className="text-xs text-muted-foreground"><span className="line-through">{copy.original}: {money(item.original_price_cents)}</span> · <span className="font-semibold text-emerald-700">{copy.final}: {money(item.monthly_price_cents)}</span></p>}</CardHeader>
              <CardContent className="space-y-4"><p className="text-xs text-muted-foreground">{capacitySummary(item, lang)}</p><ul className="space-y-1.5 text-sm text-muted-foreground">{features.slice(0, 5).map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />{feature}</li>)}</ul>{isCurrent && !selectedPending ? <Badge variant="secondary" className="w-full justify-center py-2">{copy.current}</Badge> : !canManageBilling ? <Button className="w-full" disabled>{copy.ownerOnly}</Button> : isFree ? <Button className="w-full" variant="outline" disabled={Boolean(acting)} onClick={() => runAction('free', selectFreePlan)}>{copy.selectFree}</Button> : <Button className="w-full" disabled={Boolean(acting) || selectedPending} onClick={() => runAction(`plan-${item.id}`, () => provider.createCheckout(item.id), copy.paymentSelected)}><CreditCard className="me-2 h-4 w-4" />{selectedPending ? copy.pending : paidAction}</Button>}</CardContent>
            </Card>;
          })}
        </div>
      </section>

      {canManageBilling && isTestModeEnabled && (
        <Card className="border-amber-400 bg-amber-50/60 dark:bg-amber-950/15">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-200"><FlaskConical className="h-5 w-5" />{copy.testMode}</CardTitle></CardHeader>
          <CardContent className="space-y-4"><p className="text-sm text-amber-900/80 dark:text-amber-100/80">{copy.noGateway}</p>{pendingPaymentId && <div className="flex flex-wrap gap-2"><Button size="sm" className="bg-emerald-700 hover:bg-emerald-800" disabled={Boolean(acting)} onClick={() => runAction('test-success', () => provider.verifyPayment(pendingPaymentId, 'succeeded'))}><BadgeCheck className="me-2 h-4 w-4" />{copy.simulateSuccess}</Button><Button size="sm" variant="destructive" disabled={Boolean(acting)} onClick={() => runAction('test-failure', () => provider.verifyPayment(pendingPaymentId, 'failed'))}><XCircle className="me-2 h-4 w-4" />{copy.simulateFailure}</Button></div>}<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={Boolean(acting)} onClick={() => runAction('test-renewal', () => provider.simulateLifecycle('renewal'))}>{copy.simulateRenewal}</Button><Button size="sm" variant="outline" disabled={Boolean(acting)} onClick={() => runAction('test-cancel', () => provider.simulateLifecycle('cancellation'))}>{copy.simulateCancellation}</Button><Button size="sm" variant="outline" disabled={Boolean(acting)} onClick={() => runAction('test-expiration', () => provider.simulateLifecycle('expiration'))}>{copy.simulateExpiration}</Button></div></CardContent>
        </Card>
      )}
      {canManageBilling && !isTestModeEnabled && <div className="rounded-xl border border-dashed border-muted-foreground/40 px-4 py-3 text-sm text-muted-foreground"><AlertTriangle className="me-2 inline h-4 w-4" />{copy.disabledTest}</div>}

      <section className="grid gap-5 xl:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">{copy.paymentHistory}</CardTitle></CardHeader><CardContent className="space-y-3">{payments.length ? payments.map((payment) => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><div><p className="font-semibold">{payment.display_label || `${payment.plan_id} · ${payment.status}`}</p><p className="text-xs text-muted-foreground">{formatDate(payment.created_at, lang)} · {money(payment.amount_cents)}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{payment.status}</Badge>{payment.is_test && <Badge className="bg-amber-500 text-amber-950">{copy.testOnly}</Badge>}</div></div>) : <p className="text-sm text-muted-foreground">{copy.noRecords}</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">{copy.subscriptionHistory}</CardTitle></CardHeader><CardContent className="space-y-3">{events.length ? events.map((event) => <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"><div><p className="font-semibold">{String(event.event_type || '').replaceAll('_', ' ')}</p><p className="text-xs text-muted-foreground">{formatDate(event.created_at, lang)}</p></div><Badge variant="outline">{event.next_status || '—'}</Badge></div>) : <p className="text-sm text-muted-foreground">{copy.noRecords}</p>}</CardContent></Card>
      </section>

      {loading && <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading subscription</div>}
    </div>
  );
}
