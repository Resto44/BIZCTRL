# Supplier ledger reconciliation — 2026-10-13

## Accounting contract

- Closing ledger balance = opening + eligible period invoices − recorded supplier payments, separately per recorded currency. Negative balances remain credits.
- Payment rows are the evidence for cash settlement. Invoice paid_amount is compared for reconciliation, never added as a second payment. Missing evidence is flagged rather than synthesized or written back.
- Draft, void, cancelled, rejected and explicitly pending-approval invoices do not post to the balance. Pending approval is visible as a review item. Payments referencing excluded invoices remain visible and flagged.
- Currency of a payment comes from a matching linked invoice; unlinked/mismatched payments remain in an UNKNOWN currency bucket. Display currency does not convert stored money.
- Branch UUID overrides legacy branch names. Supplier matching uses IDs. Queries require organization scope, enforce assigned branch scope, preserve RLS, paginate and propagate errors.
- Date filters carry prior movements into opening; future-dated events do not enter the as-of balance. Dates use the browser's local calendar, matching existing Treasury presets.
- Search narrows visible rows only, never changes account totals or recomputes running balances. Same-day ordering is deterministic: invoice then payment, stable record ID.
- Overdue uses positive linked-payment remainder and due date before the selected end date. It includes opening invoices still overdue at period end.

## UI and PDF

Added per-branch/supplier/currency filters, today/7 days/month/3 months/6 months/year/all/custom periods, four reconciled balance cards, opening carry-forward, detailed reconciliation notices and English/Arabic/Persian labels. Mobile statement table scrolls inside its container and retains complete descriptions. Statement rows initially render 50 with Show more; totals use all loaded rows.

Supplier detail statement/PDF now uses the same ledger model and total_amount instead of nonexistent invoice.amount. PDF is disabled for unresolved reconciliation issues. No historical invoices or payments were rewritten or deleted.

## Verification

- 20 focused tests cover partial/overpayments, historical carry, cancellation/approval, mixed/unknown currencies, numeric strings, duplicate IDs/numbers, invalid dates, canonical branch and supplier identity, data-read failure, tenant/branch query scope and search-stable balances.
- Full regression suite before the final pending-approval case: 153 files / 893 passing tests. Final focused suite: 20 passing tests.
- Production build completed; changed source files have no ESLint errors; diff whitespace check passes.
- Read-only production metadata confirmed payment rows have invoice_id but no currency column. Aggregate inspection confirmed paid_amount mismatches exist; no customer-specific records were exported. A read-only per-organization/currency linked-payment arithmetic check returned zero unbalanced groups.

## Limits

This is a read/reconciliation repair, not a repair of historical payment evidence or a replacement for atomic payment posting. Legacy payment-entry screens that directly edit invoice paid_amount need separate remediation. Reconciliation notices intentionally expose those discrepancies. No authenticated live payment was created for testing. Payment allocations across currencies and unlinked advances require verified source documents before correction. PDF layout generator is retained; this release did not perform a new physical print test. Concurrent writes during pagination can require a refresh; the browser reads are not a transactional database snapshot.
