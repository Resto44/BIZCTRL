# Restaurant touchscreen POS

Entry: `/restaurant/pos`. Only restaurant/café workspaces can use it. Navigation is available in the sidebar and mobile More menu; employees with sales permission receive a POS shortcut. The workspace uses the existing cash-register module entitlement.

## First use

1. Select a branch, then **Menu & devices**. Configure the required lanes (1–100); repeating this does not duplicate lanes.
2. Create food products in Product Management and ingredient stock in Inventory. In POS setup, map each portion to a source product, an inclusive-tax price, station, and ingredient quantities in the exact inventory unit. Quarter/half/whole and paid extras use separate menu entries. Explicitly confirm any item without automatic stock deduction.
3. Choose a device, open its shift, and create an order. Touch food cards, set dine-in/takeaway/delivery and table/pickup details, then send to kitchen or confirm payment.
4. Open Kitchen & orders on the kitchen screen. Pair Customer screen using its revocable eight-hour link, never the owner's credentials. Live control shows recorded sales, unpaid orders, purchases, expenses, and device activity.


## Dedicated Kitchen TV / KDS portal (November 2026)

- Direct signed-in URL: `/restaurant/kitchen`. It works as an independent kitchen screen, not a shared cashier account.
- Owner/manager: open **Restaurant POS → Kitchen Display · TV**, choose an authorized branch, and use **TV mode** on a browser-connected television. An optional sound toggle is user-activated; browser autoplay restrictions apply.
- Kitchen employee: invite or use a scoped **Employee** login with the Owner-assigned `viewOrders` permission (no `viewSales`, `uploadSales` or wallet permissions are required). Log in with that staff account on the TV. Employee branch selection is limited to their approved assigned branch; the server validates tenant, membership, permission and branch independently of the URL.
- Cashier: open a shift, create an order, add products, and select **Send to kitchen**. The existing POS command is authoritative and deducts ingredients only once; the new KDS does not create sales or change inventory.
- Kitchen: **New → Preparing → Ready**; once payment is finalized the order can be **Handed over**. Both legacy POS Kitchen tab and KDS call the same revision-checked RPC, preventing conflicting state changes and unpaid handover.
- Updates: existing `restaurant-pos:<tenant>` Realtime topic contains only a change signal, with a 5-second authorized RPC fallback, refetch on reconnect and visibility return, and visible connection/error states. A stale/disconnected KDS disables mutations. Orders from earlier days remain in the board until served/cancelled.
- TV: high-contrast cards, quantity/food/table/delivery/notes, station filtering, elapsed-time warning after 10 minutes and late indicator after 20 minutes. Multistation orders cannot be advanced from a single-station filtered view; select **All stations** to advance the whole order.
- The private board returns only preparation details, no prices, receipts, stock recipes, cash balances or customer contact details. Only 200 oldest active orders appear at once; overflow is shown explicitly, not silently discarded. All active orders remain persisted in the existing POS tables.
- Deployment order: add read-only KDS RPC migration, test the existing POS and permissions, deploy frontend, and verify real cashier → TV → paid handover on the actual restaurant network. This is NOT proof of real television/audio reliability without physical-device acceptance.

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

## Product master from the touchscreen

Owners/managers with `can_manage` can open **Master / Add product** directly above the food cards, or from the standard POS header. The selected branch stays in scope and the active cart is retained. The dialog provides single-food creation, sizes/custom options, bulk Excel/CSV import with preview, an Excel template, and full Excel export (including inactive foods). Existing server authorization is used for catalog reads and every write.

Exports retain menu IDs in `food_id`; reimport accepts these IDs only from the selected branch's authorized catalog, rejects repeated IDs, and updates existing foods. Do not remove `food_id` when updating an export. Custom option names/order and recipes round-trip; fixed serving keys also retain their original representation, IDs, prices and recipes. Import remains limited to 500 rows per file; keep each complete food group together. Old import templates without the added ID/option-name columns remain supported.

## Category image links

Open **Master / Add product → POS Sales Category Management** to create or edit a sales category. Its optional HTTPS image URL supports a preview and explicit removal. Artwork appears on desktop category buttons and the mobile category picker; missing or failed images fall back to the category icon. Saving refreshes the POS/catalog queries. Category image writes retain the existing manager and branch authorization. Older clients that omit image_url preserve the saved image.

Verification: category form save/removal/invalid URL and desktop/mobile rendering tests; `supabase/tests/restaurant_category_images.sql` tests save, preservation, removal, catalog/workspace projection, invalid links and cross-branch/anonymous rejection with synthetic fixtures inside a rollback transaction.
