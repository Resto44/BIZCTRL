# BizCTRL Production Subscription and Billing Audit

**Author:** Manus AI
**Audit date:** 22 August 2026
**Scope:** `Resto44/Base44RestoCTRL`, Vercel Production, Supabase Production, and the connected Paddle Live account.

## Executive summary

BizCTRL’s **canonical production architecture is now restored and preserved**: the browser selects a canonical public plan, an authenticated edge function creates the Paddle transaction from server-side plan data, Paddle.js opens only that immutable transaction ID, and the verified webhook applies the result to `subscriptions`, `subscription_payments`, and `subscription_events`. No duplicate mirror table is used by the active webhook.

The originally reported **Manual IBAN fallback** had a clear client-side root cause: the Production browser bundle lacked a valid Paddle client token, so `isPaddleClientConfigured()` evaluated false and the shared payment-provider selection chose its existing Manual IBAN fallback. The Production Vercel configuration now has both `VITE_PADDLE_CLIENT_TOKEN` and `VITE_PADDLE_ENVIRONMENT=production`; the newest Production bundle is ready and contains the live token and production environment literal.

However, a genuine live checkout remains blocked by two owner-managed Paddle prerequisites. Supabase Production has **no custom Edge Function secrets**, so `PADDLE_API_KEY` and `PADDLE_WEBHOOK_SECRET` are missing; live checkout calls return `503` until the existing live API key is provided. Paddle Live also has **no notification destination**, so no real subscription or payment event can reach the canonical webhook. These are correctly classified as **BLOCKED — REQUIRES OWNER ACTION**. No API key, webhook secret, customer, transaction, subscription status, plan, price, or pending payment was changed during this audit.

| Audit outcome | Status |
| --- | --- |
| Canonical Paddle checkout code | Verified |
| Public live client configuration | Remediated and deployed |
| Catalog-to-database plan mapping | Verified |
| Canonical webhook implementation | Restored and verified |
| Anonymous billing RPC exposure | Remediated and verified |
| Frontend build and repository tests | Passed |
| Live server checkout | Blocked — requires existing API key |
| Live webhook fulfillment | Blocked — requires destination and signing secret |

## Scope and method

The audit inspected the selected GitHub repository and the deployed Vercel, Supabase, and Paddle Live resources. It traced plan display, authentication redirect/resume, client provider selection, transaction creation, webhook verification, canonical state updates, portal access, manual IBAN fallback, entitlement guards, plan limits, RPC privilege boundaries, production logs, and current live catalog configuration. Production data was inspected read-only except for the two explicitly documented, non-data schema-permission migrations described below.

## Current architecture and evidence

### Plan display and checkout initiation

The landing page queries only active public `subscription_plans` using the shared `PUBLIC_PLAN_FIELDS` selection and renders `PublicPricingCards`. It has a single public pricing surface at `/#pricing`. A visitor who is not authenticated is directed to the owner registration flow with an internally constrained return path; after authentication, the original selected plan resumes through `?checkout_plan=<plan-id>`.

The shared `usePublicPlanCheckout` helper refuses to create server checkout context unless a real browser-side live token is present and the selected plan exposes a Paddle `pri_...` ID. The current Vercel Production bundle passes these client preconditions.

| Step | Authoritative implementation | Verification |
| --- | --- | --- |
| Public plan list | `LandingPage.jsx` + `subscription_plans` | Active public catalog returned Starter, Growth, and Enterprise |
| Login / registration resume | `publicPlanCheckout.js` | Return path is internal-only and resumes the selected plan |
| Browser configuration gate | `paddle.js` | Requires `production` and a valid `live_...` token |
| Client checkout handoff | `paddleBilling.js` | Calls `paddle-subscription-checkout` with only `{ planId }` |
| Overlay | `paddle.js` | Calls `Paddle.Checkout.open({ transactionId })` only after server response |

### Server-created transaction and canonical billing state

`paddle-subscription-checkout` requires `PADDLE_ENVIRONMENT=production`, `PADDLE_API_KEY`, authenticated Supabase identity, and a canonical `paddle_create_checkout_context(planId)` response. That database procedure validates the active public plan and its `paddle_price_id`, locks the workspace subscription, creates or safely reuses a canonical pending Paddle payment, and records `paddle_checkout_requested` in `subscription_events`. It does not activate the subscription.

