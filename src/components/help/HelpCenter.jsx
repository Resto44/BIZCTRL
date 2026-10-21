import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Search, ExternalLink, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { HELP_REVIEWED_AT, searchHelpArticles } from '@/lib/helpArticles';

export const HELP_COPY = {
  en: { title: 'Help Center', intro: 'Learn how to use BizCTRL, one task at a time.', search: 'Search guides, e.g. supplier payment', category: 'Topic', role: 'Guide for', all: 'All', results: 'guides', reference: 'Field details', required: 'Required', optional: 'Optional', conditional: 'Depends on settings', system: 'System / protected', example: 'Example', steps: 'Steps', note: 'Before you continue', open: 'Open this section', link: 'Link to this guide', empty: 'No matching guides. Try fewer words or another topic.', reset: 'Clear filters', scope: 'Guides explain available workflows. Your role, assigned branch, business type and plan determine which actions you can use. Opening a guide does not change your access.', reviewed: 'Reviewed', contact: 'Cannot sign in? Contact us', support: 'My support tickets', home: 'Go to sign in', topics: { start: 'Getting started', sales: 'Sales & POS', stock: 'Products & stock', buy: 'Purchases & suppliers', money: 'Finance & treasury', people: 'People & approvals', reports: 'Reports & alerts', portals: 'Portal guides', trouble: 'Troubleshooting' }, roles: { owner: 'Business owner', manager: 'Branch manager', employee: 'Employee', supplier: 'Supplier', platform: 'Platform owner' } },
  ar: { title: 'مركز المساعدة', intro: 'تعلّم استخدام BizCTRL خطوة بخطوة لكل مهمة.', search: 'ابحث في الدليل، مثلاً دفعات المورد', category: 'الموضوع', role: 'دليل مناسب لـ', all: 'الكل', results: 'دليلاً', reference: 'شرح كل حقل', required: 'إلزامي', optional: 'اختياري', conditional: 'حسب الإعدادات', system: 'نظام محمي', example: 'مثال', steps: 'الخطوات', note: 'قبل المتابعة', open: 'افتح هذا القسم', link: 'رابط هذا الدليل', empty: 'لا توجد أدلة مطابقة. جرّب كلمات أقل أو موضوعاً آخر.', reset: 'مسح الفلاتر', scope: 'الأدلة تشرح مسارات العمل المتاحة. دورك وفرعك ونوع نشاطك وخطتك تحدد الإجراءات المسموحة. قراءة الدليل لا تغيّر صلاحياتك.', reviewed: 'تمت المراجعة', contact: 'تعذر الدخول؟ تواصل معنا', support: 'تذاكر الدعم', home: 'الذهاب لتسجيل الدخول', topics: { start: 'البداية', sales: 'المبيعات ونقاط البيع', stock: 'المنتجات والمخزون', buy: 'المشتريات والموردون', money: 'المالية والخزينة', people: 'الموظفون والاعتمادات', reports: 'التقارير والتنبيهات', portals: 'أدلة البوابات', trouble: 'حل المشكلات' }, roles: { owner: 'مالك المنشأة', manager: 'مدير الفرع', employee: 'الموظف', supplier: 'المورد', platform: 'مالك المنصة' } },
  fa: { title: 'مرکز راهنما', intro: 'استفاده از BizCTRL را قدم‌به‌قدم یاد بگیرید.', search: 'جست‌وجوی راهنما؛ مثلاً پرداخت سپلایر', category: 'موضوع', role: 'راهنما برای', all: 'همه', results: 'راهنما', reference: 'توضیح تمام فیلدها', required: 'الزامی', optional: 'اختیاری', conditional: 'بسته به تنظیمات', system: 'سیستمی', example: 'مثال', steps: 'مراحل کار', note: 'پیش از ادامه', open: 'باز کردن این بخش', link: 'لینک این راهنما', empty: 'راهنمای مطابق پیدا نشد. کلمات کمتر یا موضوع دیگر را امتحان کنید.', reset: 'پاک کردن فیلترها', scope: 'راهنما جریان‌های کاری موجود را توضیح می‌دهد. نقش، شعبه تعیین‌شده، نوع کسب‌وکار و پلان شما عملیات مجاز را مشخص می‌کند. خواندن راهنما صلاحیت شما را تغییر نمی‌دهد.', reviewed: 'بازبینی', contact: 'وارد شده نمی‌توانید؟ تماس بگیرید', support: 'تیکت‌های پشتیبانی', home: 'رفتن به صفحه ورود', topics: { start: 'شروع کار', sales: 'فروش و POS', stock: 'محصولات و انبار', buy: 'خرید و سپلایر', money: 'مالی و خزانه', people: 'کارکنان و تأییدها', reports: 'گزارش و هشدار', portals: 'راهنمای پورتل‌ها', trouble: 'رفع مشکل' }, roles: { owner: 'اونر کسب‌وکار', manager: 'مدیر شعبه', employee: 'کارمند', supplier: 'سپلایر', platform: 'اونر پلتفورم' } },
};

