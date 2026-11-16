import { useCallback, useEffect, useState } from 'react';

// Presentation preferences only. Never store credentials, subscriptions or tenant data.
const DISMISS_KEY = 'pwa_install_dismissed_20261116';
const NEVER_SHOW_KEY = 'pwa_install_never_show';
const MAX_DISMISSALS = 3;

export function isInstalledWebApp(browser = window) {
  return browser.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    browser.navigator?.standalone === true;
}

export function detectInstallBrowser(ua = '', platform = '', maxTouchPoints = 0) {
  const ios = /iPad|iPhone|iPod/i.test(ua) ||
    (platform === 'MacIntel' && maxTouchPoints > 1);
  return {
    isIOS: ios,
    isIOSChrome: ios && /CriOS/i.test(ua),
    isAndroid: /Android/i.test(ua),
  };
}

function safeRead(key, storage = window.localStorage) {
  try { return storage.getItem(key); } catch { return null; }
}
function safeWrite(key, value, storage = window.localStorage) {
  try { storage.setItem(key, value); } catch { /* Private browsing can block storage. */ }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [device, setDevice] = useState({ isIOS: false, isIOSChrome: false, isAndroid: false });
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const current = detectInstallBrowser(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
    setDevice(current);

    if (isInstalledWebApp()) {
      setIsInstalled(true);
      setCanInstall(false);
      return;
    }

    if (safeRead(NEVER_SHOW_KEY) === '1') return;
    const dismissals = Number.parseInt(safeRead(DISMISS_KEY) || '0', 10);
    if (Number.isFinite(dismissals) && dismissals >= MAX_DISMISSALS) return;

    // iOS Safari AND iOS Chrome can offer Share -> Add to Home Screen; neither
    // exposes beforeinstallprompt. Android supports native prompt when eligible.
    const showManual = () => setCanInstall(true);
    const timer = window.setTimeout(showManual, current.isIOS ? 1600 : 3500);

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setCanInstall(true);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt(); // only inside the actual user tap
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice?.outcome === 'accepted') {
        setIsInstalled(true);
        setCanInstall(false);
        return true;
      }
    } catch {
      setDeferredPrompt(null);
    }
    return false;
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    const count = Number.parseInt(safeRead(DISMISS_KEY) || '0', 10);
    safeWrite(DISMISS_KEY, String((Number.isFinite(count) ? count : 0) + 1));
    setCanInstall(false);
  }, []);

  const neverShow = useCallback(() => {
    safeWrite(NEVER_SHOW_KEY, '1');
    setCanInstall(false);
  }, []);

  return {
    canInstall,
    isInstalled,
    isIOS: device.isIOS,
    isIOSChrome: device.isIOSChrome,
    isAndroid: device.isAndroid,
    hasDeferredPrompt: !!deferredPrompt,
    triggerInstall,
    dismiss,
    neverShow,
  };
}
