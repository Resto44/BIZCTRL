import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { createTikTokPixel, TIKTOK_MARKETING_CONSENT_KEY } from '@/lib/tiktokPixel';

const pixel = createTikTokPixel({
  window,
  document,
  pixelId: import.meta.env.VITE_TIKTOK_PIXEL_ID,
  production: import.meta.env.PROD,
});

// No UI or tracking without the visitor's explicit marketing consent.
// Consent settings must dispatch 'bizctrl:marketing-consent-changed'
// whenever a choice is changed in the same tab.
export default function TikTokPixel() {
  const { pathname } = useLocation();
  useEffect(() => {
    const refresh = () => pixel.update(pathname);
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
  return null;
}
