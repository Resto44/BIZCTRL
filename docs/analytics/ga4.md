# BizCTRL GA4

Production property: BizCTRL (565358269), account RESTAURENT NAJAM (327296462).
Web stream: BizCTRL Production (16384253385), https://mybizctrl.site.
Measurement ID: G-MD8P47JQBC. Vercel production env: VITE_GA_MEASUREMENT_ID.
Dashboard: https://analytics.google.com/analytics/web/#/a327296462p565358269/reports/intelligenthome

Google's Enhanced Measurement is OFF. Keep it off to avoid automatic URL/form data collection and duplicate SPA pageviews. The app sends one manual page_view per supported route change. See the fixed route allowlist in src/lib/googleAnalytics.js. Unknown, platform-owner, recovery, invitation, customer/partner portal and public display routes are excluded. The separate platform-owner bundle does not load analytics.

The tag loads only on the exact production hostname and supported fixed routes. There is no banner or analytics-preferences button. All four consent types (analytics_storage, ad_storage, ad_user_data, ad_personalization) stay denied before initialization and are never granted. Google receives limited cookieless pings, not full consented analytics. Prior explicit refusals, GPC and Do Not Track block the tag entirely. Former GA cookies are removed before initialization; the app stores no new analytics choice or identifier.

No user_id, account ID, names, email addresses, financial records, query strings, fragments or document titles are passed to GA. Referrer is intentionally blank. Ads data redaction is enabled and URL passthrough is disabled. The public privacy policy discloses cookieless measurement.

Cookieless signals may not appear like consented events in Realtime; user recognition and retention are limited. Modeling depends on Google's eligibility thresholds and is not promised. These reports are not registered ERP user totals and do not backfill historical data.

Validation: tests/googleAnalytics.test.js covers default denied ordering, no grant path, previous refusal, browser privacy signals, legacy cookie removal, safe routes, SPA deduplication, environment guards and no UI. Build with production measurement ID and verify the deployed pages show no analytics controls.

To disable: remove VITE_GA_MEASUREMENT_ID and redeploy. No database migration or server secret is required.

## Google managed tag container

Google automatically upgraded this stream to Tag Manager container GTM-MDP2QT6P (account 6406826991, container 288015818). Published version 2, `BizCTRL consent-gated SPA analytics`, disables send_page_view, allow_google_signals and allow_ad_personalization_signals; uses safe default page_location/page_title/page_referrer; and unchecks Ignore duplicate instances of on-page configuration so SPA updates are honored. Keep these settings in sync with the app. The initial Google-generated version sent an additional raw-title pageview during initial testing; those early test events remain in the initial reporting period.

Production release: PR #369, commit d3d633803d9bf13727c85b141e46fb8bc67dbfc7; Vercel dpl_FaJcozNgaUXREpp9CW8JZvwyACcN. CI completed successfully. Live test confirmed no Google script after Decline and receipt of sanitized Privacy and Contact pageviews after Allow analytics.
