// TikTok Pixel is opt-in only. Never send ERP, tenant, billing, identity,
// arbitrary URL query strings, or customer data to ad platforms.
export const TIKTOK_MARKETING_CONSENT_KEY = 'bizctrl.marketing-consent.v1';

const PUBLIC_MARKETING_PATHS = new Set(['/']);
const TTQ_METHODS = [
  'page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once',
  'ready', 'alias', 'group', 'enableCookie', 'disableCookie',
  'holdConsent', 'grantConsent', 'revokeConsent',
];

export function readTikTokMarketingConsent(storage) {
  try {
    return storage.getItem(TIKTOK_MARKETING_CONSENT_KEY) === 'granted';
  } catch {
    return false;
  }
}

function allowedOrigin(win) {
  return ['mybizctrl.site', 'www.mybizctrl.site'].includes(win?.location?.hostname);
}

function privacyAllows(win) {
  try {
    return readTikTokMarketingConsent(win.localStorage) &&
      win.navigator?.globalPrivacyControl !== true &&
      win.navigator?.doNotTrack !== '1';
  } catch {
    return false;
  }
}

function normalizePath(pathname) {
  return (String(pathname || '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/');
}

export function createTikTokPixel({ window: win, document: doc, pixelId, production }) {
  const id = String(pixelId || '').trim();
  const enabled = Boolean(production && allowedOrigin(win) && /^[A-Z0-9]{15,30}$/i.test(id));
  let loaded = false;
  let previousPath = null;
  let consentActive = false;

  function bootstrap() {
    win.TiktokAnalyticsObject = 'ttq';
    const ttq = win.ttq = win.ttq || [];
    ttq.methods = TTQ_METHODS;
    ttq.setAndDefer = function(queue, name) {
      if (!queue[name]) {
        queue[name] = function() {
          queue.push([name].concat(Array.from(arguments)));
        };
      }
    };
    for (const method of TTQ_METHODS) ttq.setAndDefer(ttq, method);
    ttq._i = ttq._i || {};
    ttq._i[id] = ttq._i[id] || [];
    ttq._t = ttq._t || {};
    ttq._t[id] = Date.now();
    ttq._o = ttq._o || {};
    ttq._o[id] = {};
    ttq._i[id]._u = 'https://analytics.tiktok.com/i18n/pixel/events.js';

    const script = doc.createElement('script');
    script.id = 'bizctrl-tiktok-pixel';
    script.async = true;
    script.src = 'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' +
      encodeURIComponent(id) + '&lib=ttq';
    doc.head.appendChild(script);
    loaded = true;
  }

  function update(pathname) {
    if (!enabled) return false;

    const path = normalizePath(pathname);
    const isAllowed = PUBLIC_MARKETING_PATHS.has(path);
    const consent = privacyAllows(win);
    if (!isAllowed || !consent) {
      if (loaded && consentActive && !consent && typeof win.ttq?.revokeConsent === 'function') {
        win.ttq.revokeConsent();
      }
      if (!consent) consentActive = false;
      previousPath = null;
      return false;
    }
    if (!loaded) bootstrap();
    if (!consentActive) {
      // Supported in modern TikTok Pixel. First load always follows an
      // explicit grant, so no events are queued before opt-in.
      if (typeof win.ttq.grantConsent === 'function') win.ttq.grantConsent();
      consentActive = true;
    }
    if (previousPath !== path) {
      win.ttq.page();
      previousPath = path;
    }
    return true;
  }

  return { enabled, update };
}