The server creates the Paddle transaction with the canonical price ID and controlled `custom_data` containing the canonical payment, workspace, user, and plan references. It then links only the returned `txn_...` ID through a service-role procedure. The browser never sends a price, organization, customer, or transaction payload of its own choosing.

### Verified webhook and fulfillment path

The active webhook is raw-body based. It reads `Paddle-Signature`, verifies an HMAC-SHA256 over `timestamp:rawBody`, enforces a five-minute timestamp window, compares signature bytes in a timing-safe manner, checks the current Paddle IPv4 allowlist, and uses the service role to invoke only `paddle_apply_webhook_event`.

The supported event set is:

| Subscription events | Transaction events |
| --- | --- |
| `subscription.created`, `subscription.trialing`, `subscription.activated`, `subscription.updated`, `subscription.canceled`, `subscription.past_due`, `subscription.paused`, `subscription.resumed` | `transaction.paid`, `transaction.completed`, `transaction.payment_failed`, `transaction.past_due`, `transaction.refunded` |

The canonical processor is idempotent by `provider_event_id`, rejects event-to-payment and event-to-tenant mismatches, validates the submitted Paddle price against the canonical plan, preserves out-of-order safeguards, and updates only canonical subscription/payment/event records. It does not use `paddle_customers`, `paddle_subscription_mirror`, or `paddle_webhook_events`.

> **Important residual state:** Those three duplicate tables remain present from an earlier, now-reverted migration. They are unused by the active webhook. They were not removed because the explicit instructions prohibit database-schema changes to eliminate them.

### Subscription management, entitlements, and limits

The authenticated billing interface uses `erp_subscription_snapshot` for the current plan, trial, period, payment-provider, and owner-management state. Paddle-managed subscriptions with canonical customer and subscription IDs are routed to the hosted Paddle customer portal; the portal context is resolved server-side only for the approved billing owner.

The repository’s feature and capacity rules are not merely visual. `FeatureRouteGuard` first checks the subscription context and then invokes `erp_require_subscription_feature`; capacity restrictions are backed by subscription capacity procedures and triggers for real resource creation and invitations. The audited contract tests validate these authorization, lifecycle, and enforcement rules.

## Confirmed defects and remediation

### 1. Production browser configuration was incomplete — remediated

The live browser bundle had no configured `VITE_PADDLE_CLIENT_TOKEN`, causing the existing provider factory to select the Manual IBAN fallback. The existing active Paddle Live client token was added as **Production-only** configuration, and `VITE_PADDLE_ENVIRONMENT=production` was also added as a separate **Production-only** setting. Vercel Production deployment `dpl_ANVbGdznQGgdeNU8S5TDTpSr1Y3m` is `READY`; its served asset `index-3dqdAOsC.js` contains the configured client token and a production environment literal.

### 2. Canonical webhook and portal deployment had diverged — remediated

Production inspection showed that the previously deployed webhook was still on the duplicate-mirror implementation. The active webhook and customer portal were restored from the existing canonical source. The active webhook now calls `paddle_apply_webhook_event()` and does not reference mirror tables.

### 3. Anonymous database RPC execution was broader than required — remediated

Production ACL inspection found anonymous execution permission on billing, webhook, portal, entitlement, cancellation, usage, and dormant test RPCs. Two minimal privilege migrations were applied:

| Migration | Effect |
| --- | --- |
| `20260822_billing_rpc_least_privilege.sql` | Removes default public execution and defines intended runtime callers |
| `20260822_billing_rpc_explicit_role_revoke.sql` | Removes residual explicit `anon` grants and re-grants only authenticated or service-role access |

Final verification confirms `anon_execute=false` for all audited billing RPCs. Canonical user-facing RPCs retain authenticated access; transaction-linking and webhook-application RPCs are service-role-only.

### 4. Repository tests referenced an obsolete public pricing page — remediated

Two contract tests still read `PublicPages.jsx` as though it contained a dedicated public pricing page. The current production architecture intentionally uses the landing page as the sole public pricing and checkout-resume surface. The tests were aligned to that canonical architecture; no customer-facing checkout behavior was changed.

## Remaining blockers requiring owner action

