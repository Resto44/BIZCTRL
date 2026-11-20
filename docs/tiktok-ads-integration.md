# BizCTRL TikTok Ads — staged integration (not live yet)

**Status:** code scaffolding only. This branch intentionally sends **zero** TikTok events until an authorized campaign owner completes the prerequisites.

## Blockers before publishing or launching a paid campaign

1. Create the website data source in the intended TikTok Ads account (Tools → Events Manager → Connect Data Source → Web). Record the exact **Pixel ID**. Do not substitute a guessed ID.
2. Set Vercel Production environment variable \`VITE_TIKTOK_PIXEL_ID\` to that ID. Never place an Events API access token in a \`VITE_*\` variable.
3. Implement and verify a lawful **explicit marketing-consent user interface** and privacy notice. The code currently requires localStorage key \`bizctrl.marketing-consent.v1\` to be \`granted\`, honors browser GPC/DNT, and does **not** silently grant consent. Pages under ERP, authentication, billing or customer portals are never instrumented.
4. Publish the reviewed code after CI and privacy acceptance. In TikTok Events Manager verify the \`PageView\` event using Test Events and Diagnostics.
5. Add \`CompleteRegistration\` only at a verified successful registration callback; never on a button click.
6. Add \`CompletePayment\` only after the canonical Paddle webhook / server-side billing reconciliation verifies the **paid** subscription. Do not track a checkout open, pending payment, or success redirect as a confirmed purchase. If Events API is added, use a shared deduplication \`event_id\` with any browser event of the same purchase and follow consent requirements.
7. Verify landing page, checkout, pricing, eligible countries, localization, and event attribution end-to-end before enabling paid Ads.

## Safe behavior now

- Only the public root marketing route \`/\` is eligible for a TikTok PageView.
- No Pixel ID, no production environment, no explicit marketing consent, or privacy opt-out → **no TikTok script load**.
- No user IDs, tenant IDs, query strings, financial records, email addresses, or ERP actions are manually sent as event properties.
- This code introduces **no purchase attribution** until the verified server-side flow is integrated.
- On an already loaded session, a subsequent opt-out invokes \`revokeConsent()\` if the SDK supports it and suppresses further app-triggered PageViews.
- The same-tab consent settings component should dispatch \`bizctrl:marketing-consent-changed\` when a user changes consent; cross-tab changes are covered by the browser \`storage\` event.
- Do not create or enable a paid campaign without explicit approved budget/cap and a connected advertiser account.

## Validation

Run \`pnpm test -- tests/tiktokPixel.test.js\` and \`pnpm build\` in CI. After actual Pixel setup, use the TikTok Pixel Helper and Test Events to verify the installed production version. These tests and live verification have **not** been run by this code change.

Reference: https://ads.tiktok.com/help/article/get-started-pixel?lang=en
