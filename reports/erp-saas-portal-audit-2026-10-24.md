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
