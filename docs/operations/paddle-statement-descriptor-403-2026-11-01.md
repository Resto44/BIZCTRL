# Paddle bank statement descriptor — attempted update (2026-11-01)

Goal: set the merchant account-level statement descriptor to `BIZCTRL`.

**Paddle current API**: `PATCH https://api.paddle.com/settings/statement-descriptor`
with `{"name":"BIZCTRL"}` requires `statement_descriptor.write`.
An independent `GET` of the same setting requires `statement_descriptor.read`.

## Result
- A signed, server-only one-time request was executed using the existing
  production Paddle key stored in Supabase Edge secrets.
- Paddle returned **HTTP 403** / code **`forbidden`**. The token does
  not have access to update statement descriptor settings.
- **No change to the account descriptor was applied or verified.**
- Run audit in `paddle_descriptor_change_jobs`, status `failed`,
  API error `forbidden` only; no Paddle API credentials stored there.
- The temporary Edge function was immediately redeployed as a
  permanent HTTP 410 stub with JWT authentication enabled.
- This work does not affect invoices, subscription prices, payments,
  customer accounts, billing cycles or webhooks.

## To finish
Paddle account administrator can either:
1. In Paddle Dashboard -> Checkout Settings -> Statement Descriptor,
   enter `BIZCTRL` and save; or
2. In My account -> Settings -> Authentication -> API keys, edit the
   existing production key permissions to include
   `statement_descriptor.write` and ideally `statement_descriptor.read`.
   Then an authorized backend operation may retry the API update.

Do not paste any Paddle API key into ChatGPT. Use the Paddle dashboard's
permission editor or update Supabase Edge secrets directly if rotating keys.

A successful card statement normally shows `PADDLE.NET* BIZCTRL`.
Actual bank apps may truncate or show Paddle alone, and PayPal descriptor
cannot be customized. Previously declined card attempts are historical and
will not be renamed by a future descriptor change.
