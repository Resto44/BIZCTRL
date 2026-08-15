# Platform Owner / Super Admin Architecture

## Security boundary

The Platform Owner control plane is separate from customer ERP ownership. It uses the same underlying Supabase authenticated session but requires an independent, explicit `platform_owner_accounts` grant. No route, database function, or user-interface guard may infer Platform Owner authority from `profiles.role = 'owner'`, `erp_memberships.role = 'owner'`, an organization relationship, or a client environment variable.

Platform functions use narrowly scoped `SECURITY DEFINER` routines protected by `platform_owner_assert()`. Customer RLS policies remain restrictive and unchanged. The new platform tables have RLS enabled with no direct customer policy; access occurs only through the guarded routines. The grant table is deliberately empty after migration and can be provisioned only with a service-role action for a verified platform account.

## Canonical data reuse

| Concern | Canonical entity | Platform extension |
|---|---|---|
| Customer organization | `restaurants` | Global paginated read and controlled suspend/reactivate actions. |
| User identity | `profiles`, `erp_memberships` | Global paginated read, suspend/reactivate, and session-revocation marker. |
| Subscription lifecycle | `subscriptions`, `subscription_events` | Trial extension, paid plan selection, suspension, expiration, cancellation, and immutable events. |
| Paid catalog | `subscription_plans` | Three paid plans: $20, $40, and $100; editable metadata and feature flags without a duplicate catalog. |
| Promotions | New `platform_promotions` | SaaS-plan promotions, not the customer sales `promotions` table. |
| Payment history | `subscription_payments` | Manual IBAN transfer, proof storage key, reference, review metadata, and approved/rejected states. |
| Entitlements | `subscription_plans.feature_flags` | `subscription_feature_overrides` for explicit organization-level overrides evaluated by the existing feature guard. |
| Platform actions | New `platform_owner_activity_logs` | Immutable actor, target, timestamp, action, and context records. |

## Subscription policy

The permanent Free plan is retired without deleting historical rows. Existing `FREE` subscriptions transition to `EXPIRED`, their events remain intact, and the legacy `free` plan is inactive and non-public. The new organization flow remains a 30-day full-access trial. When a paid plan is selected, the subscription moves to `PENDING_PAYMENT`; only a successful manual IBAN approval can move it to `ACTIVE`.

## Manual IBAN payment workflow

1. A verified organization owner selects one of the three paid canonical plans.
2. A guarded database routine calculates a current eligible promotion and creates a `subscription_payments` row with provider `manual_iban` and status `pending`.
3. The owner uploads an image or PDF into the restricted payment-proof bucket using a path bound to their authenticated user ID and payment ID, then records the proof metadata through a guarded routine.
4. A Platform Owner sees the pending payment through a paginated guarded query and approves or rejects it atomically.
5. Approval records the payment, updates the canonical subscription to `ACTIVE`, sets the billing period, increments a promotion redemption where applicable, emits a subscription event, and writes a Platform Owner activity record. Rejection records `rejected`, sets the subscription to `PAST_DUE`, emits an event, and preserves the proof and audit record.

## Portal separation

The customer app remains under its existing ERP routes. Platform routes use the `/platform-owner` prefix and do not mount `AppLayout`, `TenantProvider`, `SubscriptionProvider`, or organization role navigation. The Platform Owner login is `/platform-owner/login`; it signs in through Supabase credentials, validates `platform_owner_session_snapshot()`, and signs out immediately when the identity lacks a platform grant. Account-level `mfa_required` supports MFA enforcement when Supabase Auth MFA assurance is available.
