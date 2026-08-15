# Platform Owner Portal — Initial Audit Notes

## Request boundary

The requested Platform Owner/Super Admin portal must be an isolated control plane. A platform-level owner is distinct from any organization owner, manager, employee, driver, or customer ERP user. The existing customer ERP portal must not expose platform-wide customer, revenue, payment, or administration views.

## Source findings

The current `SuperAdmin.jsx` is not suitable as the requested secure control plane. It contains client-side plan definitions and its fallback authorization treats a customer `owner` as a super administrator when a build-time email is unavailable. The replacement must use a server-validated platform-owner grant and an isolated route/layout.

The source already contains canonical subscription, payment-provider, billing, promotion, tenant-identity, membership, and feature-enforcement migrations. These are the starting point for extension; a parallel billing or subscription model must not be introduced.

## Live schema findings

The live project is healthy and includes a RLS-protected `profiles` table, RLS-protected `restaurants` tenant records, canonical `subscriptions`, `subscription_events`, and payment-linked relationships. `restaurants.business_mode` has the committed `restaurant`, `retail`, and `pharmacy` enum values. Deeper audit must identify exact columns, existing plan/payment tables, current RLS policies, and safe extension points before any DDL is proposed.

## Canonical lifecycle and payment findings

The canonical `subscription_plans`, `subscriptions`, `subscription_usage`, `subscription_payments`, and `subscription_events` model already records plans, lifecycle transitions, usage, payment metadata, and the relationship to the organization boundary (`restaurants`). The current public catalog contains the legacy permanent `free` plan plus $20, $40, and $100 paid plans; the new Platform Owner design must deprecate the permanent Free entitlement deliberately, not create a parallel plan catalog.

The existing provider-independent payment flow has a `PENDING_PAYMENT` state, retains payment history, and does not activate a paid subscription before an approved provider outcome. Manual IBAN payments should extend the existing `subscription_payments` table with manual-transfer metadata and proof storage keys, not create a second payment table. Platform Owner approval must be implemented as a separate server-side procedure that updates the canonical payment, subscription, and subscription-event records atomically.

## Route and session findings

The current `/super-admin` route is mounted inside `SubscribedRoutes`, `AppLayout`, the customer `SubscriptionProvider`, the organization `RoleProvider`, and the tenant `TenantProvider`. This violates the requested separation because a Platform Owner must not be gated by a customer organization subscription or appear in customer navigation.

The existing `AuthContext` provides the shared Supabase-backed session state and logout mechanics, but all login redirects target `/erp-login`. The Platform Owner implementation needs a distinct `/platform-owner/login` entry and isolated guarded route tree. Its server authorization must be granted from a dedicated platform-level table or SECURITY DEFINER predicate, never from a client environment variable or the organization `owner` role.

## Payment-table and authorization findings

`subscription_payments` is the canonical payment-history table and already stores the subscription, organization, selected plan, provider, payment status, price, currency, period, timestamps, metadata, test marker, and display/reference fields. The manual IBAN workflow can add proof-object metadata, transfer reference, payment-date, bank snapshot, and review fields to this table.

The table currently exposes only owner-scoped read access through RLS. A Platform Owner must not receive broad client RLS access to it; global payment review and reporting should use dedicated SECURITY DEFINER routines guarded by a new platform-owner predicate. The same pattern can safely return global paginated organization, user, subscription, and revenue data while leaving customer row policies unchanged.
