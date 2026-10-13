# Unified supplier workspace

The supplier detail page is now the operational workspace: canonical purchase-invoice creation/editing of drafts, purchase-order creation/editing of drafts, invoice-linked payment posting, ledger reconciliation, order records, contract terms, invoice-item price history and statement PDF stay on the same page. Supplier identity is fixed for forms opened here. The Accounts Payable tab selects a supplier instead of exposing the legacy direct paid_amount editors.

Removed the old cross-supplier inventory banner and automatic low-stock PO writer: it mixed branch inventory and used nonexistent PO columns. Order creation now uses verified branch UUID and expected_date fields. Order totals are no longer described as actual spend. Order lists are tenant/supplier scoped and paginated; related reads fail visibly instead of showing false zero summaries.

The ledger can be embedded with a fixed supplier, open invoice/payment actions and show reconciliation details without navigation. Contract changes invalidate the shared account query. Invoice prices derive from this supplier's invoice items, not unrelated purchases across the organization.

## Atomic payment contract

New `post_supplier_invoice_payment` RPC is SECURITY INVOKER, empty search_path, authenticated-only, and explicitly requires createPurchases. Existing RLS remains effective. It locks the invoice, rejects unapproved/malformed/overpaid/unreconciled records, inserts one payment and updates invoice plus linked debt in one transaction. Existing payment trigger creates the canonical cash movement. It does not synthesize another wallet debit. Payment UUID is the idempotency key, and replay checks require the same invoice/amount/date/method/notes.

The standalone payment form retains the request payload in sessionStorage across failed retries and freezes submitted inputs after ambiguous failures. Explicit transaction rejection unlocks correction. New invoices created inside this supplier workspace use the same atomic payment API with stable per-payment IDs during the form session. Other procurement entry points retain their existing posting path pending a separate migration; this release does not claim global financial posting consolidation.

## Verification

- 154 test files / 897 tests passed, including workspace supplier binding, same-page forms, RPC error propagation and stable retry payload tests.
- Production build, source ESLint and diff whitespace checks passed.
- Authenticated owner database test posted a small payment and repeated the identical request: exactly one payment and one invoice balance increment. Changed replay payload rejected. The transaction was rolled back; zero test payment records remain.
- A first fixture with an inaccessible/expired scope was correctly denied; a fixture with approved owner membership and active subscription passed. No scope/access rule was loosened.
- Unauthenticated request rejected. Metadata confirmed SECURITY INVOKER, empty search_path, anon EXECUTE false and authenticated EXECUTE true. Security advisors do not name the new RPC; existing project findings remain outside this change.

## Limits

No physical iPhone or live browser payment was performed. Historical mismatches remain visible and require evidence-based reconciliation; no historical invoice/payment was modified. Receipt/stock posting and posted-invoice reversals are not newly implemented here. Supplier workspace supports the existing canonical invoice flow; purchase-order draft editing is retained. Form state idempotency on new-invoice creation itself remains the pre-existing submission-recovery behavior.
