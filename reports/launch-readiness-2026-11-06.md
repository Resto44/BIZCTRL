# BizCTRL launch readiness — 2026-11-06

Baseline: `7a0111b289f27fbf3ec8c635e1b14eed3e15e3c9`.

## Decision

**Launch readiness is NOT yet established.** This is a partial engineering, public-browser and authenticated-owner audit. No new owner/staff account or financial test record has been submitted during this audit. A real owner signed in successfully through secure browser authentication. Isolated role/accounting acceptance and payment-provider activation remain gates, not assumed successes.

## Confirmed fixes in this change

1. Landing pricing had no visible loading, error, timeout or empty state. Reads now have a nine-second deadline, explicit EN/AR/FA states and retry. Failed reads never invent prices. Four behavioral tests cover loading, denied read/retry, empty catalog and stale responses after a timed-out attempt.
2. `App -> RetailInventoryRoute -> RetailInventory -> RetailInventoryAnalytics` eagerly imported Recharts into the startup bundle. The existing startup graph check failed with `Optional portal feature blocks startup: vendor-charts`. Lazy-load the route inside its existing Suspense boundary; authorization and fallback selection stay in the route. The graph check passes after the fix.
3. Add the existing startup graph check to CI after build, with lockfile, Vite config and checker path triggers. Update three source-contract tests to inspect the extracted catalog hook, retaining canonical-table/public-filter assertions.

4. Authenticated Sales history was empty while Reports showed finalized closings. The scope-reset effect cancelled the newly mounted active history query. Restrict cancellation to inactive queries; retain full tenant/branch query keys and all draft/form reset safeguards. A real QueryObserver experiment reproduced pending/idle with no rows under broad cancellation and success with data under inactive-only cancellation.

## Live evidence

- Public home, owner registration, all ten business-mode choices, monthly/annual selector and annual-plan return path were observed in the production browser.
- Public catalog API returned HTTP 200 using the repository's publishable anon key. Database and visible monthly prices match: Starter USD 10 / 3 branches; Growth USD 20 / 5; Enterprise USD 50 / 15.
- Annual visible totals are USD 84, 168, 420, consistent with 12 months less 30%. This verifies displayed arithmetic, not provider charging.
- The initial absent pricing cards were a loading state: prices appeared subsequently. No catalog outage is claimed.
- Database inspection: zero public ordinary/partitioned tables with RLS disabled. This is NOT proof of correct tenant isolation or role authorization.
- Supabase health advisor returned no findings. Security advisor includes leaked-password protection disabled, 49 RLS-enabled tables without policies, 196 authenticated SECURITY DEFINER functions and one anon-executable treasury trigger function. The latter returns `trigger`; the warning alone is not proof of an exploitable RPC. Private/RPC-only tables can intentionally have no direct policies. No broad policy/permission changes were made.
- Performance advisor includes 239 unindexed foreign keys, 26 initplan warnings, 73 multiple-permissive-policy findings and 7 duplicate-index findings. These need measured workload review; counts are not counts of observed failures.
- `paddle_webhook_events` and `paddle_subscription_mirror` contain no rows. Global subscription test mode is disabled. No live purchase, cancellation, upgrade, refund or webhook activation was tested or initiated.
- Mail connector exposes the official support mailbox. No new message was sent. Signup sender/SMTP branding from the preceding task is still unverified and not claimed complete.

## Validation

- Baseline complete Vitest: 301 files, 1,760 tests passed.
- Focused catalog/navigation/checkout tests: 12 passed.
- The first post-refactor full suite exposed three stale source-location assertions; these were moved to the catalog hook without removing their original contracts.
- Final complete Vitest after the Sales history and expense-allocation corrections: 303 files, 1,768 tests passed. The earlier treasury timeout did not recur without concurrent build load. GitHub Actions run 42229154786 also passed for the preceding pricing/startup commit; the newer history/accounting corrections require their own CI. No test assertion was weakened to hide a failure.
- Final production build exited successfully; startup graph check passed with six initial JS files and 674,097 gzip bytes. Chart/PDF bundles are absent from the initial static dependency graph.
- Runtime identifier and UI type checks passed after the final accounting corrections. The previous audit's full-project type-check backlog was not repaired or re-certified here.
- Project uses pnpm and its frozen lockfile successfully. `npm ci` fails because the secondary package-lock is stale; do not switch CI to npm without reconciling that lockfile.

