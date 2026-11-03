import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, MonitorSmartphone, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/LanguageContext';
import { useRole } from '@/lib/RoleContext';
import { useBusinessMode } from '@/lib/BusinessModeContext';
import { useWorkspaceCustomization } from '@/lib/WorkspaceCustomizationContext';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import {
  WELCOME_TOUR_OPEN_EVENT, detectInstallDevice, getWelcomeTourStages,
  isNewSaaSUser, tourStorageKey,
} from '@/lib/newUserWelcomeTour';

const COPY = {
  en: {
    welcome: 'Welcome to BizCTRL', sub: 'A simple guide to your first day', progress: 'Step',
    later: 'Continue later', skip: 'Skip guide', back: 'Back', next: 'Next', done: 'Finish',
    open: 'Open module', resume: 'You can reopen this guide from your profile menu.',
    install: { title: 'First, add BizCTRL to your phone',
      detail: 'BizCTRL is a web app. Installation is optional and does not require the App Store.',
      installed: 'Already running from your Home Screen — no installation needed.',
      ios: ['Open mybizctrl.site in Safari.', 'Tap Share (square with upward arrow).', 'Choose Add to Home Screen, then tap Add.'],
      iosOther: 'Open this site in Safari first. Some in-app browsers cannot add it to your Home Screen.',
      android: ['Open mybizctrl.site in Chrome.', 'Tap menu (⋮) → Install app or Add to Home screen.', 'Confirm Install / Add.'],
      desktop: 'On desktop, use your browser install option if available; otherwise keep using the website.',
      action: 'Install on this device', manual: 'If no install prompt appears, follow the steps above.',
    },
    setup: { title: 'Confirm your business and branch', detail: 'Check the correct organization and branch before saving any transaction. Owners should configure the business and tax settings first.' },
    prepare: { title: 'Prepare your everyday records', detail: 'Create products and suppliers, then record purchases as needed. A saved record should appear in the correct branch.' },
    operate: { title: 'Make the first sale', detail: 'Start with POS or Sales. At the end of each shift, use Sales Closing and check the cash count. Never register the same sale twice.' },
    review: { title: 'Check results and unpaid bills', detail: 'Use the dashboard and reports to review confirmed sales, expenses, and balances. Supplier payments reduce unpaid balances, not historical purchase totals.' },
    modules: {
      settings: ['Business settings', 'Identity, currency and tax'],
      branches: ['Branches', 'Create or verify branches'],
      products: ['Products', 'Menu or product catalog'],
      inventory: ['Inventory', 'Products and stock'],
      suppliers: ['Suppliers', 'Supplier accounts'],
      purchases: ['Purchases', 'Purchase invoices and amounts due'],
      restaurantPOS: ['Restaurant POS', 'Take an order and record a sale'],
      retailPOS: ['Retail POS', 'Register and barcode workflow'],
      sales: ['Sales & closing', 'Sales records and end-of-shift closing'],
      expenses: ['Expenses', 'Daily and fixed expenses'],
      home: ['Dashboard', 'Business overview'],
      reports: ['Reports', 'Sales, purchase and profit reports'],
      payables: ['Unpaid invoices', 'Supplier invoices awaiting payment'],
      supplierPortal: ['Supplier portal', 'Your assigned supplier workspace'],
    },
  },
  fa: {
    welcome: 'به BizCTRL خوش آمدید', sub: 'راهنمای آسان شروع کار', progress: 'مرحله',
    later: 'بعداً ادامه می‌دهم', skip: 'رد کردن راهنما', back: 'قبلی', next: 'بعدی', done: 'پایان',
    open: 'باز کردن ماژول', resume: 'هر وقت خواستید، راهنما را از منوی پروفایل دوباره باز کنید.',
    install: { title: 'اول BizCTRL را روی موبایل اضافه کنید',
      detail: 'BizCTRL یک برنامه تحت وب است. نصب آن اختیاری است و به App Store ضرورت ندارد.',
      installed: 'برنامه از صفحه اصلی موبایل باز شده؛ نصب دوباره لازم نیست.',
      ios: ['سایت mybizctrl.site را در Safari باز کنید.', 'دکمه Share (مربع با فلش رو به بالا) را بزنید.', 'گزینه Add to Home Screen را انتخاب کنید و بعد Add را بزنید.'],
      iosOther: 'اول این سایت را در Safari باز کنید؛ بعضی مرورگرهای داخل اپ امکان نصب ندارند.',
      android: ['سایت mybizctrl.site را در Chrome باز کنید.', 'منوی (⋮) را بزنید و Install app یا Add to Home screen را انتخاب کنید.', 'Install یا Add را تأیید کنید.'],
      desktop: 'در کامپیوتر در صورت وجود گزینه Install در مرورگر، آن را بزنید؛ در غیر آن از خود سایت استفاده کنید.',
      action: 'نصب در این دستگاه', manual: 'اگر پنجره نصب باز نشد، مراحل بالا را انجام دهید.',
    },
    setup: { title: 'اول کسب‌وکار و شعبه را بررسی کنید', detail: 'قبل از هر ثبت، سازمان و شعبه درست را انتخاب کنید. اونر مشخصات کسب‌وکار، ارز و مالیات را تنظیم کند.' },
    prepare: { title: 'محصولات و سپلایرها را آماده کنید', detail: 'منو یا محصولات و سپلایرها را وارد کنید و فاکتور خرید را در شعبه درست ثبت کنید.' },
    operate: { title: 'اولین فروش را ثبت کنید', detail: 'از POS یا Sales شروع کنید. در آخر شیفت، Closing Sales و پول صندوق را بررسی کنید. فروش را دوباره ثبت نکنید.' },
    review: { title: 'گزارش و بدهی‌ها را ببینید', detail: 'داشبورد، گزارش فروش و مصارف و فاکتورهای پرداخت‌نشده را بررسی کنید. پرداخت بدهی، فروش قبلی را تغییر نمی‌دهد.' },
    modules: {
      settings: ['تنظیمات کسب‌وکار', 'مشخصات، ارز و مالیات'],
      branches: ['مدیریت شعبه‌ها', 'ایجاد یا بررسی شعبه‌ها'],
      products: ['مدیریت محصولات', 'منو یا کاتالوگ اجناس'],
      inventory: ['انبار', 'اجناس و موجودی'],
      suppliers: ['سپلایرها', 'حساب تأمین‌کنندگان'],
      purchases: ['خریدها', 'فاکتور خرید و مانده بدهی'],
      restaurantPOS: ['POS رستورانت', 'ثبت سفارش و فروش'],
      retailPOS: ['POS فروشگاه', 'فروش و بارکد'],
      sales: ['فروش و کلوزینگ', 'فروشات و بستن شیفت'],
      expenses: ['مصارف', 'مصارف روزانه و ثابت'],
      home: ['داشبورد', 'خلاصه کسب‌وکار'],
      reports: ['گزارش‌ها', 'فروش، خرید و سود'],
      payables: ['فاکتورهای باقی‌مانده', 'بدهی‌های پرداخت‌نشده'],
      supplierPortal: ['پورتال سپلایر', 'صفحه کار اختصاصی سپلایر'],
    },
  },
  ar: {
    welcome: 'مرحباً بك في BizCTRL', sub: 'دليل بسيط لبدء العمل', progress: 'الخطوة',
    later: 'أكمل لاحقاً', skip: 'تخطي الدليل', back: 'السابق', next: 'التالي', done: 'إنهاء',
    open: 'فتح القسم', resume: 'يمكنك فتح الدليل من قائمة الملف الشخصي في أي وقت.',
    install: { title: 'أولاً، أضف BizCTRL إلى شاشة جوالك',
      detail: 'BizCTRL تطبيق ويب. التثبيت اختياري ولا يحتاج إلى متجر التطبيقات.',
      installed: 'التطبيق يعمل بالفعل من الشاشة الرئيسية؛ لا يلزم تثبيته مرة أخرى.',
      ios: ['افتح mybizctrl.site في Safari.', 'اضغط مشاركة (مربع وسهم للأعلى).', 'اختر إضافة إلى الشاشة الرئيسية ثم اضغط إضافة.'],
      iosOther: 'افتح الموقع أولاً في Safari؛ قد لا تدعم المتصفحات المدمجة إضافته للشاشة الرئيسية.',
      android: ['افتح mybizctrl.site في Chrome.', 'اضغط القائمة (⋮) ثم تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية.', 'أكّد التثبيت أو الإضافة.'],
      desktop: 'على الكمبيوتر، استخدم خيار التثبيت في المتصفح إذا توفر، أو تابع استخدام الموقع.',
      action: 'تثبيت على هذا الجهاز', manual: 'إذا لم تظهر نافذة التثبيت، اتبع الخطوات أعلاه.',
    },
    setup: { title: 'تأكد من المنشأة والفرع', detail: 'اختر المنشأة والفرع الصحيح قبل حفظ العمليات. يضبط المالك بيانات المنشأة والعملة والضريبة أولاً.' },
    prepare: { title: 'جهّز المنتجات والموردين', detail: 'أضف الأصناف والموردين ثم سجّل المشتريات في الفرع الصحيح.' },
    operate: { title: 'سجّل أول عملية بيع', detail: 'ابدأ بنقطة البيع أو المبيعات. عند نهاية الوردية، راجع إقفال المبيعات والنقد بالصندوق. لا تسجّل البيع مرتين.' },
    review: { title: 'راجع التقارير والذمم', detail: 'افتح لوحة التحكم والتقارير والفواتير غير المسددة. دفع المورد يقلل الرصيد المستحق ولا يغير المشتريات التاريخية.' },
    modules: {
      settings: ['إعدادات المنشأة', 'البيانات والعملة والضريبة'],
      branches: ['الفروع', 'إضافة الفروع أو التحقق منها'],
      products: ['المنتجات', 'القائمة أو أصناف المتجر'],
      inventory: ['المخزون', 'الأصناف والكميات'],
      suppliers: ['الموردون', 'حسابات الموردين'],
      purchases: ['المشتريات', 'الفواتير والمبالغ المستحقة'],
      restaurantPOS: ['نقاط بيع المطعم', 'الطلبات والمبيعات'],
      retailPOS: ['نقاط بيع المتجر', 'المبيعات والباركود'],
      sales: ['المبيعات والإقفال', 'سجلات المبيعات وإقفال الوردية'],
      expenses: ['المصروفات', 'اليومية والثابتة'],
      home: ['لوحة التحكم', 'ملخص نشاطك'],
      reports: ['التقارير', 'المبيعات والمشتريات والأرباح'],
      payables: ['الفواتير غير المسددة', 'المبالغ المستحقة للموردين'],
      supplierPortal: ['بوابة المورد', 'مساحة عمل المورد'],
    },
  },
};

