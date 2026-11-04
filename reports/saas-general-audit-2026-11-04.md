# BizCTRL SaaS audit — 2026-11-04

Baseline: main at `5f414b89276dcf9e90ec3ced584be58104a743a2`.
Scope: local automated regression suite, build/static checks, and authenticated read-only owner UI checks on mybizctrl.site. This is not a certification of every role, transaction, business mode or statutory integration.

## Confirmed defects fixed

1. **Owner navigation trap (high):** visiting `/products` cached a redirect in a hidden workspace panel. Later clicks to Sales, Purchases and Settings returned to Product Management. Reproduced in the production browser and in regression tests. App aliases, universal POS entry and retail portal redirects now redirect only while their workspace tab is visible. Outside workspace tabs the default remains active. Auth guards are unchanged. Four regression scenarios verify leaving and revisiting aliases including `/pos`; the original behavior fails.
2. **Missing category search results:** filtering by a child name or child activity status removed its nonmatching parent, so the tree displayed no matching child. Preserve the matching node's ancestor path without adding unrelated siblings. Two component tests cover Persian child-name search and inactive-child filtering; both fail before the fix.
3. **Lint failures:** removed unused imports in OwnerUniversalPOS and PlatformPlanPricing.
4. **Stale audit scripts:** updated checks to the existing BranchScope-based report queries, dashboard realtime prefixes, removed customer portal redirect and UnifiedSalesClosing. These are source-contract checks, not database access-policy proofs.

## Verification

| Check | Result |
| --- | --- |
| Baseline complete Vitest suite | 1,704 passed, 0 failed |
| Final complete Vitest suite | 1,710 passed, 0 failed |
| Focused navigation/category component tests | 14 passed |
| ESLint | Passed after fixes |
| Runtime identifier check | Passed |
| UI typecheck | Passed |
| Production build | Passed; local Base44 app-ID environment warning remains |
| Startup import graph | Passed; approximately 735 KB gzip startup JavaScript |
| Localization verification | Passed: 1,200 core keys/language; 1,530 centralized literals; 1,381 audited candidates |
| ERP audit regression script | Passed after updating stale source-contract expectations |
| Restaurant module cleanup script | Passed after updating obsolete file paths |
| Full-project typecheck | **Failed at baseline: 1,374 diagnostics across 203 files** |

The full typecheck is not repaired by this patch. Its most frequent diagnostics include TS2339 (510), TS2741 (217), TS2739 (215), TS2345 (139) and TS2322 (73). These include test-fixture typing and application typing; they are not equivalent to 1,374 observed production crashes. Do not disable checking or claim full type safety to conceal them.

## Live owner smoke checks

Rendered page headings verified for owner dashboard, reports, sales, product management, purchases, inventory, treasury, employees, role permissions, settings, billing, sales invoices, purchase orders, expenses, transfers, waste, suppliers, profit/loss, cashflow, balance sheet, debts, customers, network settlement, branch management, approvals, notifications, support, workspace customization, sales dashboard, CEO dashboard, branch analytics, Oracle analytics, BI center, alerts, wallet banking, cash register, sales sources, businesses/branches and restaurant POS. `/pos` resolved to `/restaurant/pos`.

The initial fast navigation sweep was insufficient to establish rendering and was replaced with heading/visible-state checks. Oracle analytics rendered on a later state check after its initial load. A heading proves route rendering, not completion or accuracy of all underlying queries. Some pages were initially loading; no real sale, payment, payroll, stock movement or category import was submitted. The live navigation trap is a confirmed release issue; direct page navigation was used to inspect other modules.

No application-origin browser console errors were returned in the captured error scan; extension metadata errors were excluded. Vercel reported no runtime errors over the queried 24-hour interval. Neither result covers all client sessions or Supabase operations.

## Coverage limits / remaining work

- The signed-in live account is a restaurant owner. Other business modes (cafe, retail, warehouse, factory, pharmacy, clinic, wholesale, services, other) and manager/employee/supplier/platform-owner roles have automated coverage of varying depth, not individually authenticated end-to-end acceptance in this audit.
- Full write-flow acceptance needs disposable staging tenants, branch-scoped role accounts and test payment credentials. Do not create financial records in the live business to simulate coverage.
- Real iPhone/Android installation, printer/scanner hardware, offline recovery and concurrency/load tests were not performed.
- No live tax-authority transmission or legal/tax compliance certification was performed.
- Full-project typing remains an open engineering backlog; further work should fix typed boundaries and model definitions with behavior regression coverage.
