const PRODUCTION_APP_URL = 'https://base44-rest-ctrl.vercel.app';

export function getApplicationBaseUrl() {
  if (import.meta.env.PROD) return PRODUCTION_APP_URL;
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
}

export function getPlatformOwnerRecoveryRedirectUrl() {
  return `${getApplicationBaseUrl()}/platform-owner/login?mode=recovery`;
}

export { PRODUCTION_APP_URL };

