# Help Center — 2026-10-13

Implemented a read-only public `/help` route and an embedded guide tab in `/support`.
The public route does not load tenant records and remains reachable without a valid
subscription or authenticated portal session. Existing destination route guards
continue to enforce permissions; the guide's role filter is informational only.

## Content reviewed

32 articles, each with English, Arabic and Persian titles, three ordered steps and
an operational note. `src/lib/helpArticles.js` records the source file reviewed for
each article. Topics cover onboarding, daily work, branches and staff access,
products/import, inventory, restaurant/retail POS, closing, suppliers and payments,
purchasing, expenses, treasury periods, network settlement, customer credit,
payroll, reporting/PDF, alerts, approvals, billing, role portals, troubleshooting,
finance settings, scheduled reports, promotions/loyalty, tasks, advanced analytics
and Telegram. Existing route definitions were checked for every article action.

The guides distinguish sales from cash, payment from invoice creation, purchase
orders from receipt, forecasts from actual records, and saved schedules/integrations
from confirmed delivery. They do not advertise disabled driver/customer logins,
guarantee third-party delivery, or promise accounting reconciliation for historical
data. Existing supplier discrepancies remain subject to investigation.

## Navigation and reliability

Search supports Arabic/Persian letter variants and all three language versions.
Topic/role filters, article links and expanded state are URL-backed. Native labelled
inputs, expanded-state buttons, ordered steps and responsive wrapping support
keyboard and narrow-screen use. Help links added to login and independent role
headers; the existing Support menu opens guides by default, retaining the ticket tab.
Support now reads `lang` from LanguageContext, shows fetch errors with retry, and
accepts native/serialized attachment arrays without crashing on malformed data.

## Verification and limits

9 focused tests cover content completeness, real routes/source files, search and
filters, Persian/Arabic rendering, article expansion, empty search, support query
isolation, app language, failed ticket fetch/retry and malformed attachments.
Changed source passes ESLint; production build passes. These are code and renderer
checks, not authenticated production transactions or a physical iPhone usability
session. This work documents existing workflows; it is not a whole-system financial
or security audit. Update the article and review date when its workflow changes.
