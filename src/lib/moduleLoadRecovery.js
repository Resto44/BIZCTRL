// Recover stale deployment chunks once without dropping deep links or invitation tokens.
export function recoverModuleLoad(error, browser = window) {
  const message = typeof error === 'string' ? error : error?.message || '';
  if (!/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed/i.test(message)) return false;
  if (browser.navigator.onLine === false) return false;
  const url = new URL(browser.location.href);
  if (url.searchParams.has('__app_reload')) return false;
  const key = `bizctrl:module-recovery:${url.pathname}`;
  try {
    const previous = Number(browser.sessionStorage.getItem(key));
    if (previous && Date.now() - previous < 300000) return false;
    browser.sessionStorage.setItem(key, String(Date.now()));
  } catch { /* The URL guard also prevents loops when storage is blocked. */ }
  url.searchParams.set('__app_reload', '1');
  browser.location.replace(url.href);
  return true;
}
