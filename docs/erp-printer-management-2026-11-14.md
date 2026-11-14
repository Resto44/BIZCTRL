# BizCTRL ERP Printer Management — controlled rollout (14 Nov 2026)

## Scope and honest operational boundary

The central /printer-management page is a branch-scoped printer routing registry and auditable browser print queue, NOT a hardware driver or spooler. Configuring a printer does not connect USB, Bluetooth, LAN, or Wi-Fi hardware. The browser print dialog must be explicitly accepted by a person. A popup being shown does not prove paper was printed.

### Supported queue sources now
- Restaurant POS kitchen ticket after the canonical order is sent to kitchen (submitted_at), with item quantities and preparation notes, but no prices/customer contact.
- Restaurant POS cashier receipt snapshots after canonical checkout (paid_at plus immutable receipt data).
- Automatic queue creation for an active configured destination, not automatic physical printing. One job per destination/source/document type; printing cannot create another sale.
- Authorization via approved ERP membership, tenant and branch, with separate kitchen viewOrders and cashier viewSales scopes. Owner alone can configure printers.
- Status Pending → Dialog opened → Operator confirms paper; Failed/Retry. This is NOT a fiscal receipt, payment, or hardware proof.
- Supported browser-print templates: 58mm, 80mm and A4; the original retail/restaurant cashier browser receipt remains available.

### Document presets only (not yet automatically queued)
Sales invoices, purchase invoices, supplier documents, customer statements, financial reports. Existing print/PDF actions remain untouched. Do not claim every source is now hooked to the automatic print queue. Each source needs a canonical finalized record, permissions, immutable snapshot, and idempotent job creation.

### Hardware automation requirements
Quiet, automatic kitchen printing needs an authenticated local print agent or managed kiosk per site, trusted pairing, real hardware selection, durable receipt acknowledgement, offline spool and retry. No local hardware agent is deployed in this release. Remote Vercel servers cannot directly print to arbitrary LAN/USB devices.

## Owner workflow
1. Owner → Settings → Printer Management → choose branch → add kitchen-ticket or cashier-receipt route → choose 58mm, 80mm, or A4 and an optional exact station.
2. Test print generates only sample text. It creates no financial transaction or inventory movement.
3. Use normal business POS flow. A kitchen queue job appears when an order is sent; a cashier receipt job appears after payment with the authoritative receipt.
4. Click Open print dialog, choose the actual physical printer, inspect the output, and only then click Operator confirms paper received.
5. If popup, printer, paper or connection fails, use Failed/Retry. Never assume opened means printed.
6. Existing receipts, customer credit, cash, stock and orders are not changed by printer configuration.

## Before enabling operational printing
- Verify SQL dry-run and RLS, revoked table grants and branch-level permissions.
- Run GitHub CI, Vercel Preview, production build.
- Conduct on-site cashier + kitchen paper test in each branch with the configured actual printer, without fabricating financial transactions.
- A web preview or schema test does not verify physical printer delivery.
