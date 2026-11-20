import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { createTikTokPixel, TIKTOK_MARKETING_CONSENT_KEY } from '@/lib/tiktokPixel';

const pixel = createTikTokPixel({
  window,
  document,
  pixelId: import.meta.env.VITE_TIKTOK_PIXEL_ID,
  production: import.meta.env.PROD,
});

function savedChoice() {
  try {
    const value = window.localStorage.getItem(TIKTOK_MARKETING_CONSENT_KEY);
    return ['granted', 'denied'].includes(value) ? value : null;
  } catch {
    return null;
  }
}

function privacyOptOut() {
  return window.navigator?.globalPrivacyControl === true ||
    window.navigator?.doNotTrack === '1';
}

/**
 * Public-site advertising measurement only. No marketing scripts run before
 * explicit opt-in; the banner offers equally accessible allow / decline.
 * Consent can be withdrawn at any time using the privacy preferences button.
 */
export default function TikTokPixel() {
  const { pathname } = useLocation();
  const [choice, setChoice] = useState(savedChoice);
  const [showChoices, setShowChoices] = useState(() => savedChoice() === null);

  useEffect(() => {
    const refresh = () => {
      pixel.update(pathname);
      setChoice(savedChoice());
    };
    const sync = event => {
      if (event.key === TIKTOK_MARKETING_CONSENT_KEY || event.key === null) refresh();
    };
    refresh();
    window.addEventListener('storage', sync);
    window.addEventListener('bizctrl:marketing-consent-changed', refresh);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('bizctrl:marketing-consent-changed', refresh);
    };
  }, [pathname]);

  // No marketing banners or scripts without a real Pixel ID and production origin.
  if (!pixel.enabled || pathname !== '/' || privacyOptOut()) return null;

  function choose(value) {
    try {
      window.localStorage.setItem(TIKTOK_MARKETING_CONSENT_KEY, value);
    } catch {
      // If the browser blocks persistence, do not turn tracking on.
      setChoice(null);
      setShowChoices(true);
      return;
    }
    setChoice(value);
    setShowChoices(false);
    window.dispatchEvent(new Event('bizctrl:marketing-consent-changed'));
  }

  return (
    <>
      {showChoices ? (
        <section
          role="region"
          aria-label="Marketing tracking preferences"
          className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-900 shadow-xl"
        >
          <p className="font-semibold">Marketing measurement choices</p>
          <p className="mt-1 text-slate-700">
            If you allow it, BizCTRL uses TikTok Pixel on this public page to measure advertising visits.
            We do not share restaurant data or payment details with TikTok. Tracking is off unless you agree.
            You can change your choice any time.
            {' '}<a className="underline" href="/privacy">Privacy policy</a>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 font-medium"
              onClick={() => choose('denied')}>No, thanks</button>
            <button type="button" className="rounded-lg bg-blue-700 px-4 py-2 font-medium text-white"
              onClick={() => choose('granted')}>Allow marketing measurement</button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          aria-label="Change marketing tracking preferences"
          className="fixed bottom-3 left-3 z-[100] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 shadow"
          onClick={() => setShowChoices(true)}
        >
          Marketing privacy {choice === 'granted' ? '· On' : '· Off'}
        </button>
      )}
    </>
  );
}
