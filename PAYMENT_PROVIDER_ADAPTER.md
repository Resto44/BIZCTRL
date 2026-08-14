# Payment Provider Adapter

The ERP subscription backend exposes a provider-independent boundary. The active implementation is **Mock/Test only** and does not read payment credentials, construct a remote checkout, send a webhook, or make an external payment request.

| Adapter method | Current Mock/Test behavior | Future real-provider behavior |
| --- | --- | --- |
| `createCheckout()` | Creates a server-authorized `PENDING_PAYMENT` test intent with `payment_status = pending`. | Creates a remote provider checkout from canonical server-calculated pricing. |
| `verifyPayment()` | An approved owner may simulate `succeeded` or `failed` only after non-production TEST MODE is enabled. | Verifies a signed provider result server-side. |
| `handleWebhook()` | Not implemented; the Mock/Test adapter throws a test-only error. | Validates the provider signature and processes the event idempotently. |
| `cancelSubscription()` | Requests cancellation at period end through the canonical subscription procedure. | Calls a provider cancellation API, then reconciles the confirmed state. |
| `getSubscription()` | Returns the derived canonical subscription snapshot. | Retrieves and reconciles provider state without making the provider the ERP entitlement authority. |

> The legacy provider-event bridge is deliberately dormant and always rejects calls with `PAYMENT_PROVIDER_NOT_ENABLED`. It is retained only as a documented integration seam for a future, explicitly configured adapter.

## Test Mode Boundary

The database defaults TEST MODE to disabled. Only a server-side, service-role configuration action may enable it for an isolated non-production environment. Once enabled, only an approved organization owner can create test payment intents, simulate success or failure, or simulate renewal, cancellation, and expiration. Every record created by this path uses `provider = mock_test`, `is_test = true`, and a **TEST ONLY** label.

