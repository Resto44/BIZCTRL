# Paddle Live Fulfillment Setup

The server-side fulfillment path is deployed on Supabase and is intentionally configured for **Paddle live production** only. The webhook endpoint performs signature verification with Paddle's official server SDK before parsing or acting on the body. It returns a non-success response for missing configuration, invalid signatures, or verified events that could not be applied, preserving Paddle retry behavior.

| Component | Value |
| --- | --- |
| Webhook endpoint | `https://mqubwgbppncldyiicbtu.supabase.co/functions/v1/paddle-subscription-webhook` |
| Webhook function | `paddle-subscription-webhook` with JWT verification disabled because it independently verifies `Paddle-Signature` |
| Customer-portal function | `paddle-customer-portal` with JWT verification enabled |
| Subscription storage | Existing canonical `subscriptions`, `subscription_payments`, and `subscription_events` tables, with provider mirrors in `paddle_customers`, `paddle_subscription_mirror`, and `paddle_webhook_events` |

## Required server secrets

Configure these as **Supabase Edge Function secrets** only. They must never be placed in `VITE_*` variables, frontend source, Vercel public environment variables, or committed local environment files.

| Secret | Purpose |
| --- | --- |
| `PADDLE_ENVIRONMENT=production` | Prevents the routes from operating against a non-live environment. |
| `PADDLE_API_KEY` | Authenticates server-side transaction and customer-portal API calls. |
| `PADDLE_WEBHOOK_SECRET` | The endpoint signing secret for the persistent Paddle notification destination. |
| `APP_URL=https://mybizctrl.site` | The allowed origin for the authenticated portal and checkout functions. |

## Create the persistent notification destination

The connected Paddle integration had read access but rejected notification-destination creation with an authorization error. Create the following destination manually in **Paddle → Developer tools → Notifications**, then copy its endpoint signing secret directly into the `PADDLE_WEBHOOK_SECRET` Edge Function secret. Treat this secret as a password and do not share it or commit it to the repository.

| Setting | Required value |
| --- | --- |
| Description | `RestoCTRL live subscription fulfillment` |
| Type | URL |
| Destination | `https://mqubwgbppncldyiicbtu.supabase.co/functions/v1/paddle-subscription-webhook` |
| Traffic source | Platform |
| Sensitive fields | Disabled |
| Events | `customer.created`, `customer.updated`, `subscription.created`, `subscription.updated`, `subscription.canceled`, `transaction.completed` |

This destination is permanent production infrastructure. Do not delete it, the linked Paddle catalog products and prices, or live billing records.

## Event and entitlement behavior

The handler uses typed routes for the subscribed customer, subscription, and completed-transaction events. It uses `paddle_webhook_events.paddle_event_id` as the idempotency key and preserves provider ordering through the existing guarded canonical subscription procedure. Customer and subscription mirrors are upserted, rather than blindly inserted, so duplicate delivery and re-delivery are safe.

`paddle_subscription_grants_access(status)` returns `true` only for Paddle statuses `active` and `trialing`. It returns `false` for `canceled`, `paused`, and `past_due`. A cancellation or pause **scheduled change** is retained as metadata and does not itself revoke access; canonical access remains active until the provider reports the actual canceled status and the existing billing procedure applies that change.

## Verify after secrets are configured

Use Paddle's webhook simulator to send a signed event to the endpoint. A successful supported event returns HTTP 200 and is recorded in `paddle_webhook_events`; an unsupported but valid event returns HTTP 200 with `ignored: true`. Invalid signatures must return a non-2xx response. The portal route should be called only by a signed-in billing owner; it resolves the Paddle customer and subscription IDs from the server-side session before minting the hosted portal URL.

## References

[1] [Paddle — Verify webhook signatures](https://developer.paddle.com/webhooks/about/signature-verification)

[2] [Paddle — Node.js SDK](https://developer.paddle.com/sdks/libraries/node)

[3] [Paddle — Node.js quickstart](https://developer.paddle.com/get-started/quickstart/node)
