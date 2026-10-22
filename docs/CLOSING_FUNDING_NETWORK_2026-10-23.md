# Closing funding and Network Management

Cash sales remain gross sales. Closing Cash remains the physical count after payments. Expected drawer cash is opening + cash sales + posted cash receipts - posted cash payments. A purchase/expense accounting total alone does not create a funding transfer. Card sales never become drawer cash.

The Closing page now calculates two funding amounts: the minimum to cover a negative expected balance, and the amount that would reconcile to the entered physical count. Both are proposals. The owner chooses the actual source, amount and receipt reference, then confirms real receipt. No live money is posted on page load or solely because a deficit exists.

The atomic `erp_fund_sales_closing_drawer` RPC:
- Authorizes an owner in the tenant/branch and validates the cashier or authenticated owner operator.
- Posts new external owner cash through the existing contribution API, or debits an existing owner treasury account and credits branch cash through the existing treasury API.
- Records exactly one physical receipt scoped to branch, date, shift and cashier. It uses the Closing scope lock, immutable request payloads, and replay checks.
- Rejects insufficient treasury balance, missing receipt confirmation, currency mismatch, unavailable network settlement, and finalized periods. Existing historical financial records are not rewritten.
- Treasury transfers use the existing API's Riyadh current business date; backdated treasury funding requires a separately reviewed correction. Owner contributions retain the existing register date/period restrictions.

A NULL-sensitive predicate in `erp_sales_closing_expected_cash` previously discarded standalone owner injections. It now excludes only receipts explicitly linked to the current closing's shortage settlement, matching the browser.

Network selection loads active Network Management accounts from the current tenant and canonical branch, with pagination and error handling. A single eligible account is selected automatically; multiple accounts require a choice. Card rows retain their account IDs and labels. A database trigger rejects invalid, inactive or cross-branch network accounts and invalid amounts on changed/new entries. Cash-only shifts remain supported without a network account. This loads the account catalogue automatically; it does not invent terminal transaction totals or turn on the unscoped automatic POS feed.

Validation: 1,384 Vitest tests passed; production build passed. A synthetic PostgreSQL/PGlite database compiled the actual existing owner/treasury functions with the new migration and checked owner receipt, idempotent retry, payload conflict, owner permission, cashier/shift isolation, NULL-document receipt inclusion, treasury debit/credit, insufficient-balance rollback, closed periods, network validation and denied anonymous execution. Supporting cash-register helpers and posting triggers were fixture implementations, so this is not a live end-to-end funds transfer test. No customer financial entries were created for testing.
