import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, MonitorSmartphone, ShieldCheck } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { PORTAL_SHOWCASE_IMAGE, ERP_SHOWCASE_IMAGE } from '@/assets/landingMarketingImages';

const TEXT = {
  en: {
    eyebrow: 'DISCOVER BIZCTRL',
    headline: 'See what managing your business from one place can look like',
    subtitle: 'Explore our portal and business-control experience, from owner access to treasury, operations, and reporting.',
    portal: 'One entry point. The right portal for every team.',
    portalDetail: 'Owner, branch management, employees and suppliers, with role-aware access.',
    control: 'Your business, visible across devices.',
    controlDetail: 'A unified view of dashboards, treasury and branch operations on mobile and desktop.',
    preview: 'Illustrative concept artwork — screens and figures are examples, not live customer data.',
    register: 'Get started with BizCTRL',
    explore: 'Explore features',
    imagePortal: 'BizCTRL portal concept illustrated on laptop and smartphone',
    imageControl: 'BizCTRL dashboard, treasury and settlement concept illustrated on multiple devices',
    accessible: 'Multi-device business management',
    controlLabel: 'Role-aware access',
  },
  fa: {
    eyebrow: 'با BIZCTRL آشنا شوید',
    headline: 'مدیریت تمام کسب‌وکار از یک پلتفرم هوشمند',
    subtitle: 'پورتال‌ها، خزانه، مدیریت شعبه‌ها و گزارش‌ها را در یک تجربه یکپارچه ببینید.',
    portal: 'یک درگاه، دسترسی مناسب برای هر کاربر',
    portalDetail: 'پورتال مالک، مدیر فرع، کارمند و تأمین‌کننده با سطح دسترسی مشخص.',
    control: 'مدیریت کسب‌وکار در موبایل و کمپیوتر',
    controlDetail: 'نگاه یکپارچه به داشبورد، خزانه و فعالیت شعبه‌ها در دستگاه‌های مختلف.',
    preview: 'این تصاویر طرح نمایشی هستند؛ ارقام و صفحه‌ها داده واقعی مشتری نیستند.',
    register: 'شروع استفاده از BizCTRL',
    explore: 'مشاهده امکانات',
    imagePortal: 'طرح نمایشی پورتال BizCTRL در لپ‌تاپ و موبایل',
    imageControl: 'طرح نمایشی داشبورد، خزانه و تسویه‌های BizCTRL در چند دستگاه',
    accessible: 'دسترسی از دستگاه‌های مختلف',
    controlLabel: 'دسترسی بر اساس نقش',
  },
  ar: {
    eyebrow: 'اكتشف BIZCTRL',
    headline: 'أعمالك بالكامل من منصة ذكية واحدة',
    subtitle: 'استكشف بوابات المستخدمين والخزينة وإدارة الفروع والتقارير في تجربة موحّدة.',
    portal: 'بوابة واحدة وصلاحيات مناسبة لكل مستخدم',
    portalDetail: 'بوابة المالك ومدير الفرع والموظفين والموردين بصلاحيات محددة.',
    control: 'تابع عملك من الجوال والكمبيوتر',
    controlDetail: 'رؤية موحدة للوحة التحكم والخزينة وحركة الفروع عبر الأجهزة.',
    preview: 'صور تصورية للتوضيح فقط؛ الأرقام والواجهات المعروضة ليست بيانات عملاء فعلية.',
    register: 'ابدأ مع BizCTRL',
    explore: 'استكشف المميزات',
    imagePortal: 'تصور لبوابة BizCTRL على الكمبيوتر والهاتف',
    imageControl: 'تصور للوحات المعلومات والخزينة والتسويات على أجهزة متعددة',
    accessible: 'إدارة من جميع الأجهزة',
    controlLabel: 'صلاحيات حسب الدور',
  },
};

function MarketingImage({ src, alt, priority }) {
  return <div className="relative isolate overflow-hidden rounded-[1.45rem] border border-cyan-200/15 bg-slate-950 shadow-2xl shadow-blue-950/40">
    <div aria-hidden="true" className="absolute inset-x-[12%] top-0 h-24 rounded-full bg-cyan-400/20 blur-3xl" />
    <img
      src={`data:image/webp;base64,${src}`}
      alt={alt}
      width="540"
      height="405"
      decoding="async"
      draggable="false"
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      className="relative block h-auto w-full object-contain"
    />
  </div>;
}

export default function LandingMarketingShowcase() {
  const { lang } = useLanguage();
  const t = TEXT[lang] || TEXT.en;

  return (
    <section id="product-preview" dir={lang === 'en' ? 'ltr' : 'rtl'} aria-labelledby="product-preview-title"
      className="relative isolate overflow-hidden border-b border-white/10 bg-gradient-to-b from-slate-950 via-[#071637] to-slate-950 px-4 pb-16 pt-6 text-white sm:px-6 sm:pb-20 lg:pb-24">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-24 h-64 w-[min(68rem,110vw)] -translate-x-1/2 rounded-full bg-blue-600/15 blur-[90px]" />
      <div className="relative mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">{t.eyebrow}</p>
          <h2 id="product-preview-title" className="mt-3 text-2xl font-black leading-tight tracking-tight sm:text-4xl">
            {t.headline}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">{t.subtitle}</p>
        </div>
        <div className="mt-8 grid min-w-0 gap-5 lg:grid-cols-2 lg:items-stretch">
          <article className="group min-w-0 rounded-[1.75rem] border border-blue-400/20 bg-gradient-to-b from-blue-500/10 to-white/[0.035] p-3 transition-colors hover:border-cyan-300/40 sm:p-4">
            <MarketingImage src={PORTAL_SHOWCASE_IMAGE} alt={t.imagePortal} priority />
            <div className="px-2 pb-2 pt-5 sm:px-3">
              <h3 className="text-lg font-extrabold text-white">{t.portal}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{t.portalDetail}</p>
              <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-cyan-200">
                <ShieldCheck className="h-4 w-4" />{t.controlLabel}
              </p>
            </div>
          </article>
          <article className="group min-w-0 rounded-[1.75rem] border border-cyan-400/20 bg-gradient-to-b from-cyan-500/10 to-white/[0.035] p-3 transition-colors hover:border-cyan-300/40 sm:p-4">
            <MarketingImage src={ERP_SHOWCASE_IMAGE} alt={t.imageControl} />
            <div className="px-2 pb-2 pt-5 sm:px-3">
              <h3 className="text-lg font-extrabold text-white">{t.control}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{t.controlDetail}</p>
              <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-cyan-200">
                <MonitorSmartphone className="h-4 w-4" />{t.accessible}
              </p>
            </div>
          </article>
        </div>
        <p className="mt-5 flex items-start justify-center gap-2 text-center text-xs leading-5 text-slate-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />{t.preview}
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/erp-register?owner=1"
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-6 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-300 sm:w-auto">
            {t.register}<ArrowRight className="h-4 w-4" />
          </Link>
          <a href="/#features"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 sm:w-auto">
            {t.explore}
          </a>
        </div>
      </div>
    </section>
  );
}
