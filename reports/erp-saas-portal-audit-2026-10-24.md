# ERP SaaS and portal audit — 24 October 2026

## Scope and release boundaries

Repository: Resto44/BIZCTRL. Baseline: 0991de96237ceeaa74cfa6bf57c3a0855defd98c.
Source review covered the active router and role guards, shared authentication/cache lifecycle, Owner financial reports, Manager dashboard, Employee and Supplier portals, Partner Wallet and Platform Owner entry/query boundaries. The existing automated suite also covers restaurant/retail POS, closing, credit, expenses, purchasing, payroll, subscriptions, RTL and reports. Supabase inspection was read-only. No historical accounting records, membership roles, subscription settings or RLS policies were modified.

This is a source/database metadata and automated regression audit, not certification that every ERP workflow is defect-free. No signed-in browser session was available for each role, so authenticated multi-role browser and RLS integration testing remain open.

## Verified defects corrected

1. **Shared account isolation:** explicit logout, remote signout, account changes and verified restaurant/branch/role/permission changes now clear the shared QueryClient. A different account is hidden immediately while verification runs. Late requests cannot restore the removed previous-account query. Same-scope revalidation preserves cache.
2. **Financial report failures:** Profit & Loss and Balance Sheet no longer use the compatibility adapter that converts failed reads to empty arrays. A failed source blocks totals and report actions with a localized retry state. Initial loading cannot render an apparent zero result.
3. **Incomplete financial datasets:** both reports now paginate tenant-filtered reads with a stable ID tie-breaker instead of fixed 500/1000/2000/5000-row limits. Any failed or malformed page rejects the entire read.
4. **Inventory overstatement:** Balance Sheet values the latest snapshot per product, branch and unit, preserving historical records. Historical snapshots are no longer summed as concurrent stock.
5. **Branch accuracy:** Balance Sheet resolves canonical branch IDs and only falls back to legacy branch text when an ID is absent. Manager scope is applied before the first render, rather than waiting for the selector effect.
6. **Supplier portal:** purchase-order reads, cache keys and shipment updates explicitly include restaurant and assigned branch as well as supplier. Voided and deleted invoices are excluded from supplier invoice totals, in addition to cancelled/rejected invoices. RLS remains authoritative.
7. **Employee announcements:** tenant/branch filters are explicit; inactive, expired and other-role announcements are excluded before the five-item limit. Response filtering also rejects malformed expiry dates.
8. **Shared pagination validation:** invalid page sizes and null/non-array results fail explicitly rather than becoming empty financial data.
9. **Repository lint:** removed unused imports from payroll, wallet/settlement and closing customization. No business behavior changed in those cleanup files.

## Verification

- Baseline: 250 suites / 1,481 tests passed.
- Added behavioral regressions for complete multi-page tenant reads, failed/malformed pages, invoice exclusion, employee announcement targeting, financial error/retry UI, latest stock valuation, conflicting legacy branch text, account switch, stale in-flight results, branch reassignment and logout.
- Release validation: 252 suites / 1,490 tests passed; npm run build exited 0; npm run lint passed.
- Typecheck is **not green**: the untouched baseline itself reports 8,491 TypeScript diagnostics, including JavaScript component-prop inference and Supabase stub signatures. The release tree reports 8,478 diagnostics after cleanup. This release does not suppress those diagnostics or claim type safety. Full typecheck remediation is a separate outstanding work item.

## Live database observations

- All 206 public ordinary tables have RLS enabled. This does not prove every policy is correct.
- Inspected policy definitions for purchase orders, announcements, customers and customer addresses. Supplier order access requires tenant/branch scope, purchase permission and linked supplier identity; update policy also requires relevant write permission.
- Security advisor: 44 tables with RLS and no policy (many RPC/private implementation tables); 185 authenticated SECURITY DEFINER notices; one anonymous-executable function notice; leaked-password protection disabled. The anonymous notice concerns `erp_guard_treasury_transfer_insert`, a **trigger-returning** function, not a demonstrated callable business RPC. Do not describe advisor warnings as proven breaches or indiscriminately revoke the deliberately authenticated RPCs.
- Performance advisor: 236 unindexed foreign-key notices, 26 RLS init-plan warnings, 101 unused-index notices, 73 multiple-permissive-policy warnings and 7 duplicate-index warnings. These are review candidates; no indiscriminate index creation/deletion or policy replacement was performed.
- Reference: https://supabase.com/docs/guides/database/database-linter
- Password-protection setting: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Outstanding work — not represented as fixed

