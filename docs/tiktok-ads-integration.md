# BizCTRL TikTok Pixel

Account: 7383351887828893712 (مطعم نجم الريان البخاري0622).
Pixel: BizCTRL Production — `DC0KH2JC77U8SQE08E80`.
Created in Events Manager on 2026-11-21. No paid advertising authorized; 50 SAR hard total ceiling.

## Configuration

Set `VITE_TIKTOK_PIXEL_ID` in Vercel production. No Events API token is included in client code.
Automatic Advanced Matching OFF; enhanced data postback OFF; first-party cookies permitted only after explicit website marketing consent.
SDK `historyObserver: false` prevents automatic SPA pageviews. The root landing page alone is eligible. Unknown query parameters, fragments and private referrers block loading; a bounded `ttclid` and public pricing/features anchors are permitted.
Consent uses `bizctrl.marketing-consent.v1`, separately from Google Analytics. GPC and DNT override consent. No script loads before opt-in. On leaving the allowed context, consent is revoked and this document never re-grants, preventing replay of buffered private data. Changing a loaded Pixel's consent reloads the document.

## Scope and verification

Only PageView is implemented. CompleteRegistration and paid subscription events are NOT implemented or verified. Do not select these as campaign optimization goals until integrated with canonical, consent-aware server payment settlement and idempotent event IDs. Checkout open and redirect are not purchases.

11 focused tests pass for loading, privacy signals, route boundaries, SDK history settings and consent withdrawal. Build and CI must pass before merge. Events Manager receipt must be checked separately after deployment; creation of a Pixel is not proof of receipt.

Official SDK documentation: https://business-api.tiktok.com/portal/docs/work-with-single-page-applications/v1.3
