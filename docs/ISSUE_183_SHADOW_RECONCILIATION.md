# Issue #183 — canonical ERP KPI shadow reconciliation (read-only stage)

Status: **isolated draft implementation, NOT activated; NO database migration, posting, merge or deployment.**

## Implemented

- `src/lib/erpCanonicalShadowReconciliation.js`: pure, synchronous scope enforcement, baseline comparison, classifications, financial provenance, minor-unit totals and advisory per-KPI canary gate.
- `src/lib/erpShadowReadOnlyReader.js`: opt-in SELECT-only, paginated tenant/authorized-branch evidence reader. It has no RPC, writes, triggers, subscriptions, or automatic invocation.
- `tests/erpCanonicalShadowReconciliation.test.js`: synthetic branch/shift/tenant/source test fixtures; canary approval and unknown-vs-zero coverage.
- `CANONICAL_KPI_DEFAULT_ENABLED = false` and `releaseFlagEnabled: false` are deliberately non-operational. No feature-flag service is wired to the Owner Dashboard.

## Existing tables inspected and intended accounting roles

| Ledger | Reconciliation basis |
| --- | --- |
| `daily_sales`, `sales_invoices`, `sales_closing_source_snapshots` | Finalized posted revenue and explanatory tender/source snapshots; never add invoices or snapshots on top of Closing revenue |
| `supplier_invoices`, `supplier_payments` | Approved purchase receipts, AP and payments: not immediate inventory COGS |
| `inventory_transactions` | Documented recipe consumption with source reference + unit valuation for COGS candidates; purchase, waste and stock transfers excluded from sales COGS |
| `expenses`, `expense_categories` | Approved/posted OpEx; fixed allocation must be certified before Verified |
| `payroll_runs` | Finalized gross salary accrual less deductions, **before advances**; advances are not an expense |
| `cash_movements`, `sales_closing_cash_reconciliations`, `sales_closing_cash_ledger_snapshots` | Opening + one cash-sale bucket + posted in − out; physical count difference |
| `wallet_transactions`, `treasury_accounts`, `settlement_records` | Balance-sheet transfers, paired at whole-tenant scope, not revenue |
| `debt_records`, `debt_payments` | AR/AP as-of balances and settlements, not repeat revenue |
| `sales_closing_audit_log`, `sales_closing_correction_requests` | Append-only correction lineage; ambiguous historical versions block verification |

**Limit:** The pure engine currently consumes scoped arrays provided by a caller, not an audited server-side immutable posting journal. This PR does **not** claim that canonical COGS, payroll, refunds or treasury are certified from production. The reader emits all `completeness[*] = false` because eight independently paginated SELECTs cannot prove a transactionally consistent snapshot. A future independently audited snapshot producer must provide one consistent watermark and explicit source coverage certificates.

## Usage and non-usage

```js
import { readCanonicalShadowEvidence } from './erpShadowReadOnlyReader.js';
import { reconcileCanonicalShadow, assessCanonicalRelease } from './erpCanonicalShadowReconciliation.js';

// Explicit internal/audit-only invocation with an authenticated, RLS-scoped client:
const evidence = await readCanonicalShadowEvidence({
  db: supabase,
  scope: {
    restaurantId, branchId, authorizedBranchIds: [branchId],
    from: '2026-10-01', to: '2026-10-23',
    legacyBranchMap: { 'approved-branch-key': branchId },
  },
});
const result = reconcileCanonicalShadow({
  scope: {
    restaurantId, branchId, authorizedBranchIds: [branchId],
    from: '2026-10-01', to: '2026-10-23',
    legacyBranchMap: { 'approved-branch-key': branchId },
  },
  sources: evidence.sources,
  completeness: evidence.completeness, // intentionally all false
});
// result.canPublishCanonicalKpis === false
```

No ERP KPI consumer imports the module at runtime. Never wire it to a payment or sales write path. Never turn on the old automatic POS feed (`UnifiedSalesClosing` deliberately disables it while shift/cashier identity is insufficient).

### Scoping and dedupe

- `restaurant_id` plus optional independently attested `tenant_id` are required.
- `branch_id` must be authorized. Legacy branch strings require a unique approved `legacyBranchMap`. No fallback to "All Branches" for unknown rows.
- Use **business date**, not `created_at`, for posting periods. Timestamp-only sources are not certified until audited time-zone mapping.
- Shift/sales/cashier identity must be exact on revenue and cash movements. Period costs without a shift cannot be placed in a particular shift's Verified P&L.
- Repeated same-ID source rows are counted once; conflicting payloads or missing IDs block verification. This is not yet a full POS/offline event-identity map.
- Corrected/correction-requested Closing records and unaudited legacy `locked` snapshots block revenue verification. Posted `finalized` values and manually audited `locked` records are available for matching.
- The standalone source breakdown is **not** extra revenue. Cash handover, owner funding, receivable collection, supplier payment and wallet transfer are **not** incremental sales.
- Treasury paired-transfer diagnostics need whole-tenant visibility, not a single branch slice.

### Provenance and estimated treatment

- `VERIFIED` requires independently attested, complete sources and policy certification.
- `ESTIMATED` only represents a computable observation (for example, recorded consumption × observed unit cost without a completed costing audit).
- `UNAVAILABLE` means no complete evidence or invalid scope: no fake verified zero.
- Legacy purchase-based profit cannot be relabelled as canonical inventory-COGS Gross Profit. Comparison uses `BASIS_REVIEW_REQUIRED`, with a signed review required for any canary.
- Real physical cash variance may legitimately be nonzero and must be displayed rather than corrected as income.

## Release and execution gates

The advisory `assessCanonicalRelease` method has **no write access** and only evaluates eligibility for a manually reviewed, KPI/tenant/branch-specific canary. Conditions:

1. Relevant source rows have zero unresolved scope, duplicate, completeness and posting errors.
2. The candidate KPI is `VERIFIED` in an audited source snapshot, with an accepted legacy comparison or explicit basis-change approval.
3. All relevant automated tests and CI pass; dashboard/PDF parity is checked on the **same** fixed snapshot.
4. At least 14 consecutive business days of shadow evidence including shift/day/period boundaries and each authorized branch.
5. Finance, technical and owner approvals are explicit. Canary and rollback are **manual** actions outside this change.

## Known blockers before canonical rollout

- No transactionally consistent, immutable snapshot RPC/view with a certified cutoff across `daily_sales`, POS, expenses, inventory, payroll, treasury, debt and cash.
- No verified full POS/offline dedup by stable cross-channel event IDs, refund/reversal/version lineage and backdated corrections.
- Inventory recipe consumption lacks universal cost valuation/provenance and unit-conversion reconciliation; purchase receipt must remain outside recognized COGS.
- Shift-scoped expense, payroll and inventory posting identities are not guaranteed by legacy tables.
- Single-branch treasury reads cannot see both ends of an owner/branch transfer.
- No 14-day audited per-branch evidence, signed account review or production E2E cashiers/closing test in this PR.

**Safe state remains**: default flag OFF; no main-branch financial query replacement; no backfill or schema migration; no automatic writes, corrections, merges or deployments. This issue is NOT resolved until a separately reviewed reconciliation and canary PR pass all gates.
