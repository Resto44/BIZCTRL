# Automatic owner PDFs — seven complete business periods

This extends the owner-only report delivery contract from PR #217 and the control
center from PR #221. All seven frequencies are independently opt-in; the existing
daily schedule remains the default. Global pause still blocks every cadence.

| Code | Covered period | Dispatch at 08:00 Asia/Riyadh |
| --- | --- | --- |
| daily | previous local calendar day | every day |
| weekly | Saturday through Friday | Saturday |
| monthly | complete previous calendar month | first of next month |
| quarterly | Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec | first of Jan/Apr/Jul/Oct |
| semiannual | Jan–Jun or Jul–Dec | first of Jan or Jul |
| nine_months | consecutive non-overlapping nine-month calendar blocks anchored January 2026 | Oct 1 2026, Jul 1 2027, Apr 1 2028, ... |
| yearly | complete Jan–Dec calendar year | January 1 |

A user can select any subset of the seven. If multiple cadences are due on a
given day, each period gets a separate report; there is no single email
combining several PDFs. Each email includes its frequency, inclusive
start/end date and a single PDF attachment.

## Database / worker contract

- Existing `organization_report_email.enabled`, owner creator identity,
  verified-auth recipient, language, branch scope, retry and provider secrets
  stay unchanged.
- `report_frequencies` defaults to `['daily']` for existing and new tenants.
  Other cadences are opt-in only. Setting it to an empty list pauses all
  frequencies without altering the global switch.
- Queue uniqueness becomes `(restaurant_id, frequency, report_date)`; previous
  daily records migrate as daily with `period_start=report_date`.
- `report_email_claim` and lease-bound `report_email_context` both reject
  reports whose frequency has since been disabled.
- The stock reader and financial renderer use the complete [period_start,
  report_date] range, never only the final report day. Previous-period
  comparisons are computed using the same full cadence length.
- An immutable provider payload and idempotency key is retained for retry.
  Provider acceptance is not guaranteed Inbox delivery.
- No missed-period backfill. Dispatch runs only for the just-completed period
  when its calendar boundary occurs. No report is sent before enrollment.

## Rollout

1. SQL dry-run `BEGIN; <migration>; ROLLBACK;` and validate 7 calendar
   boundaries, schedule RLS and duplicate behavior.
2. Apply migration `20261030171200_owner_report_seven_periods.sql`.
3. Rebuild `report-bundle.js` from `scripts/build-automatic-report.mjs`;
   deploy the updated Edge handler and bundle together, preserving
   `verify_jwt=false` plus server-checked `x-dispatch-secret`.
4. Verify Edge worker authorization, empty-queue response and Cron still active.
5. Deploy the owner UI and test authenticated mobile toggles without turning on
   additional cadences for an existing live tenant.

## Important limitations

A complete year may be expensive to render for a large organization. Existing
financial row limits and PDF size limits should fail explicitly; never report
truncated totals as correct. New cadences can be enabled separately, and the
first naturally completed period will be sent on the corresponding boundary.
Long-period mail delivery and rendered PDF content must be verified with a
dedicated test organization before calling the cadence fully validated.
