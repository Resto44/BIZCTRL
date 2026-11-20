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
  let activeConsent = null;
  const disableKey = `ga-disable-${measurementId}`;
  function command() { win.dataLayer.push(arguments); }
  function update(pathname) {
    if (!enabled) return;
    const page = analyticsPage(pathname);
    // Honor previous opt-outs and browser privacy signals without displaying UI.
    const savedConsent = readAnalyticsConsent({ getItem: key => win.localStorage.getItem(key) });
    const optedOut = savedConsent === 'denied' || win.navigator?.globalPrivacyControl === true || win.navigator?.doNotTrack === '1';
    const storageConsent = !optedOut && savedConsent === 'granted' ? 'granted' : 'denied';
    win[disableKey] = optedOut || !page;
    if (storageConsent !== 'granted' && activeConsent !== 'denied') clearLegacyCookies();
    if (loaded && activeConsent !== storageConsent) {
      command('consent', 'update', { analytics_storage: storageConsent, ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      activeConsent = storageConsent;
    }
    if (win[disableKey]) { previous = null; return; }
    if (!loaded) {
      win.dataLayer = win.dataLayer || [];
      command('consent', 'default', { analytics_storage: storageConsent, ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      activeConsent = storageConsent;
      command('set', { ads_data_redaction: true, url_passthrough: false });
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
    command('config', measurementId, { ...page, send_page_view: false });
    if (previous !== page.page_location) {
      command('event', 'page_view', { ...page, send_to: measurementId });
      previous = page.page_location;
    }
  }
  function clearLegacyCookies() {
    // Remove analytics cookies when consent is absent or withdrawn.
    for (const item of doc.cookie.split(';')) {
      const name = item.split('=')[0].trim();
      if (!/^_ga(?:_|$)/.test(name)) continue;
      for (const domain of ['', ';domain=mybizctrl.site', ';domain=.mybizctrl.site']) {
        doc.cookie = `${name}=;Max-Age=0;path=/${domain};SameSite=Lax;Secure`;
      }
    }
  }
  return { enabled, update };
}