- Run signed-in end-to-end scenarios for Owner, Manager, Employee, Supplier, Partner Wallet, Platform Owner and POS on mobile and desktop; verify real authorization failures and role transitions.
- The legacy CustomerPortal remains a separate compatibility path: profile lookup is email-based, its address writes use the old entity adapter although customer_addresses lacks updated_date, and address default changes are sequential rather than atomic. It requires a canonical supported customer identity and scoped repository replacement; no customer records were migrated during this release.
- Other compatibility-adapter consumers still need case-by-case read-failure treatment; this release replaces its use in the two financial report pages rather than changing every caller without error-state coverage.
- Balance Sheet remains a derived operational view of wallet transactions, inventory, receivables and supplier liabilities, not a complete reconciled general ledger with trial balance/opening balances and all asset/liability accounts.
- Read pagination avoids row caps but is not a transaction-consistent snapshot across concurrent writes; very large organizations need server-side bounded reporting and measured query plans.
- Reconcile existing duplicate supplier invoices before adding durable database uniqueness/idempotency constraints; no financial records were deleted.
- Review recurring expense effective periods/calendar allocation, audit versioning and legacy raw-material expense migration with actual source documents. The earlier October rent correction is preserved.
- Complete the large pre-existing typecheck backlog and the targeted advisor review; no blanket claim of ERP certification, security certification or zero remaining defects is made.


## Follow-up release — remaining portal and debt corrections

Baseline: PR #201 / 19bba682d9ffe8f1b4a093335f3487e94da8c7ae.

### Resolved in this follow-up

- The orphaned CustomerPortal page is retired. `/customer-portal` now passes the existing `viewDebts` permission guard and redirects to canonical Customer Management. The system's database membership model supports four roles (Owner, Manager, Employee, Supplier); this does not invent a new customer login role. Broken self-profile/address writes are no longer reachable. Customer/address records are untouched.
- Debt Management reads all tenant-scoped debts/payments and history pages, rather than 200 records filtered by their creator. Staff queries require the canonical assigned branch. Failed sources show retry, missing assignment shows an explicit missing-profile state, and incomplete data cannot be used as zero balances.
- Debt totals coerce numeric database strings to numbers; cancelled/voided/written-off debts are excluded from open balances. Customer collection totals no longer include supplier/liability payments. Due-today debts are not overdue. Aging boundaries are labelled 1–30 / 31–60 / 60+ days.
- Top debtors are grouped by canonical party identity, not name. Unlinked legacy entries remain separate.
- PaymentForm uses a synchronous submit guard, checks finite positive amounts and remaining balance, and isolates notification failures after the authoritative payment commits. A notification outage no longer reports a successful payment as a failed payment.
- Supabase initialization now retains the real SDK interface. Invalid initialization uses a network-disabled SDK client returning explicit configuration errors; it cannot fake a successful empty read or silently contact production using fallback credentials.
- Added native React/Radix prop/ref contracts to shared UI wrappers. Correct props remain supported and invalid variants, boolean props and incompatible refs are rejected by a dedicated compile-time contract test.
- Removed 126 shadowed translation properties. Effective translation values were compared before/after and preserved exactly; only earlier overwritten definitions were removed.

### Follow-up verification and limits

- 256 suites / 1,498 tests passed; production build exited 0; repository lint passed.
- UI type contract test passes, including expected rejection of invalid input. Run `npm run typecheck:ui`.
- Full existing `npm run typecheck` still fails: diagnostics decreased from 8,478 to 2,086. No project-wide check disable, exclude expansion, `@ts-nocheck`, or blanket `any` was introduced. Remaining diagnostics include source typing, test-library JavaScript, mutation inference, context defaults and browser/Deno configuration mismatch. They are not all proven runtime defects, and none are claimed fixed merely because a build passes.
- Live Supabase schema was read to verify debt table scope columns; no production financial rows, policies, roles, schema or balances were mutated by this follow-up.
- Authenticated multi-role browser/RLS integration testing, full general-ledger reconciliation, historical duplicate-invoice reconciliation, fixed-expense effective periods and the remaining typecheck/advisor review are still open. Retiring the legacy customer path resolves its unsafe implementation; it does not deliver a new authenticated customer self-service product.

