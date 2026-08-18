# BizCTRL Paddle Billing Sandbox configuration

This release contains the application-side Paddle Sandbox architecture only. It intentionally does **not** contain a Paddle API key, notification secret, client-side token, or price ID. Do not use Paddle Live credentials in any step below.

## Required dashboard configuration

Create three recurring **Sandbox** products and prices in Paddle. Their actual amounts must be the promotional charges, not the marketing reference amounts.

| BizCTRL catalog plan | Paddle recurring price | Trial configuration | Database destination |
|---|---:|---|---|
| `starter_20` | USD 10.00 per month | A real Paddle one-month recurring-price trial | `subscription_plans.paddle_price_id` |
| `growth_40` | USD 20.00 per month | None | `subscription_plans.paddle_price_id` |
| `enterprise_100` | USD 50.00 per month | None | `subscription_plans.paddle_price_id` |

The existing $40, $80, and $200 values remain BizCTRL reference prices only. They must not be copied into Paddle as the price that customers are charged.

Create a **Sandbox** client-side token in Paddle Developer Tools. Set it as the Vercel build variable `VITE_PADDLE_CLIENT_TOKEN` and set `VITE_PADDLE_ENVIRONMENT=sandbox`. A client-side token is intended for Paddle.js and is the only Paddle credential allowed in the public build.[1]

Set these Supabase Edge Function secrets, never Vite/Vercel-public variables: `PADDLE_ENVIRONMENT=sandbox`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, and `APP_URL=https://mybizctrl.site`. The API key and notification secret are server-only. Do not place them in the database, repository, client storage, HTML, or chat.

Create a Paddle Sandbox notification destination for:

```text
https://mqubwgbppncldyiicbtu.supabase.co/functions/v1/paddle-subscription-webhook
```

Subscribe it to the event types handled by the deployed function: `subscription.created`, `subscription.trialing`, `subscription.activated`, `subscription.updated`, `subscription.canceled`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, `transaction.paid`, `transaction.completed`, `transaction.payment_failed`, `transaction.past_due`, and `transaction.refunded`.

Set the Sandbox checkout default payment link to `https://mybizctrl.site/pricing`; Paddle requires a default checkout link and the domain must be approved in the configured environment.[2]

## Verification sequence after configuration

First, configure the three real price IDs in `subscription_plans` through a controlled server-side migration or an authorized platform-owner path. Next, deploy/redeploy the frontend after setting the public client-side token. Finally, send a signed Paddle Sandbox webhook simulation and run a real Sandbox checkout against each plan.

The webhook receiver verifies the raw request body against `Paddle-Signature`, deduplicates each `event_id`, and compares `occurred_at` so an older delivery cannot overwrite a newer subscription state. Paddle delivers webhooks at least once and does not guarantee arrival order.[3]

Paddle Checkout is opened only from a server-created transaction. The Edge Function establishes the authenticated owner, tenant, plan, and real configured Paddle price first, then stores a local pending payment and gives the browser only the resulting Paddle transaction ID. The browser does not calculate the final amount or supply tenant authority. [4]

## References

[1]: https://developer.paddle.com/paddle-js/about/client-side-tokens/ "Paddle: Manage client-side tokens"
[2]: https://developer.paddle.com/build/checkout/build-overlay-checkout/ "Paddle: Build an overlay checkout"
[3]: https://developer.paddle.com/webhooks/about/how-webhooks-work "Paddle: How webhooks work"
[4]: https://developer.paddle.com/build/transactions/pass-transaction-checkout/ "Paddle: Pass a transaction to a checkout"
