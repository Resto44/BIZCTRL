import React, { useEffect, useState } from 'react';
import { Check, Download, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/LanguageContext';

const COPY = {
  en: {
    title: 'Install BizCTRL on your phone', subtitle: 'No App Store download is required.',
    safari: ['In Safari tap Share (or Page Menu → Share).', 'Choose Add to Home Screen.', 'Switch on Open as Web App if shown, then tap Add.'],
    chrome: ['In Chrome on iPhone, tap the Share icon beside the address bar.', 'Choose Add to Home Screen.', 'Tap Add to create the Home Screen shortcut.'],
    android: ['Open your browser menu (⋮).', 'Tap Install app or Add to Home screen.', 'Confirm Install or Add.'],
    desktop: ['Use Install app in the browser menu if it is available.'],
    iosNote: 'iPhone browsers cannot install a web app from a webpage button. Follow the Share steps above.',
    native: 'Install now', done: 'Got it', never: "Don't show again", close: 'Close install guide',
  },
  ar: {
    title: 'ثبّت BizCTRL على جوالك', subtitle: 'لا تحتاج إلى التحميل من متجر التطبيقات.',
    safari: ['في Safari اضغط مشاركة أو قائمة الصفحة ثم مشاركة.', 'اختر إضافة إلى الشاشة الرئيسية.', 'فعّل فتح كتطبيق ويب إن ظهر، ثم اضغط إضافة.'],
    chrome: ['في Chrome على الآيفون اضغط زر المشاركة بجانب شريط العنوان.', 'اختر إضافة إلى الشاشة الرئيسية.', 'اضغط إضافة لإنشاء اختصار التطبيق.'],
    android: ['افتح قائمة المتصفح (⋮).', 'اختر تثبيت التطبيق أو إضافة إلى الشاشة الرئيسية.', 'أكد تثبيت أو إضافة.'],
    desktop: ['اختر تثبيت التطبيق من قائمة المتصفح إن توفر.'],
    iosNote: 'لا يمكن للآيفون التثبيت مباشرة من زر داخل الصفحة. اتبع خطوات المشاركة أعلاه.',
    native: 'ثبّت الآن', done: 'فهمت', never: 'لا تظهر مجدداً', close: 'إغلاق دليل التثبيت',
  },
  fa: {
    title: 'BizCTRL را در موبایل نصب کنید', subtitle: 'ضرور نیست از App Store دانلود کنید.',
    safari: ['در Safari دکمۀ Share یا Page Menu → Share را بزنید.', 'گزینۀ Add to Home Screen را انتخاب کنید.', 'اگر Open as Web App آمد آن را روشن کنید، بعد Add را بزنید.'],
    chrome: ['در Chrome آیفون، دکمۀ Share کنار آدرس را بزنید.', 'گزینۀ Add to Home Screen را انتخاب کنید.', 'دکمۀ Add را بزنید تا آیکون ساخته شود.'],
    android: ['منوی مرورگر (⋮) را باز کنید.', 'گزینۀ Install app یا Add to Home Screen را انتخاب کنید.', 'Install یا Add را تأیید کنید.'],
    desktop: ['اگر در منوی مرورگر Install app وجود دارد، همان را انتخاب کنید.'],
    iosNote: 'در آیفون دکمۀ داخل سایت نمی‌تواند نصب را خودکار انجام بدهد؛ از Share طبق راهنمای بالا استفاده کنید.',
    native: 'همین حالا نصب کن', done: 'فهمیدم', never: 'دیگر نشان نده', close: 'بستن راهنمای نصب',
  },
};

export default function PWAInstallModal({
  isIOS = false, isIOSChrome = false, isAndroid = false,
  hasDeferredPrompt = false, triggerInstall, onClose, onNeverShow,
}) {
  const { lang = 'en' } = useLanguage();
  const t = COPY[lang] || COPY.en;
  const [installing, setInstalling] = useState(false);
  const steps = isIOS ? (isIOSChrome ? t.chrome : t.safari)
    : isAndroid ? t.android : t.desktop;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = event => { if (event.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const install = async () => {
    if (installing || !hasDeferredPrompt) return;
    setInstalling(true);
    try {
      if (await triggerInstall?.()) onClose?.();
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center overflow-y-auto bg-slate-950/70 p-0 sm:items-center sm:p-4"
      onClick={onClose} data-testid="pwa-install-dialog-backdrop">
      <section role="dialog" aria-modal="true" aria-labelledby="pwa-install-title"
        data-testid="pwa-install-dialog"
        className="w-full max-w-lg rounded-t-3xl border border-slate-200 bg-white p-5 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] text-slate-950 shadow-2xl sm:rounded-3xl"
        onClick={event => event.stopPropagation()}>
        <div className="flex items-start gap-3">
          <img src="/icons/bizctrl-icon-192-v3.png" alt="BizCTRL" width="56" height="56"
            className="h-14 w-14 shrink-0 rounded-xl object-contain" />
          <div className="min-w-0 flex-1">
            <h2 id="pwa-install-title" className="text-lg font-black leading-6">{t.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{t.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t.close}
            className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ol className="mt-5 space-y-3">
          {steps.map((step, index) => (
            <li key={index} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-600 text-sm font-bold text-white">{index + 1}</span>
              <span className="min-w-0 pt-1 text-sm font-medium leading-6">{step}</span>
              {index === 0 && isIOS && <Share2 className="mt-1 h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />}
              {index === steps.length - 1 && <Check className="mt-1 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />}
            </li>
          ))}
        </ol>
        {isIOS && <p className="mt-4 rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-900">{t.iosNote}</p>}
        <div className="mt-5 space-y-2">
          {!isIOS && hasDeferredPrompt && (
            <Button type="button" className="min-h-12 w-full gap-2" disabled={installing} onClick={install}>
              <Download className="h-5 w-5" />{installing ? '…' : t.native}
            </Button>
          )}
          <Button type="button" variant={!isIOS && hasDeferredPrompt ? 'outline' : 'default'}
            className="min-h-12 w-full" onClick={onClose}>{t.done}</Button>
          <button type="button" className="min-h-11 w-full text-center text-sm text-slate-500 underline underline-offset-2"
            onClick={onNeverShow}>{t.never}</button>
        </div>
      </section>
    </div>
  );
}
