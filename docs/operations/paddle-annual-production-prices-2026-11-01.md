# Paddle production annual subscription prices — 2026-11-01

## Completed catalog registration (Production)

The annual Paddle catalog was previously unconfigured despite annual billing
UI and signed checkout being deployed. With explicit owner instruction, we
created and independently read back three *recurring yearly* Paddle prices,
matching the currently discounted monthly USD catalog:

| BizCTRL plan | Monthly | Annual (12 x monthly x 0.70) | Paddle annual price ID |
| --- | ---: | ---: | --- |
| starter_20 | $10 | $84 | pri_01m6bax5b0hys34kvzz8kwzypm |
| growth_40 | $20 | $168 | pri_01m6bax67cbsrg2dt4d5myqv9d |
| enterprise_100 | $50 | $420 | pri_01m6bax73yy3yrab1mzz4gm3bt |

Every price passed direct Paddle API read-back: same parent product as the
verified monthly price, USD currency, exact minor-unit amount, `year`
interval, frequency `1`, active status. All three IDs were registered in
`subscription_plans.paddle_annual_price_id` using the existing
`paddle_register_annual_price` RPC.

## Security and safety

For this maintenance only, we used `pg_net` to invoke a temporary Supabase
function with a SHA-256 hashed 256-bit one-time token, 10-minute expiration,
and service-role-only atomic claim. The first attempt did not run price
writes due to missing `PADDLE_ENVIRONMENT`, so the handler was aligned to
the existing Checkout production default and retried with a fresh token.

The successful request returned HTTP 200 and all three plans `verified`.
The one-time Edge function was then redeployed as a permanent 410 Gone stub,
with JWT verification turned **on**. It cannot provision more prices.

The normal `paddle-subscription-checkout` Edge function remains at v22,
with JWT verification on, and annual billing quote and price matching.

No Paddle transactions, customer subscriptions, billing interval changes,
or invoices were created by this operation. On final SQL read-back, annual
payment requests remained zero.

## Remaining commercial end-to-end check

One signed-in owner should open a **yearly checkout** and confirm that Paddle
shows the same annual price and any tax. Do not pay merely to test catalog
registration. Real annual subscription creation, webhook activation, and
renewal date require an actual customer purchase to verify, and are not
claimed as tested here.
