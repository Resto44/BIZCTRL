import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { createAnalytics, ANALYTICS_CONSENT_KEY } from '@/lib/googleAnalytics';

const analytics = createAnalytics({ window, document, measurementId: import.meta.env.VITE_GA_MEASUREMENT_ID, production: import.meta.env.PROD });

// Background measurement only. Storage consent is always denied; no banner or button.
export default function GoogleAnalytics() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    analytics.update(pathname);
    const sync = event => {
      if (event.key === ANALYTICS_CONSENT_KEY || event.key === null) analytics.update(pathname);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [pathname]);
  return null;
}
