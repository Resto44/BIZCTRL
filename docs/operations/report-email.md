# Report email

ScheduledReports now uses the production `scheduled_reports` schema (`recipients`, `restaurant_id`, `branch_id`, `last_sent_at`). Save stores settings only. It does not send an email.

Deploy `supabase/functions/scheduled-report-email` with JWT verification enabled. Configure server-only `RESEND_API_KEY` and `REPORT_EMAIL_FROM` using a domain verified with Resend. Never put these in VITE variables. The endpoint also verifies the user and enforces existing subscription/tenant/branch RLS and write authorization.

Send now generates the canonical ERP PDF for the saved restaurant, branch and daily/weekly/monthly current period, using the Riyadh business date. It sends to the saved recipient list. Provider acceptance is not proof of inbox delivery. The timestamp changes only after provider acceptance. Errors and missing setup are surfaced in Arabic, Persian and English.

Automatic execution is **not implemented**. The API reports `automatic:false` and the UI disables the scheduling switch instead of promising background delivery. A background worker with server-side canonical report generation, persistent delivery jobs, tenant/subscription checks, retries and idempotency must be added before enabling daily/weekly/monthly automatic sending.

Validation: unit tests cover the real schema payload, validation, read failures, gateway failures, authorization, provider rejection and provider acceptance. A transactional insert against production was rolled back. No email was sent during development, and signed-in mobile/inbox delivery remains unverified.
