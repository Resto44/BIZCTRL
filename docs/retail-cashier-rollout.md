# Retail cashier checkout

## Entry and operation

- Supermarket / retail portal only: `/retail/cashier`. Open from POS Control, Device Account or the retail navigation menu. Choose the branch and independent POS device.
- Cashier membership requires `uploadSales` and `viewSales` in its assigned branch. Only the assigned cashier or an authorized owner/manager can operate an active lane.
- Open a shift with actual opening cash. A USB/Bluetooth HID scanner types into the focused scan field and sends Enter. The camera/photo/manual scanner is also available.
- Sell shows branch-assigned, active, stocked, sellable master products. Quantity supports three decimals; serial-tracked items are blocked until a serial-capture workflow is implemented.
- Scans reserve stock, not a completed sale. Cancel releases reservations; held carts reserve for 30 minutes. Open carts expire after 15 minutes without an active-page heartbeat. A once-per-minute cron releases expired reservations. Closing a shift cancels unpaid carts and revokes its customer display.
- All quantities, canonical branch prices, discounts and tax are checked on the server. A confirmed checkout writes to the existing append-only POS ledger, payments and stock movement in the same transaction. Sorted stock locks prevent two cashiers selling the same available stock.
- Cash, externally confirmed Mada/card/Apple Pay, and cash + Mada split tender are supported. Cash change is removed from recorded net cash. The web app does **not** charge cards or perform bank refunds.
- Full receipt refunds require an owner/manager, a reason and confirmation that money was returned. Stock is returned into quarantine, not immediately made sellable. Partial returns are not implemented in this release.
- Receipts preserve original product descriptions and amounts. Print / Save PDF uses the browser print dialog, with 80 mm and A4 layouts. This is a sales receipt, not a claim of certified ZATCA e-invoicing. Tax registration, clearance/reporting and fiscal QR integration require a separate compliance integration.

## Customer display

Pair from the active cashier, then open the generated link on the customer-facing screen. The 256-bit token is in the URL fragment, stored hashed in the database, scoped to one POS and expires in 8 hours. Pairing again invalidates the previous link. Closing the shift or Disconnect display revokes it.

The display uses a separate anonymous Supabase client without persisted owner credentials. Only an explicit sale-facing allowlist is returned: products, prices, quantities, totals and branch/POS labels. No cost, profit, cashier user IDs, payment references or customer identity is returned. Realtime broadcasts contain **only invalidation hints**, not business data; every refresh passes server authorization. Polling is a 5-second fallback. A total older than 12 seconds is hidden until refreshed.

## Reliability and privileges

- Scanner mutations run in a serial queue against the latest returned cart revision. Late background reads cannot overwrite a newer mutation.
- Every mutation has a stable request UUID. An interrupted response is persisted in the browser session and blocks further sales until the same action is checked/retried. Checkout also has a cart-level idempotency key and immutable receipt, preventing repeated stock deduction even with a different request UUID.
- The trusted legacy `erp_retail_pos_record_transaction` and `erp_retail_pos_open_shift` functions no longer grant direct execution to `authenticated`. Browser callers use `erp_retail_cashier_command`; internal definer code and configured backend service execution remain supported.
- Private cart tables have RLS enabled and **no direct table grants or permissive policies**. The advisor's informational [RLS enabled / no policy notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) is intentional deny-by-default for these tables. Public wrappers are invoker functions; narrowly granted private entrypoints perform explicit authentication, portal, tenant, branch, role and shift checks.
- Hardware lock/unlock/sync commands are consumed by the active web cashier. Hardware restart/support commands are marked failed without claiming a hardware agent exists. Scanner/printer connectivity indicators are not fabricated.
- Offline sale posting, integrated card charging, silent thermal printing, cash drawer drivers, serial capture and fiscal certification are not part of this release.

## Verification (2026-09-08)

- Cashier workflow SQL passed under authenticated/anonymous roles with synthetic tenants and rollback: stock reservation, cross-lane oversell rejection, tax, canonical pricing, revisions, hold/resume, split tender, exactly-once posting, receipt preservation, refund quarantine, tenant/branch isolation, display capability rotation/revocation, shift cleanup and expiration.
- Existing inventory workflow SQL passed after moving its legacy trusted-ledger fixture calls to the backend role. No production customer, product or inventory rows were used as test fixtures.
- 83 targeted JavaScript/React tests passed, including real SDK four-page cached navigation, barcode image decoding/camera lifecycle, scan queue, interrupted-payment retry, stale response protection, customer display isolation and offline stale-total removal.
- Lint and Vite production build passed. Local interactive browser verification was blocked by the environment (`ERR_BLOCKED_BY_CLIENT`); local Vite also reported `uv_interface_addresses`. Hardware and an authenticated production sale require a separate device acceptance test.

Acceptance on a configured lane: open shift → scan a real stocked product → verify customer screen → confirm actual payment → print receipt → verify POS ledger and stock → close shift/count cash. Do not run a real financial transaction purely as a test without the operator's approval.
