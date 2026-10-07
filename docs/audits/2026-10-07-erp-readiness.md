# ERP readiness audit — 2026-10-07

Status: verified improvements, not an unconditional production-readiness certification.

## Fixed in this change

Branch-funded supplier purchases no longer reduce the amount held by the owner. Owner supplier payments remain owner expenses. Settlement aggregation converts numeric strings to numbers, excludes unrelated transactions from settlement history, and preserves negative balances in charts. Historical financial rows are unchanged.

## Verification executed

- Full Vitest suite: 118 files, 672 tests passed.
- Production Vite build: passed.
- Database transaction tests below ran against the deployed schema with disposable synthetic tenants and ROLLBACK. No actual customer transactions were edited.

| Suite | Result | Coverage |
|---|---|---|
| portal_registration_and_access.sql | Passed | Ten business types; owner/manager/employee/supplier registration and activation, scope isolation and anonymous denial |
| restaurant_pos_workflows.sql | Passed | Menu/category separation, recipes, prices/tax, kitchen, split checkout, retry safety, stock, branch isolation |
| retail_cashier_workflows.sql | Passed | Reservations, oversell prevention, refunds, immutable receipts, shift closure, remote locking and tenant isolation |
| retail_inventory_workflows.sql | Passed | Transfers, manager receipt, owner variance approval, valuation, partial PO receipts, FEFO, quarantine, immutable journal |
| customer_credit_actions.sql | Passed | Credit closing, cash/card repayments, duplicate prevention, overpayment denial, scoped reports, no repayment revenue |
| owner_cash_injection_posting.sql | Passed | Create/update/delete contribution cash effects; no sales revenue |

English, Arabic and Persian settlement warning rendering is covered by tests. These are not physical iPhone or complete browser portal tests.

## Remaining findings and release limitations

1. Read-only reconciliation found seven supplier invoices whose paid amount exceeds their total. Establish provenance and match invoices, payments and reversals before correction. No automatic write-off or deletion performed.
2. Fifty-two invoice-linked supplier payments have missing scope fields: 48 lack restaurant and branch IDs; four lack branch IDs. No non-null mismatched restaurant IDs were found in that diagnostic. A reviewed backfill is still needed.
3. Procurement payment posting is a multi-request client workflow. Invoice/debt updates and treasury insertion do not consistently check returned errors. Atomic, concurrency-safe and idempotent server-side posting needs a dedicated fix and regression tests before financial readiness can be certified.
4. Reports contain 2,000-row limits and some error-to-empty fallbacks. Large-tenant completeness and explicit failure handling remain to be addressed.
5. The legacy verify-erp-audit-regression.cjs script fails an obsolete exact-source-string assertion for Reports. Inspection confirms current Reports queries combine restaurant_id with the shared authorized branch scope. The old script was not weakened to make it pass; its remaining checks are not counted as verified.
6. Security advisor reports deny-all tables without policies (informational), authenticated SECURITY DEFINER functions and leaked-password protection warnings. Privileged functions require individual authorization review; no blanket permissions were opened.
7. Prior localization scan identified 1,133 candidate literals in 162 files, not 1,133 confirmed translation bugs. Complete language coverage still needs contextual review.
8. Physical iPhone keyboard/viewport behavior, push delivery/deep links and every portal's browser workflows have not been reverified in this audit.

Do not represent this report as certification of every ERP module, financial reconciliation, tax compliance or all-device readiness.
