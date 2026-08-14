# Imported ERP Module Inventory and Preservation Verification

The subscription upgrade was integrated into the selected RestoCTRL ERP source without replacing its operational module registry. The authoritative route inventory remains in `src/App.jsx`; subscription controls were added around the application shell and selected plan-gated modules rather than rewriting the operational pages.

| Operational area | Preserved modules and routes | Subscription integration outcome |
| --- | --- | --- |
| Owner and dashboard operations | Owner command center, dashboard, executive dashboard, branch command center, cash register | Existing routes remain registered; global subscription access blocks non-entitled organizations before module rendering. |
| Sales and procurement | Sales, invoices, purchases, purchase orders, procurement dashboard, supplier ledger, suppliers | Existing role guards and tenant data flow remain intact; canonical subscription access applies at the backend scope. |
| Inventory and retail | Products, product management, inventory, transfers, waste, forecasting, barcode, SKU, variants, batch, expiry, serials | Existing routes remain registered; capacity limits and inventory RLS controls are retained. |
| People and payroll | Employees, employee control, attendance, payroll, staff upload, invitations | Existing routes remain registered; employee and user capacity triggers enforce plan limits server-side. |
| Finance | Treasury, sponsor treasury, debts, network management | Existing routes remain registered; network management is additionally guarded by the Enterprise feature policy. |
| Reports and analytics | Reports, sales dashboard, profit and loss, cash flow, Oracle analytics, balance sheet, branch analytics, CEO dashboard, price optimization, scheduled reports, BI center | Existing routes remain registered; advanced and scheduled modules have canonical plan feature guards and database policies where their tenant tables exist. |
| Customer, drivers, and engagement | Customers, loyalty, promotions, driver management, alerts, notification center, tasks | Existing routes remain registered; driver management has both an application feature guard and restrictive database policy. |
| Administration | Settings, brand, restaurants, branches, roles, approvals, sales sources, Telegram, support, Super Admin | Existing routes remain registered; organization creation triggers canonical trial provisioning and billing is isolated to the dedicated subscription page. |
| Subscription controls | Billing, landing pricing, global trial banner, paywall, feature guard | Replaced legacy client-controlled billing behavior with canonical server-derived subscription state, usage, permissions, payment history, and owner-only TEST MODE actions. |

## Verification Method

The source production build completed after the subscription integration. Existing operational routes remain in the `SubscribedRoutes` registry, and only selected premium routes are wrapped with `FeatureRouteGuard`; the wrapper does not remove or redirect the underlying route implementation. The database retains the canonical organization scope and enforces subscription status, capacity, metered usage, and selected premium-feature policies independently of the browser.

> A plan guard is a navigation aid, not the authorization boundary. Backend RLS policies, subscription snapshot checks, capacity triggers, and metering procedures remain authoritative.
