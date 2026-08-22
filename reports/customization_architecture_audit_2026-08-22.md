# BizCTRL Workspace Customization Architecture Audit

## Scope and conclusion

The production application is a single Vite/React ERP backed by one Supabase project. A customization layer can be added safely without rebuilding the ERP, duplicating modules, or touching the canonical subscription and Paddle paths. The implementation must be additive: absent configuration resolves to the current runtime defaults.

| Area | Current production architecture | Reuse decision |
|---|---|---|
| Tenant boundary | `TenantContext` resolves the active `restaurants` row from approved `erp_memberships`; database RLS is enabled across tenant data. | Scope organization configuration to `restaurants.id` only. Never trust browser-selected tenant state alone. |
| RBAC | `RoleContext` normalizes owner/admin aliases and exposes `manageDashboardCustomization`; approved memberships keep delegated permissions in JSON. | Reuse owner/delegated-membership authorization. Do not introduce roles or client-only authorization. |
| Subscription and entitlements | `SubscriptionContext` reads the server-backed `erp_subscription_snapshot`; protected modules additionally use `FeatureRouteGuard` and `erp_require_subscription_feature`. | Continue to render customization only inside existing role and feature boundaries. No customization flag may grant a route, API, or entitlement. |
| Billing and Paddle | Subscription plans, payments, events, Paddle customers, Paddle subscription mirror, and Paddle webhooks are canonical production tables/flows. | Do not alter billing tables, price IDs, checkout logic, webhook logic, plan IDs, limits, or entitlement helpers. |
| Dashboard | `dashboard_configurations` is already a restaurant-scoped JSONB table with owner/delegate RLS and audit fields. | Keep and extend the existing dashboard customization path only for dashboard presentation. |
| Navigation | `ERPSidebar` is a static registry filtered by client permission checks; protected routes enforce RBAC and entitlements independently. | Apply configuration only when rendering navigation. Hidden modules remain protected by the existing server and route guards. |
| Organization settings | `org_settings` stores one JSONB object per `restaurants.id`; legacy `app_settings` consumers are less consistently scoped. | Reuse the canonical `org_settings.settings` JSONB object for organization-wide workspace configuration. Do not use legacy `app_settings` for new workspace controls. |
| Forms and tables | Pages have no shared metadata-driven form/table engine. | Expose configuration only for the supported workspace schema and consume it in the shared customization runtime; do not claim arbitrary page-level controls that are not applied. |
| Reports and saved views | Reports are currently fixed, authorized data views; `scheduled_reports` exists but is distinct. | Keep report definitions presentation-only and authorization-constrained. Add one tenant-scoped saved-view table for persistent per-user and shared views. |
| Audit | `audit_logs` and `permission_audit_log` already provide restaurant-scoped audit infrastructure. | Record organization-level workspace changes using the existing `audit_logs` table through server-authorized mutation functions. |

## Minimum persistence model

Organization-wide workspace configuration will be stored as a versioned `workspace_customization` object inside the existing `org_settings.settings` JSONB row, keyed by `restaurants.id`. It will contain only validated presentation configuration: navigation visibility/order, supported dashboard options, labels, supported field/form/table metadata, report defaults, workflow preferences, notification preferences, regional defaults, and document-numbering preferences. It cannot contain executable code, SQL, HTML, API definitions, permissions, subscription data, Paddle data, or canonical accounting values.

A single `workspace_saved_views` table is required for durable per-user and organization-shared list/report views. It is tenant-scoped by `restaurant_id`, owns a creator identifier, stores a validated JSONB view definition, and is protected by RLS. No subscription, plan, entitlement, or Paddle tables are added.

## Mutation and runtime rules

All organization-wide writes will use a server-side RPC that verifies approved owner membership or the existing delegated `manageDashboardCustomization` permission, validates the JSON schema, writes only the workspace namespace, invalidates cached configuration through a realtime update, and appends an `audit_logs` record with old and new values. Read access remains tenant-scoped. The client applies configuration as a presentation layer after the existing role and subscription guards; direct routes and server APIs retain their existing enforcement.

The intended default is an empty configuration object. Therefore, a tenant with no saved customization sees the current BizCTRL dashboard, navigation, labels, and page behavior unchanged.
