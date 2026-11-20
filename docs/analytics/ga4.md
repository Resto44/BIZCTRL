# BizCTRL GA4

Production property: BizCTRL (565358269), account RESTAURENT NAJAM (327296462).
Web stream: BizCTRL Production (16384253385), https://mybizctrl.site.
Measurement ID: G-MD8P47JQBC. Vercel production env: VITE_GA_MEASUREMENT_ID.
Dashboard: https://analytics.google.com/analytics/web/#/a327296462p565358269/reports/intelligenthome

Google's Enhanced Measurement is OFF. Keep it off to avoid automatic URL/form data collection and duplicate SPA pageviews. The app sends one manual page_view per supported route change. See the fixed route allowlist in src/lib/googleAnalytics.js. Unknown, platform-owner, recovery, invitation, customer/partner portal and public display routes are excluded. The separate platform-owner bundle does not load analytics.

The tag loads only on the exact production hostname and only after explicit consent. An English/Arabic/Persian consent control supports rejection and withdrawal; withdrawal disables GA, updates consent and clears first-party GA cookies. Ads storage, ad personalization and Google signals remain disabled. Preview and development builds never collect data. No user_id, account ID, names, email addresses, financial data, URL queries, fragments or document titles are passed to GA. Referrer is intentionally blank, so acquisition-source attribution is limited. Device and approximate geography are handled by Google.

Use Realtime for receipt checks, Engagement / Pages and screens for page usage and user reports for device/geography and returning visitors. Standard reporting can take 24–48 hours. Counts describe consenting browsers, not the number of registered ERP accounts. Consent denial, blockers and multiple devices affect counts. No historical data is backfilled.

Validation: tests/googleAnalytics.test.js covers initial/rejected consent, SPA deduplication, sanitization, excluded routes, withdrawal/regrant, environment guards and blocked storage. Build with the production measurement ID; deploy; visit supported pages, accept analytics, navigate between them and verify Realtime page titles. Also exercise Decline and Analytics preferences. Do not use real ERP records as test analytics payloads.

To disable: remove VITE_GA_MEASUREMENT_ID and redeploy. No database migration or server secret is required.

## Google managed tag container

Google automatically upgraded this stream to Tag Manager container GTM-MDP2QT6P (account 6406826991, container 288015818). Published version 2, `BizCTRL consent-gated SPA analytics`, disables send_page_view, allow_google_signals and allow_ad_personalization_signals; uses safe default page_location/page_title/page_referrer; and unchecks Ignore duplicate instances of on-page configuration so SPA updates are honored. Keep these settings in sync with the app. The initial Google-generated version sent an additional raw-title pageview during initial testing; those early test events remain in the initial reporting period.

Production release: PR #369, commit d3d633803d9bf13727c85b141e46fb8bc67dbfc7; Vercel dpl_FaJcozNgaUXREpp9CW8JZvwyACcN. CI completed successfully. Live test confirmed no Google script after Decline and receipt of sanitized Privacy and Contact pageviews after Allow analytics.
