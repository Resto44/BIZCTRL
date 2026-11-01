# Paddle upgrade recovery — preserving existing plans and capacity (2026-11-01)

## Root causes

1. Billing's generic Upgrade Plan button only scrolled to the beginning of
   the plans. For a four-branch tenant, Starter allows one branch and Growth
   only three; only Enterprise's ten branches can fit existing resources.
2. Paddle adapter sent anyone with a `paddle_customer_id` to the hosted
   subscription portal, even if no `paddle_subscription_id` existed. A failed
   first checkout often creates the customer without a subscription, so this
   produced `PADDLE_CUSTOMER_PORTAL_NOT_AVAILABLE`.
3. The protected `paddle_create_checkout_context` RPC changed the canonical
   subscription plan and status to `PENDING_PAYMENT` before Paddle succeeded.
   On a failure with no provider subscription, the webhook then set
   `PAST_DUE`, incorrectly revoking previously authorized trial access.

## Fix

- Server RPC now records only the pending `subscription_payments` and event;
  it does not mutate the canonical active/trial entitlement.
- Signed webhook retains failed payment and event audits, but never revokes a
  different existing subscription when a payment attempt has no provider
  subscription ID. Genuine linked past-due subscriptions remain handled by
  normal Paddle lifecycle rules.
- Paddle adapter opens the hosted portal only when the tenant has both a
  valid Paddle customer ID and a valid Paddle subscription ID. It otherwise
  goes through the normal guarded Checkout with the requested period.
- Billing highlights and scrolls directly to the least-expensive plan that
  can cover current branches/users/employees. Under-capacity plans have
  clear disabled checkout buttons. Users must deliberately click a plan to
  initiate payment; simply clicking Upgrade never creates a payment.
- Show an actionable failed-payment note while respecting existing active
  or trial entitlement. Portal management is hidden without a linked sub.

## Verified correction and safety

- Historical audit showed a verified Trial extension through December 1,
  followed by one unapproved annual Paddle checkout and a failed transaction,
  with no actual new Paddle subscription or captured payment.
- A guard-specific, one-row recovery restored the previously authorized
  Enterprise Trial and left the failed payment/audit intact.
- Authenticated customer snapshot read-back: Enterprise, Trial, Dec 1,
  ERP access true, four active branches of ten permitted.
- Transactional rollback-only owner checkout-context test confirmed that a
  new yearly pending request keeps the current plan/status unchanged.
- This fix does not authorize new access beyond the pre-existing verified
  trial and does not create any real Paddle transaction or charge.
- Card failures remain separate from the app routing fix and may require
  bank/card actions by the customer. No automatic retry or charge.

## Pending

Preview build and targeted CI, followed by signed-in iPhone plan selection and
checkout confirmation. A Vercel READY build does not prove that Paddle charged
or issued a new subscription.