export default function HelpCenter() {
  const { lang } = useLanguage();
  const language = HELP_COPY[lang] ? lang : 'en';
  const c = HELP_COPY[language];
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const category = Object.hasOwn(c.topics, params.get('topic')) ? params.get('topic') : 'all';
  const role = Object.hasOwn(c.roles, params.get('role')) ? params.get('role') : 'all';
  const selected = params.get('guide');
  const articles = useMemo(() => searchHelpArticles({ query, category, role }), [query, category, role]);
  const displayedArticles = useMemo(() => selected ? [...articles].sort((a, b) => Number(b.id === selected) - Number(a.id === selected)) : articles, [articles, selected]);
  const change = (key, value) => setParams(current => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true });
  const clear = () => setParams(current => {
    const next = new URLSearchParams(current);
    ['q', 'topic', 'role'].forEach(key => next.delete(key));
    return next;
  }, { replace: true });

  return <section dir={language === 'en' ? 'ltr' : 'rtl'} className="min-w-0 space-y-5" aria-label={c.title}>
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-7">
      <BookOpen className="mb-3 h-7 w-7 text-primary" aria-hidden="true" />
      <h2 className="text-2xl font-bold">{c.title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{c.intro}</p>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">{c.scope}</p>
    </div>
    <div className="space-y-3">
      <label className="block text-sm font-semibold" htmlFor="help-search">{c.search}</label>
      <div className="relative"><Search className="pointer-events-none absolute start-3 top-3 h-5 w-5 text-muted-foreground" aria-hidden="true" /><input id="help-search" type="search" value={query} onChange={event => change('q', event.target.value)} className="min-h-11 w-full rounded-xl border bg-background py-3 pe-3 ps-10 text-base" /></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold"><span>{c.category}</span><select value={category} onChange={event => change('topic', event.target.value)} className="min-h-11 w-full rounded-lg border bg-background p-2"><option value="all">{c.all}</option>{Object.entries(c.topics).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="space-y-1 text-sm font-semibold"><span>{c.role}</span><select value={role} onChange={event => change('role', event.target.value)} className="min-h-11 w-full rounded-lg border bg-background p-2"><option value="all">{c.all}</option>{Object.entries(c.roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p role="status">{articles.length} {c.results}</p><button type="button" onClick={clear} className="min-h-11 px-2 text-primary underline">{c.reset}</button></div>
    </div>
    {!articles.length && <p className="rounded-xl border p-6 text-sm">{c.empty}</p>}
    <div className="space-y-3">{displayedArticles.map(article => {
      const copy = article.content[language];
      const open = selected === article.id;
      return <article key={article.id} className="min-w-0 overflow-hidden rounded-xl border bg-card" id={`guide-${article.id}`}>
        <h3><button type="button" aria-expanded={open} aria-controls={`help-body-${article.id}`} onClick={() => change('guide', open ? '' : article.id)} className="flex min-h-14 w-full items-center justify-between gap-3 p-4 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><span><span className="mb-1 block text-xs font-normal text-muted-foreground">{c.topics[article.category]}</span><span className="font-semibold">{copy.title}</span></span><ChevronDown aria-hidden="true" className={`h-5 w-5 shrink-0 ${open ? 'rotate-180' : ''}`} /></button></h3>
        <div id={`help-body-${article.id}`} hidden={!open} className="space-y-4 border-t p-4 sm:p-6">
          <p className="text-xs text-muted-foreground">{article.roles.map(item => c.roles[item]).join(' · ')}</p>
          <h4 className="font-semibold">{c.steps}</h4>
          <ol className="list-decimal space-y-3 ps-6 text-sm leading-7">{copy.steps.map((step, index) => <li key={index} className="ps-1">{step}</li>)}</ol>
          <aside className="rounded-lg border border-amber-300/50 bg-amber-500/10 p-4 text-sm leading-7"><h4 className="font-semibold">{c.note}</h4><p>{copy.note}</p></aside>
          <div className="flex flex-wrap gap-3"><Link to={article.route} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{c.open}<ExternalLink className="h-4 w-4" aria-hidden="true" /></Link><Link to={`/help?guide=${article.id}`} className="inline-flex min-h-11 items-center px-2 text-sm text-primary underline">{c.link}</Link></div>
        </div>
      </article>;
    })}</div>
    <footer className="flex flex-wrap justify-between gap-3 border-t pt-4 text-xs text-muted-foreground"><p>{c.reviewed}: <time dateTime={HELP_REVIEWED_AT}>{HELP_REVIEWED_AT}</time></p><Link className="text-primary underline" to="/contact">{c.contact}</Link></footer>
  </section>;
}
