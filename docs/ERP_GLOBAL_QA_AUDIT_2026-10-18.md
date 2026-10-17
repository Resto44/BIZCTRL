# BizCTRL ERP — Global Quality Audit (2026-10-18)

**Status: Initial read-only assessment, not ERP certification.** No historical financial record was modified. This document distinguishes findings from untested behavior.

## Verified live database findings

| Area | Scope | Observed |
|---|---:|---|
| Posted sales invoices | 136 | 6 saved source totals disagree with posted total (>0.01); sample dates July–August 2026 |
| Supplier invoices | 146 | 7 overpaid invoices; 3 missing restaurant ownership UUID |
| Daily sales | 115 | 33 rows lack branch UUID; all retain old textual branch names; none in past 30 days |
| Branch references | 4 operational tables | 0 orphan nonnull branch UUIDs |
| Public RLS | 189 public tables | All 189 RLS enabled; 558 policies. This does not demonstrate every permission is safe. |

## Phase 1 changes

- Platform Owner + MFA protected read-only ERP Integrity snapshot. Shows counts, mismatch classes and status without revealing customer names or automatically updating amounts.
- Supplier payables summary no longer nets one invoice's overpayment against another invoice's outstanding debt. Overpayments are surfaced separately for reconciliation.
- Regression tests for currency cents, paid/partial/cancelled, verification guardrails, and trilingual phone view.

## Unfinished validation matrix

### P0 — Data and security
- Reconcile the 6 historical sales-source differences against authoritative finalized sales closing.
- Review the 7 supplier overpayments for advance, refund, duplicate payment or mistake without silently altering payment.
- Establish provenance of 3 unscoped supplier invoices before tenant assignment.
- Test real tenant-separated roles (owner/manager/cashier/supplier) under authenticated integration tests.
- Validate sensitive functions, storage policies, tenant scoping and MFA.

### P1 — Daily operations
- Restaurant/retail POS: item scan, checkout, retry/idempotency, cash/network/credit, refunds and shift closures.
- Sales, purchases, supplier ledger, treasury owner-to-sponsor transfers, branch funding and settlement; all reconciliation balances and authorization boundaries.
- Inventory receipt/consumption/transfer/waste, payroll PIN/QR check-in, customer credit, VAT, subscription billing and revenue.
- Mobile Safari/Windows touch interactions, overlays, horizontal scroll and accessibility.

### P1 — Documents, i18n and usability
- PDF generated under real record samples in EN/AR/FA, with Arabic/Persian bold fonts, long right-to-left names, printing, download/share.
- AR/FA/EN end-to-end translation sweep including notification templates.
- Performance/paging checks with large catalogs and multi-branch inputs.

**Release rule:** No destructive corrections to production finance or historical branch identity based on aggregate counts. Require confirmed source-of-truth mapping, test coverage, rollback strategy, and explicit tenant authorization.
