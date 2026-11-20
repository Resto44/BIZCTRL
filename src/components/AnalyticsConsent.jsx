import React, { useLayoutEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useLanguage } from '@/lib/LanguageContext';
import { analyticsPage, createAnalytics, readAnalyticsConsent, ANALYTICS_CONSENT_KEY } from '@/lib/googleAnalytics';

const analytics = createAnalytics({ window, document, measurementId: import.meta.env.VITE_GA_MEASUREMENT_ID, production: import.meta.env.PROD });
const COPY = {
  en: { title: 'Usage analytics', text: 'Allow Google Analytics cookies to help us understand visits and improve BizCTRL? No names, emails or financial records are sent. You can change this choice anytime.', accept: 'Allow analytics', reject: 'Decline', settings: 'Analytics preferences', privacy: 'Privacy', close: 'Close' },
  ar: { title: 'إحصاءات الاستخدام', text: 'هل تسمح بملفات Google Analytics لفهم الزيارات وتحسين بيزكنترول؟ لا نرسل الأسماء أو البريد الإلكتروني أو السجلات المالية. يمكنك تغيير اختيارك في أي وقت.', accept: 'السماح بالإحصاءات', reject: 'رفض', settings: 'تفضيلات الإحصاءات', privacy: 'الخصوصية', close: 'إغلاق' },
  fa: { title: 'آمار استفاده', text: 'اجازه می‌دهید کوکی‌های Google Analytics برای بررسی بازدید و بهترشدن بیزکنترول استفاده شود؟ نام، ایمیل و اطلاعات مالی ارسال نمی‌شود. هر وقت خواستید می‌توانید انتخاب‌تان را تغییر بدهید.', accept: 'اجازهٔ آمارگیری', reject: 'رد کردن', settings: 'تنظیمات آمارگیری', privacy: 'حریم خصوصی', close: 'بستن' },
};
export default function AnalyticsConsent() {
  const { pathname } = useLocation();
  const { lang } = useLanguage();
  const copy = COPY[lang] || COPY.en;
  const [consent, setConsent] = useState(() => readAnalyticsConsent());
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => { analytics.update(consent, pathname); }, [consent, pathname]);
  useLayoutEffect(() => {
    const sync = event => { if (event.key === ANALYTICS_CONSENT_KEY || event.key === null) { const next = readAnalyticsConsent(); analytics.choose(next || 'denied'); setConsent(next); } };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  if (!analytics.enabled || !analyticsPage(pathname)) return null;
  const choose = value => { analytics.choose(value); setConsent(value); setOpen(false); };
  return <>
    {consent && !open ? <button type="button" className="fixed bottom-2 left-2 z-[80] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow" onClick={() => setOpen(true)}>{copy.settings}</button> :
      <section aria-label={copy.title} dir={['ar', 'fa'].includes(lang) ? 'rtl' : 'ltr'} className="fixed bottom-3 left-3 right-3 z-[100] mx-auto max-w-xl rounded-xl border border-slate-300 bg-white p-4 text-slate-900 shadow-xl">
        <h2 className="font-bold">{copy.title}</h2>
        <p className="mt-1 text-sm leading-6">{copy.text} <Link to="/privacy" className="underline">{copy.privacy}</Link></p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => choose('granted')} className="rounded-lg border border-slate-400 px-4 py-2 text-sm font-semibold">{copy.accept}</button>
          <button type="button" onClick={() => choose('denied')} className="rounded-lg border border-slate-400 px-4 py-2 text-sm font-semibold">{copy.reject}</button>
          {consent && <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm">{copy.close}</button>}
        </div>
      </section>}
  </>;
}
