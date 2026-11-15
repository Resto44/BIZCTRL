# Launch database workflow verification — 2026-11-15

Executed against the hosted database in transactions ending in ROLLBACK. No synthetic financial records, attendance, queued notifications, or users persisted. These are database integration results, not browser/device acceptance or real payment evidence.

| SQL suite | Result | Coverage |
| --- | --- | --- |
| customer_self_service_portal.sql | PASS | Verified invitations, wrong-email rejection, customer isolation, debt/payment/order views, revoked invitations |
| wallet_owner_operations.sql | PASS | Pending transfers, approval authorization, double-entry balances, idempotency, currency/frozen/overspend checks |
| retail_cashier_workflows.sql | PASS | Reservations, oversell prevention, inclusive tax, split payments, refunds, immutable receipts, display token isolation |
| restaurant_pos_workflows.sql | PASS | Variants, recipe consumption at kitchen send, idempotent checkout, cash drawer, tenant isolation, cancellation waste, public display allowlist |
| retail_inventory_workflows.sql | PASS after fix | Transfers, stock counts, POS stock debit, stale-count rejection, supplier validation, partial/over receipts, FEFO, quarantine, immutable journal |
| attendanceShiftInstances.rollback.sql | PASS | Shift history, owner codes, outside GPS rejection, check-in/out, replay prevention |
| attendanceLocationHistory.rollback.sql | PASS | Consent, owner isolation, history, stale-location hiding, checkout cleanup |
| attendanceLivePresence.rollback.sql | PASS | Consent, live states, scope isolation, checkout cleanup |
| attendanceScheduledCodes.rollback.sql | PASS after fixture correction | Six-digit codes, 30-minute expiry, invalid/expired/replayed code rejection, scheduler idempotency |
| attendancePush.rollback.sql | PASS | Vacation exclusion, deduplicated missing/entry/exit alerts, stale suppression, approved-owner device fanout, service authorization |

## Runtime defect corrected

Retail reorder approval passed products.id, while the supplier guard only recognized products.product_id. Valid supplier-assigned products were rejected. The guard now resolves either reference inside the tenant, prioritizes canonical UUID identity in collisions, and then checks supplier assignment and active status. Supplier branch/tenant validation and historical-line handling are retained. No table data or grants were broadened.

Regression SQL verifies an unassigned product is rejected, its assigned canonical reference succeeds, its legacy code succeeds, and a colliding legacy code cannot bypass canonical supplier assignment. The complete inventory workflow passed after the migration was applied.

## Test fixture corrections

The kitchen-following customer display must hide drafts until kitchen send; the restaurant suite now checks both sides of that transition. Scheduled attendance tests create their own daily attendance fixture instead of requiring a real employee's attendance for today. Attendance push moves only its transaction-local vacation fixture off today's date instead of deleting it.

## Remaining acceptance boundaries

- Secure signed-in role-by-role browser acceptance, physical mobile layout/GPS/push delivery, and email inbox delivery are not certified by SQL tests.
- No real subscription payment, renewal, refund, or charge was executed. The configured live gateway must not receive fabricated test transactions.
- Actual recipe quantities and tracked ingredients require business configuration; tests use synthetic recipes and cannot establish real production consumption correctness.
- Post-migration database health advisors reported no findings. Existing security advisory categories remain unchanged: private tables without direct-access policies, callable security-definer functions, and leaked-password protection configuration. These require their own scoped review; no blanket security clearance is claimed.