const HOME_ROUTES = new Set(['/owner-command-center', '/manager-dashboard', '/employee-dashboard', '/supplier-portal', '/gm-dashboard', '/dashboard']);

function readMarker(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeMarker(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private mode: guide still works. */ }
}

export default function NewUserWelcomeTour({ onVisibleChange }) {
  const { user } = useAuth();
  const { role, can } = useRole();
  const { activeMode } = useBusinessMode();
  const { configuration } = useWorkspaceCustomization();
  const { lang = 'en' } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const { hasDeferredPrompt, triggerInstall, isInstalled } = usePWAInstall();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [installing, setInstalling] = useState(false);
  const [installedNow, setInstalledNow] = useState(false);
  const key = tourStorageKey(user?.id);
  const copy = COPY[lang] || COPY.en;
  const stages = useMemo(() => getWelcomeTourStages({ role, mode: activeMode, can, configuration }),
    [role, activeMode, can, configuration]);
  const currentIndex = Math.min(stepIndex, stages.length - 1);
  const current = stages[currentIndex];
  const device = detectInstallDevice(typeof navigator === 'undefined' ? '' : navigator.userAgent,
    isInstalled || installedNow || (typeof window !== 'undefined' &&
      (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)));

  useEffect(() => {
    if (!user?.id || !HOME_ROUTES.has(location.pathname) || !isNewSaaSUser(user.created_at)) return;
    if (readMarker(key) !== null) return;
    // First visit per authenticated account/device, not on every tab or reload.
    writeMarker(key, { status: 'shown', step: 0 });
    setStepIndex(0);
    setOpen(true);
  }, [user?.id, user?.created_at, location.pathname, key]);

  useEffect(() => {
    const show = () => {
      // "Continue later" resumes the last section; "Finish" starts a fresh replay.
      let saved;
      try { saved = JSON.parse(readMarker(key) || 'null'); } catch { saved = null; }
      const resumable = saved?.status === 'paused' && Number.isInteger(saved.step);
      setStepIndex(resumable ? Math.max(0, Math.min(stages.length - 1, saved.step)) : 0);
      setOpen(true);
    };
    window.addEventListener(WELCOME_TOUR_OPEN_EVENT, show);
    return () => window.removeEventListener(WELCOME_TOUR_OPEN_EVENT, show);
  }, [key, stages.length]);

  useEffect(() => { onVisibleChange?.(open); }, [open, onVisibleChange]);

  const pause = () => {
    writeMarker(key, { status: 'paused', step: currentIndex });
    setOpen(false);
  };
  const finish = () => {
    writeMarker(key, { status: 'completed', step: stages.length - 1 });
    setOpen(false);
  };
  const visit = path => {
    pause();
    navigate(path);
  };
  const install = async () => {
    if (!hasDeferredPrompt || installing) return;
    setInstalling(true);
    try {
      const accepted = await triggerInstall();
      if (accepted) setInstalledNow(true);
    } finally {
      setInstalling(false);
    }
  };

  if (!user?.id || !current) return null;
  const installCopy = copy.install;
  const instructions = device === 'ios-safari' || device === 'ios-other'
    ? installCopy.ios : device === 'android' ? installCopy.android : [];
  const heading = current.key === 'install' ? installCopy.title : copy[current.key].title;
  const detail = current.key === 'install' ? installCopy.detail : copy[current.key].detail;

  return <Dialog open={open} onOpenChange={value => { if (!value) pause(); }}>
    <DialogContent data-testid="saas-welcome-tour" dir={lang === 'en' ? 'ltr' : 'rtl'}
      className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto rounded-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
      <DialogHeader className="text-start">
        <div className="flex items-center gap-2 text-primary">
          <MonitorSmartphone className="h-5 w-5" />
          <span className="text-xs font-semibold">{copy.welcome}</span>
        </div>
        <DialogTitle className="text-xl font-bold leading-tight">{heading}</DialogTitle>
        <DialogDescription className="text-sm leading-6">{detail}</DialogDescription>
      </DialogHeader>
      <div className="mt-1" aria-label={copy.progress + ' ' + (currentIndex + 1) + ' / ' + stages.length}>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{copy.sub}</span><span dir="ltr">{currentIndex + 1} / {stages.length}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all"
            style={{ width: String((currentIndex + 1) / stages.length * 100) + '%' }} />
        </div>
      </div>
      {current.key === 'install' ? (
        <section className="space-y-3" data-testid="welcome-install-step">
          {device === 'installed' ? (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-200 p-3 text-sm text-emerald-700">
              <CheckCircle2 className="h-5 w-5 shrink-0" />{installCopy.installed}
            </p>
          ) : (
            <>
              {device === 'ios-other' && <p className="rounded-xl border border-amber-300 p-3 text-sm">{installCopy.iosOther}</p>}
              {instructions.length > 0 ? (
                <ol className="space-y-2">
                  {instructions.map((instruction, index) => <li key={index} className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary">{index + 1}</span>
                    <span className="leading-6">{instruction}</span>
                  </li>)}
                </ol>
              ) : <p className="rounded-xl border p-3 text-sm">{installCopy.desktop}</p>}
              {hasDeferredPrompt && <Button type="button" onClick={install} disabled={installing} className="w-full min-h-11 gap-2">
                <Smartphone className="h-4 w-4" />{installCopy.action}
              </Button>}
              <p className="text-xs leading-5 text-muted-foreground">{installCopy.manual}</p>
            </>
          )}
        </section>
      ) : (
        <section data-testid="welcome-module-step" className="space-y-2">
          {current.modules.map(item => {
            const [label, description] = copy.modules[item.key] || [item.key, ''];
            return <button key={item.key} type="button"
              data-testid={'welcome-open-' + item.key}
              onClick={() => visit(item.path)}
              className="flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border bg-card p-3 text-start hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
              </span>
              <ExternalLink aria-label={copy.open} className="h-4 w-4 shrink-0 text-primary" />
            </button>;
          })}
          {!current.modules.length && <p className="rounded-xl border p-4 text-sm leading-6">{copy.setup.detail}</p>}
        </section>
      )}
      <p className="text-xs leading-5 text-muted-foreground">{copy.resume}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => setStepIndex(index => Math.max(0, index - 1))}
          disabled={currentIndex === 0} className="min-h-11">
          <ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" />{copy.back}
        </Button>
        <Button type="button" onClick={() => {
          if (currentIndex >= stages.length - 1) finish();
          else setStepIndex(index => Math.min(stages.length - 1, index + 1));
        }} className="min-h-11">
          {currentIndex === stages.length - 1 ? copy.done : copy.next}
          {currentIndex < stages.length - 1 && <ChevronRight className="ms-1 h-4 w-4 rtl:rotate-180" />}
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <button type="button" onClick={pause} className="min-h-9 px-1 text-muted-foreground underline">{copy.later}</button>
        <button type="button" onClick={finish} className="min-h-9 px-1 text-muted-foreground underline">{copy.skip}</button>
      </div>
    </DialogContent>
  </Dialog>;
}
