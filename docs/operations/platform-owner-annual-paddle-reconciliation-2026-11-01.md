# Platform Owner annual Paddle / ERP reconciliation (2026-11-01)

## Issues found

The three paid plans had live active annual Paddle Price IDs but
`subscription_plans.yearly_price_cents` was NULL. The Platform Owner
Editor displayed $0/year and allowed arbitrary monthly/annual price
edits that would not change real Paddle catalog charges. The subscriptions
list omitted `billing_interval` and falsely described every active
subscription as monthly. The Platform Owner dashboards calculated MRR
with full monthly prices even when the customer subscribed for one year
at an additional 30% discount.

## ERP corrections applied

- Verified canonical prices backed by existing live Paddle price IDs:
  Starter $10/month and $84/year; Growth $20/month and $168/year;
  Enterprise $50/month and $420/year. Annual rate=12 * current
  promotional monthly price * 70%. Tax is determined at checkout.
- Backfilled `yearly_price_cents` for exactly these three live plans,
  precondition checking Paddle annual IDs, currency, existing amounts.
- `platform_owner_upsert_plan` now refuses attempts to edit monthly,
  yearly, currency or billing interval for Paddle-linked plans. Pricing
  in the Plan Editor is read-only, while resources/modules can still be
  updated. Price revision requires Paddle catalog migration and test.
- Protected manual `platform_owner_change_subscription_plan` from
  altering the ERP plan of a currently linked Paddle subscription without
  provider-side price/subscription update.
- Platform subscriptions RPC now provides current `billing_interval`,
  linked subscription marker, annual catalog amount. UI labels actual
  ACTIVE annual subscriptions "Annual", current TRIAL as "Trial",
  other non-active states as non-billed. Trial end remains separate from
  next billing. No attempt to auto-change customer billing cycles.
- Platform Owner plan cards now have monthly/yearly tabs, annual
  discount, tax disclosure, and a linked/unlinked/mismatch indicator
  using the actual yearly price ID.
- MRR and dashboard currency analysis use annual amount /12 for
  annual active subscriptions. Collected payments/cash remain
  based on actually PAID transactions, never inferred subscription value.
- New custom plans without Paddle catalog links show an explicit
  informational warning. ERP creation alone does not sell a plan.

## Read-back and safety

The live Supabase annual catalog readback was $84/$168/$420, with unchanged
Paddle monthly/yearly IDs and 3/5/15 branch quotas. Both SQL migrations
passed BEGIN/ROLLBACK checks before application. Server presence of both
price-lock guards was checked. No customer subscription, transaction,
plan change, trial period or payment was mutated.

Remaining: signed-in browser & physical mobile smoke test of Platform
Owner. GitHub/Vercel build and contract tests do not prove a signed-in
browser workflow or a real annual Paddle payment.
