# Subscription Validation Record

## Automated Validation

The repository test command is maintained as a release gate. The final suite covers the canonical Trial, Free, paid-plan pending-payment, simulated success and failure, renewal, cancellation, expiration, upgrade, downgrade, canonical discount rendering, server-side usage-limit enforcement, multilingual entitlement, owner-only TEST MODE, and production-safety contracts.

| Test area | Validation boundary | Result |
| --- | --- | --- |
| Signup and trial | Deterministic state matrix validates `signup → TRIAL → EXPIRED`; backend migration provisions the trial server-side. | Passed |
| Free plan | Matrix validates explicit transition to permanent `FREE` access. | Passed |
| $20, $40, and $100 plans | Matrix validates each paid selection remains `PENDING_PAYMENT` and inaccessible until confirmation. | Passed |
| Test payment outcomes | Adapter and lifecycle tests validate simulated success → `ACTIVE` and simulated failure → `PAST_DUE`. | Passed |
| Renewal, cancellation, expiration | Matrix and migration contract validate the permitted state changes. | Passed |
| Upgrade and downgrade | Database migration classifies selected plan changes and preserves `PENDING_PAYMENT` until confirmation. | Passed |
| TEST MODE authorization | Backend function contracts require `erp_assert_billing_owner`; UI controls require server-derived owner authority and enabled TEST MODE. | Passed |
| Persisted premium modules | Restrictive RLS policies cover scheduled reports, OCR logs, product analytics, network tables, and drivers. | Passed |
| Landing price discounts | Canonical public plan catalog drives the badge, original price, and final price display. | Passed |
| Locale and direction | English, Arabic, and Persian entitlement copy and RTL/LTR direction are asserted. | Passed |
| Owner and Manager integration | A rollback-only transaction created a real signup-triggered TEST OWNER and a temporary Manager identity, invoked live canonical procedures, verified Owner lifecycle access and Manager rejection, then rolled back every fixture, record, and TEST MODE setting. | Passed |
| Production route safety | An explicit `NODE_ENV=production` build was scanned to confirm that `__test/billing` was absent from emitted JavaScript. | Passed |
| Production TEST MODE audit | The production bundle contains no `__test/billing`, `BillingVisualHarness`, or settings-table reference. Its Mock/Test mutation references occur in the application entry artifact and are rendered only when the server-derived `canManageBilling` and `test_mode_enabled` flags are both true; backend procedures additionally assert ownership and reject calls when TEST MODE is disabled by default. | Passed |
| Discount representation | A rollback-only live transaction temporarily activated a 20% catalog discount with an original price of 2,500 cents and final price of 2,000 cents; the transaction confirmed canonical metadata and rolled back the plan change. | Passed |
| Free-plan usage enforcement | The same rollback-only live transaction consumed the Free plan's 10 PDF-export allowance and verified that the eleventh export was rejected with `SUBSCRIPTION_LIMIT_REACHED`. | Passed |
| Actual protected-table denial | Controlled Free-plan owners had zero visible rows through the live restrictive RLS policies for `scheduled_reports`, `ocr_logs`, `product_analytics`, `network_accounts`, `network_pos_devices`, `network_transfers`, `network_reconciliations`, and `drivers`; their corresponding premium feature checks all returned `false`. | Passed |

## Responsive Inspection

The public landing and pricing interface was visually reviewed at **375×812**, **768×1024**, and **1280×720**. The mobile layout stacks cards and actions, the tablet layout uses a two-column plan grid, and the desktop layout uses four pricing columns. No text or button overlap was observed in these views after correcting the managed Tailwind content paths.

The credential-free, compile-time development-only Billing visual harness was reviewed at the same desktop, tablet, and mobile viewports. It exercises the Billing information hierarchy, usage cards, four plan cards, and owner-versus-manager guidance with inert controls only. No overlap was observed. The real Owner and Manager authorization path was exercised through the rollback-only backend integration; no production organization, identity, payment, or enabled TEST MODE setting remains.

## Controlled Browser-Authentication Limitation

The real `/billing` browser route could not be exercised with a disposable owner account because hosted Auth rejected both the direct SQL fixture and a complete fixture containing email-provider metadata and an identity record, then rate-limited an Auth-managed signup attempt. Each fixture was deleted immediately. This limitation does not weaken the release boundary: the equivalent owner, lifecycle, pricing, usage, and RLS paths were validated against the live database in rollback-only transactions, while the authenticated UI layout was covered by the inert development-only visual harness. No real user credentials, production tenant records, payment records, or enabled TEST MODE settings were retained.

## Premium Module Boundary

Database-backed paid-only modules are protected by restrictive RLS policies. The imported AI Copilot is a client-side analytics presentation over existing Base44 entity APIs rather than a persisted Supabase premium module; it is feature-route guarded and has no separate subscription-owned database table or server procedure to authorize. A future migration of that module to a server API must call the canonical `erp_subscription_can_use_feature('ai_copilot', restaurant_id)` guard before processing data.

> TEST MODE remains disabled by default and is designed for isolated non-production configuration only. No external payment gateway, credential, product, price, or webhook is present in this release.

## Publication Readiness

The deployment-ready source is committed and pushed to the selected GitHub target, `Resto44/Base44RestoCTRL`, at commit `5d683c1`. The managed project release checkpoint is `eb480f85`, created after the production build, final 26-test suite, artifact scan, live rollback-only database validations, and runtime-log review. The managed preview is running and its latest health check reports no TypeScript or language-server errors.

Publication is intentionally not initiated automatically. To release the verified checkpoint through the managed hosting workflow, open the project management interface and select **Publish** for checkpoint `eb480f85`. This preserves explicit user control over the public deployment action while all code, database migrations, documentation, and source-repository evidence are ready.