## Authenticated owner findings

- Owner sign-in succeeded. Dashboard, Billing, Sales Closing and Reports rendered. No financial record or subscription change was submitted.
- Monthly and annual prices match the public catalog. A plan below existing branch usage is disabled with a capacity explanation. Current trial expiry is consistent between banner and Billing.
- A prior failed provider payment appears in Billing. This is not evidence of successful payment activation.
- After selecting a branch in Closing, two Network Management accounts loaded and one was successfully selected. The form was closed without saving. No manager-role claim is made.
- Closing exposes only Owner/Restaurant funding sources and shows opening cash, cash received, cash paid out and expected cash. Actual finalization and ledger posting remain untested.
- **Found and corrected in code, production recheck pending:** fixed-cost allocation differed between Owner Dashboard and Reports for the same branch/date. Date-bounded owner accounting now uses the shared `allocateReportExpenses` logic. Configuration-only branch costs, repeated monthly sources, multi-branch totals and cross-month periods have four regression tests. Category configuration is filtered to the selected branch, and the fixed-cost source pool starts at the beginning of the range’s first month. No stored expense or financial transaction was changed.
- Reports labels later sections as calendar-based historical analytics; those sections differ from the selected-period summary. This should be made more explicit before launch.
- Real business identifiers and financial amounts are deliberately excluded from this repository report.

## Required acceptance before paid launch

Use clearly named, isolated QA organizations; never post simulated transactions to an actual business.

| Gate | Evidence still needed |
| --- | --- |
| Signup/auth | Submit new account, receive branded confirmation, verify link, sign in/out, recover access, ensure no duplicate organization |
| Business modes | Independently authenticate restaurant, cafe, retail, warehouse, factory, pharmacy, clinic, wholesale, services and custom organizations; verify template and module configuration |
| Roles/isolation | Owner invites manager, cashier, employee and supplier in QA tenant; verify allowed operations and denied cross-branch/cross-tenant requests |
| Sales/accounting | Purchase and receive stock, cash/card/credit sales, partial refund, customer collection, expense, treasury funding and closing; reconcile source rows, ledgers, dashboard and PDF |
| Cash invariant | Opening 100 + cash sale 200 + customer collection 30 + owner funding 40 - cash purchase 50 - cash expense 20 = counted cash 300; owner funding/collection are not new sales |
| Inventory invariant | Receive 10 units, sell 3, return 1 = 8 units; cost recognition and stock movement occur once, including retry |
| Closing | Multiple closings on the same day sum once; opening carry-forward is not revenue; missing read never displays zero as verified |
| Subscription | Provider sandbox or explicitly authorized live transaction; verify webhook idempotency, entitlement activation, annual period, upgrade limits, cancellation and failed payment |
| Device/reliability | Real mobile, touch POS, scanner/printer, interrupted connection, duplicate submit, concurrent cashiers and month rollover |

The earlier prepared browser form was `BizCTRL QA Launch 2026-11-06`, restaurant mode, branch `QA Branch 01`. Email and password remain blank for secure user completion. The form is not an existing account.

## Responsive startup follow-up

- Keep optional inventory charts out of the public startup graph on all viewport sizes.
- Move the two existing WebP illustrations out of base64 JavaScript into same-origin static assets, preserving intrinsic dimensions and async decoding. The second image remains lazy-loaded. This removes roughly 38 KB gzip from initial JavaScript; it does not claim a measured load-time improvement.
- Use the compact navigation below 1280 px, with the full desktop navigation on wider screens.
- Pricing cards use smaller narrow-screen padding/type, wrapping touch buttons and a wrapping title/discount row instead of an overlapping absolute badge. Text can wrap without widening the page; reduced-motion styles are scoped to the public site.
- Full regression suite: 303 files / 1,768 tests passed before the final cosmetic badge layout adjustment; focused landing/pricing checks and build are run again for that adjustment. Physical mobile, browser zoom and a full viewport screenshot matrix remain unverified.
- These updates are prepared in PR 266 and are not deployed to production.
