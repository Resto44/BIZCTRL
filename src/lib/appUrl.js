const PRODUCTION_APP_URL = import.meta.env.VITE_PUBLIC_APP_URL || '';

export function getApplicationBaseUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return PRODUCTION_APP_URL || 'http://localhost:3000';
}

export function getPlatformOwnerRecoveryRedirectUrl() {
  return `${getApplicationBaseUrl()}/platform-owner/login?mode=recovery`;
}

export { PRODUCTION_APP_URL };
