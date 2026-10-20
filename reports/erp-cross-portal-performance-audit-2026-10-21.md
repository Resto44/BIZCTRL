# BizCTRL ERP — Cross-portal startup, duplication and reliability audit
Date: 2026-10-21 · Repository: `Resto44/BIZCTRL` · Target: `mybizctrl.site`

## Scope and evidence
Source-level review covered the authenticated application router; shared Auth, Tenant, Branch Scope, Subscription and Realtime providers; Owner and Branch Manager dashboards; Employee and Supplier portals; Wallet/Partner portal; Platform Owner; restaurant and retail POS initial query patterns; Inventory snapshots; and Supplier Ledger / Purchase Invoice creation.

Evidence: GitHub current sources, Vercel deployment results, Supabase database metadata and read-only duplicate scans. No authenticated multi-device browser trace, fully executed Vitest suite, or load-test percentile measurements were available. Do **not** interpret a successful Vercel build as proof that every user workflow passes.

## Verified issues and corrections
| Area | Finding | Correction |
| --- | --- | --- |
| Startup auth | Temporary network timeouts could be treated like unauthenticated sessions; recovery could wipe all browser storage | Treat temporary auth failure separately and retry verification without clearing preferences |
| Tenant / identity | Unbounded network reads allowed long busy screens; tenant lookup failure could resemble missing business | Add 9s read deadlines, fail-closed retry state, no unauthorized onboarding or paywall redirect |
| Subscription | App focus + visibility could trigger overlapping subscription/history calls | Single throttled visibility refresh (60s); skip billing history on automatic refresh; preserve server subscription authorization |
| Branch metadata | Database branches were merged with legacy JSON; duplicate metadata could appear more than once | Prefer canonical DB ID and key, dedupe legacy by branch key or ID without deleting records |
| Navigation | Home and onboarding redirects used full document reloads | Use in-app router transitions to avoid repeating authorization/bootstrap |
| Owner report | Hidden Operations and Price Control datasets were loaded immediately on Executive view | Load heavy report queries only when their tab is opened; PDF retains its own authoritative data retrieval |
| Owner dashboard and consumption | Historical inventory snapshots could be summed as concurrent stock positions | Select the newest dated snapshot per product, branch, unit, keeping all audit rows |
| Manager inventory KPI | Historic inventory rows could produce repeated cards / incorrect stock alerts | Apply the same latest-snapshot selector and stable product/branch grouping |
| Manager widget errors | A single secondary query error replaced the whole dashboard | Keep core verified finance strict; show retryable secondary-widget warning without hiding the dashboard |
| Owner live refresh | Scheduled 15-second fallbacks repeated live queries even with realtime events | Use 60-second fallback with existing event-driven refresh and foreground resume |
| Wallet portal | Session and account RPC could remain indefinitely pending | Bound both reads, preserve existing retry UI and identity checks |
| Platform Owner | Snapshot had an unbounded wait and focus-refetch overhead | Add 9s deadline, 15s cache, explicit retry; retain canonical authorization and MFA checks |
| Purchase invoice | Same supplier, branch and invoice number could be posted again within a new form | Add pre-insert match check and instruct review of Supplier Ledger instead; existing entries untouched |

## Duplicate-data review — accounting safety
Read-only database checks found dated stock snapshots with the same product IDs, plus two supplier/invoice-number groups with more than one entry each. These are **review candidates**, not automatic deletions. Past stock snapshots may be valid historical records. Supplier-invoice corrections must reconcile status, payment events, debt links and stock receipt references first; never delete financial rows based only on a matching number.

The client-side duplicate-invoice check prevents some accidental repeat submissions but is not a transactional uniqueness guarantee against two simultaneous devices. A production-grade immutable idempotency key requires separate schema changes and migration of existing collisions **after** reconciliation.

## Database performance notes
Supabase performance advisor showed 233 unindexed foreign-key notices across this growing ERP schema. That does **not** justify creating every suggested index: the inspected primary tables remain comparatively small and indiscriminate indexes can harm writes. Target high-impact queries using real explain plans as volumes grow. PostgreSQL cumulative `pg_stat_statements` showed large total historical traffic for subscription snapshots and event queries; these totals do not isolate current users or prove latency improvements.

## Regression checks added
- `tests/erpPortalStartupReliability.test.js`: bounded reads, role-safe retry, throttling, portal waits, deferred report tabs and invoice duplicate check.
- `tests/inventorySnapshotDedup.test.js`: dated snapshots, branch isolation, unit isolation, Owner inventory value and consumption.
- Existing Owner startup and report tests remain in the repository.

Vercel building of the changed site is checked separately. There is no verified end-to-end session test for every role in this audit.

## Remaining priorities (not claimed fixed)
1. Run authenticated smoke tests for Owner, Branch Manager, Employee, Supplier, Partner Wallet, Platform Owner and both POS types. Confirm role assignments, alert deep links, checkout and stock mutation results.
2. Instrument navigation-to-useful-content, number of network calls and `p50/p75/p95` by mobile route. Compare against baseline instead of asserting unspecified percentage improvements.
3. Reconcile repeated supplier invoice groups with payment and inventory movements. Only then add durable backend idempotency/uniqueness and safe correction migrations.
4. Review realtime channel and per-page polling load under multiple open sessions; keep the 5-second restaurant POS production polling until order-latency validation supports changing it.
5. Add CI that executes Vitest, authenticated RLS integration tests and bundle-size budget on each change. A Vercel `READY` deployment alone does not execute those checks.
6. Continue internationalization and performance work for less-frequently used modules after gathering browser traces; this source audit does not certify that every SaaS module is free of defects.

## Release principle
No bypass of RLS or subscription checks, no invented ledger totals, no direct deletion of historical finance rows. Server permission controls remain authoritative.