### BLOCKED — REQUIRES OWNER ACTION: Existing Paddle API key

The authenticated Supabase Production Edge Function Secrets interface reports **no custom secrets**. This is the direct root cause of `503` responses from `paddle-subscription-checkout`; the edge function requires `PADDLE_API_KEY` before authentication or transaction creation can proceed.

An authorized owner must add the **existing** live Paddle API key as:

```text
PADDLE_API_KEY=<existing Paddle Live API key>
```

Do not create, rotate, expose, or paste this value into GitHub, Vercel, client code, or chat. The value belongs only in Supabase Edge Function Secrets.

### BLOCKED — REQUIRES OWNER ACTION: Paddle notification destination and signing secret

Paddle Live’s Notifications page visibly contains **no destinations**. Create one in Paddle Live with this endpoint:

```text
https://mqubwgbppncldyiicbtu.supabase.co/functions/v1/paddle-subscription-webhook
```

Subscribe it to the supported event set listed above, restrict traffic to real platform events, and keep sensitive fields disabled unless a documented canonical use requires them. After Paddle creates the endpoint, copy its signing secret directly into Supabase Edge Function Secrets as:

```text
PADDLE_WEBHOOK_SECRET=<destination signing secret>
```

No test or production transaction should be initiated before both secrets are present and the notification destination is active. Paddle documents signing-secret verification and notification destinations in its official webhook documentation. [1] [2]

### BLOCKED — REQUIRES OWNER ACTION: Authenticated checkout and portal test

The available browser session redirects `/billing` to the ERP role-login page. A real authenticated **approved owner** session is necessary to exercise the non-destructive pre-payment portion of the flow and see the Billing summary. Because invoking the checkout endpoint creates or reuses a pending payment and changes the canonical subscription to `PENDING_PAYMENT`, this audit did not start a transaction or open a checkout overlay.

## Validation results

| Validation | Result | Evidence |
| --- | --- | --- |
| Vercel Production configuration | Passed | Both required browser-side Paddle variables are Production-only; deployment is ready |
| Served browser bundle | Passed | Live client token and `production` literal found in served JavaScript |
| Canonical plan mapping | Passed | Starter `$10`, Growth `$20`, and Enterprise `$50` map to the three active Paddle Live `pri_...` prices and corresponding canonical IDs |
| Paddle checkout domain | Passed | `mybizctrl.site` is approved in Paddle Live |
| Public checkout provider selection | Passed | Valid browser configuration selects Paddle rather than Manual IBAN fallback |
| Canonical webhook implementation | Passed | Raw body, signature, timestamp, source allowlist, idempotency, canonical RPC routing verified |
| Canonical entitlement and capacity enforcement | Passed | Server-side feature, usage, and capacity procedures/triggers inspected; relevant contract tests passed |
| RPC privilege hardening | Passed | `anon_execute=false` for every audited billing RPC after migration |
| Frontend production build | Passed | `npm run build` completed successfully |
| Repository test suite | Passed | 20 test files and 122 tests passed |
| Live checkout transaction | Not run | Correctly withheld: missing server secret and audit constraints prohibit pending-payment/status mutation |
| Live webhook event delivery | Not run | Correctly blocked: no Paddle notification destination or signing secret |

## Changes delivered

The complete remediation and audit are committed and pushed to [`0a15753`](https://github.com/Resto44/Base44RestoCTRL/commit/0a15753):

| File | Purpose |
| --- | --- |
| `supabase/migrations/20260822_billing_rpc_least_privilege.sql` | Initial least-privilege billing RPC grant cleanup |
| `supabase/migrations/20260822_billing_rpc_explicit_role_revoke.sql` | Explicit anonymous-role revocation and final grant definitions |
| `tests/bizctrlLaunchPricingContract.test.js` | Aligns pricing test with the landing-only public checkout surface |
| `tests/paddleSandboxIntegrationContract.test.js` | Aligns Paddle checkout test with the landing-only public checkout surface |
| `reports/paddle_production_checkout_inspection_2026-08-22.md` | Supporting production inspection evidence |

## References

[1] [Paddle — Verify webhook signatures](https://developer.paddle.com/webhooks/about/signature-verification)

[2] [Paddle — Notifications](https://developer.paddle.com/webhooks/overview)
