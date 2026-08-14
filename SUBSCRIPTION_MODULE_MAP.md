# Subscription Module Enforcement Map

The RestoCTRL ERP uses the canonical `subscription_plans → subscriptions → subscription_usage → subscription_events → subscription_payments` model. The browser guard improves navigation clarity, while the database policies, capacity triggers, usage procedures, and RLS rules remain the enforcement boundary.

| Plan feature | Included plan(s) | Routed ERP modules | Backend enforcement |
| --- | --- | --- | --- |
| Core operations | Free and all paid plans | Sales, purchases, expenses, inventory, basic reports | Subscription access scope checks on tenant-scoped RLS policies. |
| Treasury, suppliers, PDF export, OCR | Starter, Growth, Enterprise | Treasury, supplier operations, PDF operations, OCR | Catalog feature flags; transactional metering for PDF, OCR, and storage; OCR table restrictive policy. |
| Advanced analytics | Growth and Enterprise | Oracle analytics, branch analytics, CEO dashboard, price optimization, BI center | Route feature guard; restrictive `product_analytics` policy. |
| Scheduled reports | Growth and Enterprise | Scheduled reports | Route feature guard; restrictive `scheduled_reports` policy. |
| Cash-flow forecasting | Growth and Enterprise | Cash-flow projection | Route feature guard; plan feature flag is evaluated server-side for protected data access. |
| Driver analytics | Growth and Enterprise | Driver management | Route feature guard; restrictive `drivers` policy. |
| Network management | Enterprise | Network management and aliases | Route feature guard; restrictive policies on network accounts, devices, transfers, and reconciliations. |
| AI copilot | Enterprise | AI business copilot | Route feature guard; plan feature flag gates the route. A future AI service adapter must call `erp_subscription_can_use_feature('ai_copilot')` before execution. |

## Capacity and Metering

The database trigger `erp_enforce_subscription_capacity` blocks resource creation beyond restaurants, branches, employees, and users. The server procedure `erp_consume_subscription_usage` atomically enforces OCR, PDF-report, and storage limits. `PENDING_PAYMENT`, `PAST_DUE`, `CANCELED`, and `EXPIRED` subscriptions do not satisfy `erp_subscription_has_erp_access`, so tenant-scoped operations are blocked regardless of route visibility.

## Billing Provider Safety

The active client adapter is `MockTestPaymentProvider`. It invokes only server-side functions and cannot create a real charge. A paid selection creates a `PENDING_PAYMENT` subscription with a `pending` **TEST ONLY** payment. Only an approved organization owner can invoke the test lifecycle functions, and only after the server-side TEST MODE setting has been enabled in a non-production environment.

