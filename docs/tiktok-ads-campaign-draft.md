# BizCTRL | TikTok Ads campaign draft — NOT launched

## Budget authorization received 2026-11-21 — hard stop

The user specified all of these in a single approval:
- **150 SAR per day**
- **7 days**
- **50 SAR total maximum / hard spend cap**

These instructions are mathematically inconsistent (150 SAR × 7 days = 1,050 SAR). **Treat 50 SAR as the binding maximum**, never infer authorization for 1,050 SAR. TikTok's published minimum spend ($50+ campaign budget; $20+ ad-group daily budget) also makes the stated 50 SAR total cap incompatible with the current standard Ads Manager budget thresholds. **Do not create or enable spend-bearing campaigns, use automatic billing, or increase the budget.**

Required before live launch: explicit clarified budget and cap, connected TikTok advertiser account, real Pixel ID, consent and checkout event verification, and tests. Pixel and campaign remain non-live. Source: https://ads.tiktok.com/resources/help/article/budget (last updated July 2026).


**Advertiser:** BizCTRL / @bizctrl26
**Destination:** https://mybizctrl.site/#pricing
**Primary business KPI:** verified new paid subscriptions / CAC
**Campaign status:** DRAFT PLANNING ONLY (no advertiser campaign created)

## Prerequisites

- Connected TikTok Ads account with permission to create campaigns and website data sources
- Account-specific TikTok Pixel ID installed on production with valid marketing consent
- Verified registration and Paddle-paid subscription conversion events; event IDs deduplicated
- Campaign currency and user-approved daily budget, total spend cap, and run duration
- Working localized purchase checkout for each targeted country and supported payment method
- Original 40-second Omar/Sara export, correct AI/commercial labels and licensed audio

## Structure (after prerequisites)

Campaign: \`BizCTRL | Arabic | Subscription Conversions | Test 01\`
- Objective: Website conversion / Website sales, selecting the available equivalent in the live UI
- Campaign state: PAUSED until explicit spend amount and activation are confirmed
- Optimization: Verified CompletePayment when validated and with enough training data; otherwise a verified CompleteRegistration interim goal, not clicks
- Landing page: \`https://mybizctrl.site/#pricing\`
- Optimization setting: lowest-cost / maximum delivery if available; no made-up CPA targets
- Placements: TikTok and/or supported automatic placements, confirm actual account options
- Regions: countries enabled in advertiser account AND where billing, language, service and support are available. Separate Arabic, English and Dari language campaigns. Do not use indiscriminate worldwide targeting.
- Audience A: Broad/Smart+ when compatible with conversion measurement
- Audience B: business-owner/restaurant/operations interests where actual targeting options exist
- Retarget: qualified landing visits or engaged video viewers with advertising consent; exclude confirmed subscribers where a compliant audience is available
- Include three creative tests: comedy-drama 40s; concise 15s cash-flow demo; 15s purchase/invoice dashboard demo
- Don't make claims of guaranteed profits, savings or customer results.

### Arabic ad copy

**Headline / hook:** \`المطعم زحمة... بس وين راحت الفلوس؟! 😂\`

**Text:**
\`إذا مبيعات مطعمك زينة، بس حسابات الكاش والمشتريات ملخبطة، شوف كيف بيز كنترول يخليك تراجع الأرقام بوضوح. تابع عمر وسارة، واكتشف الباقات المتاحة لمشروعك.\`

**CTA:** \`اكتشف الباقات\` or closest TikTok-approved CTA.

### Reporting

Cost, impressions, click-through, landing sessions, verified registrations, paid subscription purchases, cost per paid subscriber, subscription revenue, and qualified purchases by country. Compare 7-day results; pause when spend reaches pre-approved cap.

## Do not start until

Actual TikTok Ads access + Pixel ID + consent + verified conversion flow + exact user-approved budget and spend cap are provided. No spending, fake conversions or invented audience sizes.
