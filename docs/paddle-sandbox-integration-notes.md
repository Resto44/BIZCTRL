# Paddle Sandbox integration notes

## Account and browser status

On 18 August 2026, a fresh Paddle Sandbox login session loaded normally in the agent browser with cookies, local storage, session storage, secure context, and popup APIs available. The user’s existing normal-browser session was not shared into the agent session. The Paddle dashboard therefore remains inaccessible to this task without asking for credentials, which the user explicitly declined. No further login attempts will be made.

## Authoritative integration rules

Paddle.js must use a **Sandbox client-side token** (`test_…`), which is safe to expose in frontend code. Paddle API keys and webhook endpoint secrets are server-only settings and must never appear in the application bundle or database. [1]

Paddle webhooks carry `event_id`, `event_type`, `occurred_at`, and the resource snapshot in `data`. Delivery is at least once, and notifications may arrive out of order. The receiver must deduplicate by `event_id` and use `occurred_at` to determine whether a newer provider state may replace an older one. [2]

Webhook signatures must be verified from the raw request body. The `Paddle-Signature` header includes `ts` and one or more `h1` values; the signed payload is `ts + ':' + rawBody`, HMAC-SHA256 is computed with the notification destination secret, and results must be compared in constant time. [3]

Paddle’s hosted customer portal supports invoices, payment-method updates, subscription management, and compliant cancellation. Authenticated portal URLs are temporary and must be created server-side for the authenticated customer rather than stored. [4]

## Sandbox configuration values still required from Paddle Dashboard

| Configuration | Destination | Status |
|---|---|---|
| Three real recurring Sandbox price IDs | `subscription_plans.paddle_price_id` | Not available; leave `NULL` |
| Sandbox Paddle.js client-side token | Vercel `VITE_PADDLE_CLIENT_TOKEN` | Not available; leave unset |
| Sandbox Paddle API key | Supabase Edge secret `PADDLE_API_KEY` | Not available; leave unset |
| Sandbox notification destination secret | Supabase Edge secret `PADDLE_WEBHOOK_SECRET` | Not available; leave unset |
| Sandbox notification destination | Paddle dashboard pointing to `https://mqubwgbppncldyiicbtu.supabase.co/functions/v1/paddle-subscription-webhook` | Not available; not created |

## References

[1]: https://developer.paddle.com/paddle-js/about/client-side-tokens/ "Paddle: Manage client-side tokens"
[2]: https://developer.paddle.com/webhooks/about/how-webhooks-work "Paddle: How webhooks work"
[3]: https://developer.paddle.com/webhooks/about/signature-verification "Paddle: Verify webhook signatures"
[4]: https://developer.paddle.com/concepts/sell/customer-portal "Paddle: Customer portal"
