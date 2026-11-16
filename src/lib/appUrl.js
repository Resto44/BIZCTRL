const PRODUCTION_APP_URL = 'https://mybizctrl.site';

export function getApplicationBaseUrl() {
  if (import.meta.env.PROD) return PRODUCTION_APP_URL;
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'http://localhost:3000';
}

export function getPlatformOwnerRecoveryRedirectUrl() {
  // Separate admin deployment gets its own auth-storage origin and callback.
  // Keep the existing URL for older live recovery emails until cutover.
  if (typeof window !== 'undefined' && window.location.hostname === 'admin.mybizctrl.site') {
    return 'https://admin.mybizctrl.site/platform-owner/new-owner-setup';
  }
  return `${getApplicationBaseUrl()}/platform-owner/new-owner-setup`;
}

export { PRODUCTION_APP_URL };
