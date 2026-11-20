// Only fixed page names are sent. Never pass URLs, user records or ERP data to GA.
export const ANALYTICS_CONSENT_KEY = 'bizctrl.analytics-consent.v1';
const ORIGIN = 'https://mybizctrl.site';
const PAGES = new Map(Object.entries({
  '/': 'Home', '/erp-login': 'Login', '/erp-register': 'Registration',
  '/terms': 'Terms', '/privacy': 'Privacy', '/refund': 'Refund', '/contact': 'Contact', '/help': 'Help',
  '/owner-command-center': 'Owner dashboard', '/dashboard': 'Dashboard',
  '/executive-command-center': 'Executive dashboard', '/sales': 'Sales',
  '/sales/invoices': 'Sales invoices', '/purchases': 'Purchases', '/expenses': 'Expenses',
  '/product-management': 'Products', '/inventory': 'Inventory', '/inventory/stock': 'Stock',
  '/inventory/operations': 'Inventory operations', '/inventory/control': 'Inventory control',
  '/reports': 'Reports', '/sales-dashboard': 'Sales dashboard', '/pos': 'POS',
  '/restaurant/pos': 'Restaurant POS', '/retail/cashier': 'Retail POS',
}));
export function analyticsPage(pathname) {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const title = PAGES.get(path);
  return title ? { page_location: ORIGIN + path, page_title: `BizCTRL | ${title}`, page_referrer: '' } : null;
}
export function readAnalyticsConsent(storage) {
  try { const value = (storage || window.localStorage).getItem(ANALYTICS_CONSENT_KEY); return ['granted', 'denied'].includes(value) ? value : null; }
  catch { return null; }
}
export function createAnalytics({ window: win, document: doc, measurementId, production }) {
  const enabled = production && win.location.hostname === 'mybizctrl.site' && /^G-[A-Z0-9]+$/.test(measurementId || '');
  let loaded = false;
  let previous = null;
  const disableKey = `ga-disable-${measurementId}`;
  function command() { win.dataLayer.push(arguments); }
  function update(consent, pathname) {
    if (!enabled) return;
    const page = analyticsPage(pathname);
    win[disableKey] = consent !== 'granted' || !page;
    if (win[disableKey]) { previous = null; return; }
    if (!loaded) {
      win.dataLayer = win.dataLayer || [];
      command('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      command('js', new Date());
      command('config', measurementId, { ...page, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_flags: 'SameSite=Lax;Secure' });
      const script = doc.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
      script.id = 'bizctrl-google-analytics';
      doc.head.appendChild(script);
      loaded = true;
    }
    // Set safe defaults for automatic session/engagement events too.
    command('set', page);
    if (previous !== page.page_location) {
      command('event', 'page_view', { ...page, send_to: measurementId });
      previous = page.page_location;
    }
  }
  function choose(value) {
    try { win.localStorage.setItem(ANALYTICS_CONSENT_KEY, value); } catch { /* In-memory choice still applies. */ }
    if (value === 'denied') {
      win[disableKey] = true;
      if (loaded) command('consent', 'update', { analytics_storage: 'denied' });
      // Remove our first-party GA cookies when consent is withdrawn.
      for (const item of doc.cookie.split(';')) {
        const name = item.split('=')[0].trim();
        if (!/^_ga(?:_|$)/.test(name)) continue;
        for (const domain of ['', ';domain=mybizctrl.site', ';domain=.mybizctrl.site']) {
          doc.cookie = `${name}=;Max-Age=0;path=/${domain};SameSite=Lax;Secure`;
        }
      }
    } else if (loaded) command('consent', 'update', { analytics_storage: 'granted' });
  }
  return { enabled, update, choose };
}
