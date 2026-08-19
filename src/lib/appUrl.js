const PRODUCTION_APP_URL = 'https://mybizctrl.site';

export function getApplicationBaseUrl() {
  if (import.meta.env.PROD) return PRODUCTION_APP_URL;
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'http://localhost:3000';
}

export function getPlatformOwnerRecoveryRedirectUrl() {
  return `${getApplicationBaseUrl()}/platform-owner/recover`;
}

export { PRODUCTION_APP_URL };
