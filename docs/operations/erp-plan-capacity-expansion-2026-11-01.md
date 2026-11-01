# ERP paid plan capacity expansion — 2026-11-01

User-approved branch caps: Starter 3 / Growth 5 / Enterprise 15.
Other paid limits were raised in a tiered, finite way. This is an
upgrade of capacities only; prices, Paddle IDs, trial periods, active plans,
billing cycles and features are unchanged.

| Resource | Starter | Growth | Enterprise |
|---|---:|---:|---:|
| Restaurants / organizations | 2 | 5 | 15 |
| Branches | 3 | 5 | 15 |
| Users | 10 | 25 | 75 |
| Employees | 20 | 50 | 150 |
| Storage (GB) | 10 | 50 | 200 |
| PDF exports | 250 | 1,000 | 5,000 |
| OCR scans | 150 | 750 | 2,500 |
| Monthly USD | 10 | 20 | 50 |
| Annual USD (Paddle) | 84 | 168 | 420 |

The old **Free** (inactive and hidden) catalog plan is unchanged.
Legacy migration files and historical snapshots remain immutable.

## Canonical data and safety
- Supabase `subscription_plans` is the authority; new values apply to all
  existing paid tenants without modifying their active subscription records.
- `erp_subscription_capacity_state`, `erp_enforce_subscription_capacity`,
  `erp_subscription_snapshot`, metered usage and organization creation checks
  consume the plan record, not separate front-end hard-coded limits.
- Clear obsolete duplicate keys from `entitlement_limits` for updated
  resources only; other resource settings (products, suppliers, transactions,
  API, etc.) are preserved, including unlimited (`-1`) values.
- Platform Owner upsert uses the existing row when a quota was omitted,
  preventing older screens from resetting PDF/OCR/storage quotas to zero.
  It preserves authentication and audit. Current UI includes the new quotas.
- Landing, Billing and Platform Owner show current catalog quotas.
- A tenant using **4 branches** can now select Growth; Starter remains
  insufficient, Enterprise also fits. Plan selection still requires owner
  action and confirmed payment, never auto-migrates tenants.

## Verification
- Forward-only migration validated inside BEGIN/ROLLBACK before apply.
- Live Supabase catalog read-back showed all new values and unchanged
  monthly price and Paddle annual/monthly price IDs.
- Subscription active trial and payment history were not modified.
- Regression tests verify plan choice, localization, catalog and owner
  edit protection. Signed-in mobile smoke test is still needed before
  claiming live UX behavior is verified.

## Commercial caution
OCR and storage consume real compute/storage. Monitor usage and provider
costs after release; increasing capacity does not by itself guarantee
infrastructure availability or add new product functionality.
