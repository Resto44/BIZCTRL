# BizCTRL launch readiness — 2026-11-06

Baseline: `7a0111b289f27fbf3ec8c635e1b14eed3e15e3c9`.

## Decision

**Launch readiness is NOT yet established.** This is a partial engineering and public-browser audit. No new owner/staff account or financial test record has been submitted during this audit. Authenticated acceptance and payment-provider activation remain gates, not assumed successes.

## Confirmed fixes in this change

1. Landing pricing had no visible loading, error, timeout or empty state. Reads now have a nine-second deadline, explicit EN/AR/FA states and retry. Failed reads never invent prices. Four behavioral tests cover loading, denied read/retry, empty catalog and stale responses after a timed-out attempt.
2. `App -> RetailInventoryRoute -> RetailInventory -> RetailInventoryAnalytics` eagerly imported Recharts into the startup bundle. The existing startup graph check failed with `Optional portal feature blocks startup: vendor-charts`. Lazy-load the route inside its existing Suspense boundary; authorization and fallback selection stay in the route. The graph check passes after the fix.
3. Add the existing startup graph check to CI after build, with lockfile, Vite config and checker path triggers. Update three source-contract tests to inspect the extracted catalog hook, retaining canonical-table/public-filter assertions.

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
- Final full-suite attempt: 1,763 passed, one existing treasury retry test timed out at five seconds while build ran concurrently. The treasury file and new catalog file then passed separately (7 tests, treasury tests 113 ms). The four focused contract/catalog files passed all 27 tests. No assertion was relaxed to hide the timeout; a fully green final CI run remains required.
- Final production build exited successfully; startup graph check passed with six initial JS files and 674,133 gzip bytes. Chart/PDF bundles are absent from the initial static dependency graph.
- Runtime identifier and UI type checks passed before the small final changes. The previous audit's full-project type-check backlog was not repaired or re-certified here.
- Project uses pnpm and its frozen lockfile successfully. `npm ci` fails because the secondary package-lock is stale; do not switch CI to npm without reconciling that lockfile.

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

The prepared browser form is `BizCTRL QA Launch 2026-11-06`, restaurant mode, branch `QA Branch 01`. Email and password remain blank for secure user completion. The form is not an existing account.
