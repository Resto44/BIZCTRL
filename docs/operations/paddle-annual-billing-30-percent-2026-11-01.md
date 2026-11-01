# BizCTRL annual billing: additional 30% discount (Paddle)

## Source of truth and prices

Annual price = round(current discounted `monthly_price_cents * 12 * 0.70`).
This is **additional to the existing 75% promotional monthly price**, not
30% of original catalog list price. Current live plans: Starter $10/mo →
$84/year, Growth $20/mo → $168/year, Enterprise $50/mo → $420/year.
Annual purchase renews **once a year** at the annual catalog price; it is
not a one-time 12-month lump payment for a monthly subscription. Paddle may
calculate applicable tax; checkout owns the final payable amount.

The first-month trial (if configured for a monthly plan) is shown only
when monthly billing is selected. We do not silently add a 30-day free trial
to a paid annual subscription.

## Live Paddle catalog orchestration

Paddle has no dedicated connected account tool in this session. The live
authenticated Edge function `paddle-subscription-checkout` provisions an
annual recurring **catalog price** at the moment the billing owner selects
yearly checkout. It requests the existing monthly catalog price via GET
`/prices/{id}`, checks product ID, monthly interval, exact USD minor-unit
price against the server's current plan, then creates a yearly `/prices`
entry with the 30% annual amount and a one-year billing cycle. The price
is linked atomically in `subscription_plans.paddle_annual_price_id` through
a service-role-only RPC, then a guarded pending checkout context is created
and a Paddle transaction uses that price ID.

The live API credential must include **price.read** and **price.write**.
If prices are mismatched or permissions are missing, the code fails closed
without creating a misleading monthly transaction. A duplicate first-time
request can provision an unused second annual catalog price; only the first
stored price ID is used for payment.

## Entitlement and webhook

- Client passes only planId and month/year choice. Server determines tenant,
  plan, currency, price, amount and immutable payment association.
- Signed Paddle webhook remains the only subscription entitlement authority;
  it checks exact payment metadata price ID and monthly/yearly catalog ID
  before applying status and the Paddle-reported billing period.
- New `subscriptions.billing_interval` is stored only on successful
  active/trial provider status; expiry continues to follow the real Paddle
  current period end. Monthly legacy checkout RPC stays available.
- Existing Paddle subscriptions continue through Paddle's hosted portal;
  this change does **not** promise a self-serve prorated mid-cycle cycle
  switch, which requires a separate provider-supported amendment workflow.
- Manual IBAN yearly checkout is deliberately blocked for now: its existing
  monthly RPC would otherwise invoice the wrong price.
- No user payments or subscription statuses were changed by rollout.

## Verification and limitations

SQL BEGIN/ROLLBACK passed, annual plan quotes 8400/16800/42000 cents,
authenticated owner's read-only quote passed. Test-first UI and contract
coverage added. Edge function deployed with existing JWT verification.

Still required: one owner-authorized **real Paddle checkout**
and webhook/inbox confirmation, plus an actual iPhone/Android Billing screen
check. Vercel READY only proves app build. If Paddle API price read/write
permissions are absent or monthly price catalog differs from DB, annual
checkout will fail safely and needs provider configuration.
