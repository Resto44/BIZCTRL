# Retail inventory workspace

The supermarket portal uses four inventory screens: `/inventory`, `/inventory/stock`, `/inventory/operations`, `/inventory/control`. Existing restaurant routes retain their original components. Retail aliases for transfers, waste, barcode, batches and expiry open the appropriate new workspace.

## Stock and permissions

Physical stock is held per tenant, branch, warehouse and product. An immutable signed movement journal updates balances and batches atomically. Available stock excludes transfer reservations, quarantine and expired batches. Negative POS stock remains visible for reconciliation instead of preventing existing cashier transactions.

Receipts create purchase quantity records exactly once. A goods receipt does not imply a cash payment. Existing purchasing/treasury workflows remain responsible for invoices and payment. Linked PO receipts cannot exceed outstanding quantities and update partial/received status.

Transfers require owner approval, reserve stock, remove it on dispatch, and add it at the destination only after receipt. Batch identities and expiry dates survive transfers. POS sales consume lots in FEFO order. Returned customer goods are quarantined for owner inspection. Physical counts use balance versions; intervening stock movements invalidate stale counts. Adjustments, supplier returns, reorder requests and count differences require owner approval.

Warehouse writes are performed through an authenticated command RPC with tenant and branch checks. Clients cannot call private posting helpers or edit the movement journal. Branch managers may receive their incoming transfers without reading the source branch's inventory. Master product metadata is readable to authorized inventory users in their own tenant.

## Interface

English, Arabic and Persian; RTL forms; shared branch/warehouse scope; server-paged stock and document lists; SKU/barcode search; master catalog import and assignment; base-unit/carton entry; batch and expiry detail; warehouse/bin/min/max settings; CSV export with formula-safe text fields. Receipt and stock adjustments from old product/purchase dialogs use the new workspace.

The four routes share a reference-counted realtime channel and deduplicated React Query cache. Bindings are installed before subscription, with a new topic per channel lifetime. Fallback polling runs every 60 seconds. Owner tabs remain mounted without re-binding the channel.

## Validation

- Baseline and new automated suites: 459 tests passed across 88 files; the subsequent RTL/form case and targeted product regression suite also passed.
- `supabase/tests/retail_inventory_workflows.sql` uses synthetic users and tenants and rolls back all fixtures. It checks receipt retries, transfer reservation/dispatch/receipt, batch preservation, branch/tenant isolation, owner approvals, POS debit/idempotency, stale counts, reviewed PO creation, partial/over receipts, FEFO, quarantine release, inventory/catalog valuation and immutable journals.
- Real Supabase RealtimeClient and real React routes are exercised in `tests/retailInventoryNavigation.test.jsx`, including StrictMode, cached tabs, branch changes and Persian forms.
- Lint and production builds passed. The cloud browser blocked the local preview URL, so authenticated production visual verification has not been completed.

Counts are derived from the tenant's data, never the sample 10-branch/100-device design figures. Cycle counts are bounded to 500 products and 1,000 batches; stock documents to 100 lines. Export reads the current filters in pages. Existing POS devices must use the integrated transaction RPC to produce inventory movements; unmapped item exceptions appear on the overview.
