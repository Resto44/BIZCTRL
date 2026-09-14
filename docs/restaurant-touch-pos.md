# Restaurant touchscreen POS

Entry: `/restaurant/pos`. Only restaurant/café workspaces can use it. Navigation is available in the sidebar and mobile More menu; employees with sales permission receive a POS shortcut. The workspace uses the existing cash-register module entitlement.

## First use

1. Select a branch, then **Menu & devices**. Configure the required lanes (1–100); repeating this does not duplicate lanes.
2. Create food products in Product Management and ingredient stock in Inventory. In POS setup, map each portion to a source product, an inclusive-tax price, station, and ingredient quantities in the exact inventory unit. Quarter/half/whole and paid extras use separate menu entries. Explicitly confirm any item without automatic stock deduction.
3. Choose a device, open its shift, and create an order. Touch food cards, set dine-in/takeaway/delivery and table/pickup details, then send to kitchen or confirm payment.
4. Open Kitchen & orders on the kitchen screen. Pair Customer screen using its revocable eight-hour link, never the owner's credentials. Live control shows recorded sales, unpaid orders, purchases, expenses, and device activity.

## Accounting and inventory guarantees

- Adding food to a draft does not consume stock. Sending to the kitchen consumes the recipe once; checkout consumes it only if not already submitted. Server-side prices and recipe snapshots are authoritative.
- Ingredient row locks are acquired in UUID order; insufficient/expired/cross-branch stock and changed units are rejected. Sent orders cannot be edited. Prepared cancellations require a manager and record waste without restoring raw material.
- Only confirmed payments post a uniquely referenced, immutable `daily_sales` row. Cash is net of change. Stable request IDs survive uncertain responses. Never receive a second payment while retrying an uncertain operation.
- Closing the shift checks every unpaid order and records counted/expected cash; it never posts sales again.
- Kitchen transitions are revision-checked. Unpaid orders cannot be handed over.
- Financial dashboard amounts are recorded amounts, not a bank settlement claim or an inventory valuation/profit calculation.

## Access and live updates

Private tables deny direct browser access. Narrow RPCs enforce subscription, portal, tenant, branch and role permissions. Only owners can aggregate all branches. Each shift belongs to one cashier; managers can supervise. Public broadcasts contain invalidations only; row data is re-fetched through authorization. Customer display uses an anonymous isolated client and a hashed, rotating capability, with stale totals hidden during disconnection.

## Verification

`supabase/tests/restaurant_pos_workflows.sql` runs synthetic tenants in a transaction ending in rollback: tenant/branch/anonymous isolation, server pricing and included tax, stale revisions, holds, display rotation/revocation, recipe deduction, unpaid kitchen handover denial, split-payment change, exact-once sales and stock, immutable sales, overselling, prepared waste, shift closing.

`tests/restaurantPOS.test.jsx` checks four-screen navigation, food touches, portal gating, RPC namespace, recipe validation and kitchen transitions. Existing retail cashier/display and navigation tests remain regression coverage for shared components.

## Explicit release limits

This release does not charge bank cards, provide silent printer drivers, offline transaction posting, ZATCA certification, paid-refund/partial-bill workflows, discount approval, graphical table plans or modifier groups. Printing uses the browser's receipt/PDF flow. Real printer/bank/customer hardware requires on-site acceptance. No synthetic devices, recipes or sales are seeded into an existing customer workspace. Initial setup must use that restaurant's real menu and stock.

Do not delete the operating schema to roll back a UI release once sales exist. Revert the frontend commit if necessary and retain the immutable financial records; database changes require a forward migration.
