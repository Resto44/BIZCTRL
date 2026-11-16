import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useLanguage } from '@/lib/LanguageContext';
import PWAInstallModal from './PWAInstallModal';

const SESSION_KEY = 'bizctrl:install-popup-shown:20261116';
function alreadySeen() {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}
function markSeen() {
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* Private browsing. */ }
}
const TEXT = {
  en: { title: 'Install BizCTRL', sub: 'Open your business from your Home Screen', action: 'Install', guide: 'How to install', close: 'Not now' },
  ar: { title: 'ثبّت BizCTRL', sub: 'افتح عملك مباشرة من الشاشة الرئيسية', action: 'تثبيت', guide: 'طريقة التثبيت', close: 'لاحقاً' },
  fa: { title: 'نصب BizCTRL', sub: 'مستقیم از صفحۀ اصلی موبایل وارد شوید', action: 'نصب', guide: 'روش نصب', close: 'بعداً' },
};

export default function PWAInstallBanner({ autoOpen = false }) {
  const install = usePWAInstall();
  const { lang = 'en' } = useLanguage();
  const [showModal, setShowModal] = useState(false);
  const [seen, setSeen] = useState(alreadySeen);
  const t = TEXT[lang] || TEXT.en;

  useEffect(() => {
    if (!autoOpen || !install.canInstall || seen || install.isInstalled) return;
    markSeen();
    setSeen(true);
    setShowModal(true);
  }, [autoOpen, install.canInstall, install.isInstalled, seen]);

  const close = () => {
    setShowModal(false);
    install.dismiss();
  };
  const neverShow = () => {
    install.neverShow();
    setShowModal(false);
  };
  const clickInstall = async () => {
    if (!install.isIOS && install.hasDeferredPrompt) {
      const accepted = await install.triggerInstall();
      if (accepted) { setShowModal(false); return; }
      close();
      return;
    }
    setShowModal(true);
    markSeen();
    setSeen(true);
  };

  if (install.isInstalled || (!showModal && (!install.canInstall || seen))) return null;

  if (showModal) return (
    <PWAInstallModal
      isIOS={install.isIOS}
      isIOSChrome={install.isIOSChrome}
      isAndroid={install.isAndroid}
      hasDeferredPrompt={install.hasDeferredPrompt}
      triggerInstall={install.triggerInstall}
      onClose={close}
      onNeverShow={neverShow}
    />
  );

  return (
    <aside aria-label={t.title} data-testid="pwa-install-invitation"
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] inset-x-3 z-[70] mx-auto max-w-md rounded-2xl border border-cyan-300/40 bg-slate-950 p-3 text-white shadow-2xl">
      <div className="flex items-center gap-3">
        <img src="/icons/bizctrl-icon-192-v3.png" width="42" height="42" alt="BizCTRL" className="h-11 w-11 rounded-xl object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{t.title}</p>
          <p className="mt-0.5 text-xs text-slate-300">{t.sub}</p>
        </div>
        <Button type="button" onClick={clickInstall} className="min-h-11 shrink-0 bg-cyan-400 px-3 font-bold text-slate-950 hover:bg-cyan-300">
          {install.isIOS || !install.hasDeferredPrompt ? t.guide : t.action}
        </Button>
        <button type="button" aria-label={t.close} onClick={close} className="grid h-11 w-8 shrink-0 place-items-center rounded-lg text-slate-300">
          <X className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}
