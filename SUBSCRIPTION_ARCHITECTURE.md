# Canonical Subscription Architecture

## Scope and Authority

The subscription system is authoritative only on the server. The browser receives a derived subscription summary and may render permitted actions, but it cannot create trials, select entitlements, advance subscription state, alter usage, or activate paid access. Every protected mutation and every metered operation must resolve the requesting member's organization, load the organization’s one current subscription, evaluate entitlement, and enforce its applicable limit inside the same server-side transaction.

The organization is the billing tenant. An organization can have many users, restaurants, and branches, but it has exactly one active subscription record at a time. Historical changes are retained as immutable subscription events and payment records rather than copied into parallel billing tables.

## Canonical Relationship Model

| Entity | Canonical responsibility | Key invariants |
| --- | --- | --- |
| `restaurants` | Existing ERP organization and billing-tenant boundary | The current ERP organization model is retained; one current subscription is scoped to each restaurant organization. |
| `erp_memberships` | User-to-organization access and ERP roles | A user is authorized through approved membership, not an email-derived organization key. |
| `subscription_plans` | The four published plan catalog records and entitlement source | Only `free`, `starter_20`, `growth_40`, and `enterprise_100` are sellable. |
| `subscriptions` | One current lifecycle record per organization | `restaurant_id` is unique and the state machine is evaluated only by server-side routines. |
| `subscription_usage` | Metered usage for a billing month or trial period | Usage is incremented transactionally after an entitlement check. |
| `subscription_events` | Immutable state-transition audit trail | Every transition has a server-generated actor, reason, and timestamp. |
| `subscription_payments` | Payment-provider-independent payment and test transaction history | Provider event IDs are unique; every simulated record carries explicit test-only metadata. |

## Published Plan Policy

| Plan | Monthly price | Restaurants | Branches | Employees | Users | Storage | PDF reports / month | OCR / month | Advanced analytics | ERP module policy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Free | $0 | 1 | 1 | 5 | 5 | 512 MB | 10 | 10 | No | Core sales, purchases, expenses, inventory, and basic reports only. |
| Starter | $10 | 1 | 1 | 5 | 3 | 5 GB | 100 | 100 | No | Free modules plus treasury, suppliers, reports, PDF export, and OCR. |
| Growth | $20 | 3 | 3 | 15 | 10 | 25 GB | 500 | 500 | Yes | Starter modules plus advanced analytics, driver analytics, scheduled reports, and cash-flow forecasting. |
| Enterprise | $50 | 10 | 10 | 50 | 30 | 100 GB | 2,000 | 2,000 | Yes | All ERP modules. |

The `TRIAL` state grants temporary access to every published ERP module and applies the Starter plan’s quotas for thirty calendar days. This is an entitlement override, not a fifth plan record. The Free plan is permanent and can be selected after trial expiry or cancellation without a payment event.

## Lifecycle State Machine

| State | Entry condition | ERP access | Permitted transition |
| --- | --- | --- | --- |
| `TRIAL` | Server provisions a new owner organization | Full ERP access for exactly 30 calendar days | `PENDING_PAYMENT`, `FREE`, or `EXPIRED` |
| `FREE` | Owner selects the permanent Free plan | Free-plan entitlements | `PENDING_PAYMENT` |
| `PENDING_PAYMENT` | Owner selects a paid plan; payment record is `pending` | Billing and plan selection only | `ACTIVE`, `FREE`, or `EXPIRED` |
| `ACTIVE` | A provider adapter verifies a successful provider result, or the owner runs an explicitly marked TEST MODE simulation | Purchased-plan entitlements | `PAST_DUE` or `CANCELED` after period end |
| `PAST_DUE` | Provider adapter or owner-only TEST MODE records a failed renewal | Billing and account recovery only | `PENDING_PAYMENT`, `CANCELED`, or `FREE` |
| `CANCELED` | A cancel-at-period-end subscription reaches the end of its paid period | Billing and plan selection only | `PENDING_PAYMENT` or `FREE` |
| `EXPIRED` | Trial reaches its end date without a selected Free plan or confirmed paid result | Billing and plan selection only | `FREE` or `PENDING_PAYMENT` |

Cancellation requests set `cancelAtPeriodEnd` and preserve `ACTIVE` state until the paid period ends. Renewing clears that flag. A paid-plan selection creates `payment_status = pending` and `subscription_status = PENDING_PAYMENT`; it never grants ERP access. A paid plan is never placed into `ACTIVE` by a browser action, return URL, client-supplied result, or ordinary owner action. In TEST MODE only, an approved owner can invoke the Mock/Test provider’s server-side confirmation procedure. Each such transaction is labelled **TEST ONLY**, stores `provider = mock_test`, and is kept distinct from live provider events.

## Entitlement and Usage Contract

The server evaluates the current subscription on every protected procedure. It supplies a standardized decision containing the current state, plan, active module permissions, quota ceilings, and usage balance. A denied action returns a structured error with the subscription state, resource or module that was blocked, current usage, limit, and a billing route. The response is presentation data; it is not an authorization token.

Quota checks precede resource creation. Metered operations reserve or increment usage inside the transaction that completes the operation, so simultaneous browser requests cannot exceed a plan ceiling. Storage is measured from authoritative file metadata; restaurant, branch, employee, and user limits are measured from canonical active records. Client counters and cached plan details are never used as enforcement input.

## Discounts and Payments

Discounts are server-side catalog rules with start and end times, eligibility rules, and a percentage or fixed adjustment. The pricing API returns original price, discount badge text, and final price together; it cannot return a discounted final price without the matching original price and badge. The provider adapter contract consists of `createCheckout`, `verifyPayment`, `handleWebhook`, `cancelSubscription`, and `getSubscription`. The only enabled implementation until a real provider is deliberately configured is `MockTestPaymentProvider`; it performs server-authorized lifecycle simulations and never calls or impersonates a live payment gateway.

## Migration and Retirement Rules

The legacy email-keyed subscription record, client-created trial, client-controlled plan update, inline usage counters, `TenantProfile` billing fields, and legacy usage log are not authoritative after migration. Existing organizations are mapped to an `organizations` row, the most recent subscription data is transformed into the canonical subscription and payment history, and any legacy fields remain read-only only until reconciliation completes. Old browser APIs for subscription mutation are deleted; ERP business modules are preserved and gradually routed through the shared server entitlement middleware.