## Runtime reference and JavaScript contract follow-up

Baseline: PR #202 / 07943463cf8b8abdae85dba79851ccbc87c111b4.

- Fixed seven unresolved runtime identifiers: dashboard API clients, financial source breakdown, inline cash-funding recovery, platform-owner MFA recovery state, sales invoice retrieval, and selected-tenant revenue rendering.
- Source drilldown aggregates numeric custom-source snapshots, excludes system tenders and explicitly non-revenue entries, preserves posted snapshots against later source configuration changes, and never adds the breakdown back into canonical sales revenue. Regression cases cover absent lookup keys and malformed legacy JSON.
- Corrected React memo inference by separating named view functions from their memo wrappers; added explicit optional defaults where the existing API already allowed an empty options object. Added monetary-input prop/ref documentation and the missing Chai type dependency. Runtime rendering and memoization remain intact.
- Aligned tenant context defaults with provider keys and callback arguments; realtime cleanup no longer returns a Promise as a React effect destructor.
- Validation: 257 suites / 1,502 tests pass; production build, lint and UI type-contract check pass. Added a separate unresolved-runtime-identifier check (`npm run typecheck:runtime`); this does not replace the full typecheck.
- Full typecheck still fails with 1,327 diagnostics, down from 2,086. No checking was disabled and no exclusions expanded. Remaining typing, authenticated multi-role end-to-end tests, financial-history reconciliation and earlier audit limitations remain open. No production database records, schema, policies or financial balances were changed in this release.

## 2026-10-25 — Customer credit and simpler cash count

- Customer credit cards now show an explicitly labelled preview while entering a sale/payment and retain the recorded balance below. Finalized credit is not previewed twice. Available credit is calculated from the same limit/balance pair.
- Owner executive dashboard now presents period credit sales separately from current receivables. Collection reduces receivables, not historical sales. Credit operations invalidate current/previous owner report queries; payment events refresh customer balances. Dashboard open balances use the same terminal-status exclusions as Debt Management.
- Cash count retains three steps (sales, cash, review). Cash-source breakdown and expected-cash equation are collapsed by default; source mismatches expand automatically. Physical count remains editable and required; funding, opening validation, approval and final review remain intact.
- Fixed localized shift names being sent to funding RPCs. Funding always uses canonical shift identifiers. An overdrawn ledger cannot be approved or described as balanced; settled owner liability no longer falls back to the original amount.
- Live root cause: the compatibility core can resolve an existing closing by branch/date/shift/cashier even when the client supplies no closing ID. The outer credit guard previously only examined explicit IDs; the same shift could therefore change credit snapshots without updating the existing receivable. Added a transaction-ending consistency assertion against the actual resolved closing and its customer principals. A mismatch now rolls back, preserving all financial records. Existing permissions and auth checks remain unchanged.
- Applied migration `closing_credit_consistency_guard`; verified its installed definition. Security advisor categories/counts remain unchanged (44 no-policy INFO, 1 anonymous-definer warning, 185 authenticated-definer warnings, password-protection warning); this is not a new security certification.
- Reconciled the specific October 24 closing against immutable version 8: credit principal 60, existing receipts 50, remaining 10. Preserved payments, cash movements and prior closing versions; appended `customer_credit_reconciliation` audit entry. Repair has snapshot/version/payment assertions and is idempotent. See `scripts/sql/reconcile-closing-credit-v8.sql`.
- A separate October 25 credit of 45 is already posted, giving this customer's currently observed open balance 55. These are observed balances, not hardcoded UI values.
- Broader historical check still identifies three mismatched closing principals (October 23: 25 vs 0; October 11: 75 vs 55; October 7: 0 vs 35). These require source-document reconciliation, especially where a receipt already exists; no historical payments were erased or invented. They are not claimed fixed.
- Validation: full suite 259 files / 1,508 tests passed; added executive credit-vs-balance test also passed in a focused rerun. Lint and unresolved-runtime-identifier checks passed. Production build passed. Signed-in browser/mobile testing and the pre-existing full typecheck backlog remain open.
