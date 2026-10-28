# Report email

ScheduledReports now uses the production `scheduled_reports` schema (`recipients`, `restaurant_id`, `branch_id`, `last_sent_at`). Save stores settings only. It does not send an email.

Deploy `supabase/functions/scheduled-report-email` with JWT verification enabled. Configure server-only `RESEND_API_KEY` and `REPORT_EMAIL_FROM` using a domain verified with Resend. Never put these in VITE variables. The endpoint also verifies the user and enforces existing subscription/tenant/branch RLS and write authorization.

Send now generates the canonical ERP PDF for the saved restaurant, branch and daily/weekly/monthly current period, using the Riyadh business date. It sends to the saved recipient list. Provider acceptance is not proof of inbox delivery. The timestamp changes only after provider acceptance. Errors and missing setup are surfaced in Arabic, Persian and English.

## Automatic owner reports

New owner organizations are enrolled automatically when their approved owner membership is created. The creator is matched through the restaurant's canonical `tenant_id`; staff invitations do not enroll anyone. The recipient is resolved from the owner's current **verified auth email**, not editable metadata, saved manual recipients or an address supplied to the worker. Existing organizations are not bulk-enrolled. The current owner's organization was explicitly enrolled during rollout.

Daily delivery starts at **08:00 Asia/Riyadh**, beginning the day after enrollment, and covers the previous calendar day across all branches. The server uses the same financial data reader, calculations, embedded Arabic/Persian fonts and two-page PDF renderer as Send now. The report labels default to English; Arabic/Persian organization and product names remain supported. Owner membership, verification, active organization and subscription are rechecked before every send. Owners can pause/resume their automatic report in Scheduled Reports without re-entering an email.

Custom daily/weekly/monthly rows remain manual: their endpoint still returns `automatic:false`. This is independent of the new dedicated automatic-owner card.

### Deployment

1. Apply `20261028085908_automatic_owner_report_email.sql`. Its dispatch cron is initially inactive.
2. Run `node scripts/build-automatic-report.mjs`. Deploy `index.ts`, `handler.ts`, and generated `report-bundle.js` from `supabase/functions/automatic-report-email`. The bundle is generated, not committed.
3. Deploy with gateway JWT verification **off**: the handler independently requires the 256-bit `x-dispatch-secret` credential stored in Vault. Its retrieval RPC, claim RPC and lease-bound context RPC are service-role-only. Existing `RESEND_API_KEY` and `REPORT_EMAIL_FROM` secrets are reused. Never expose the dispatch secret or service role in frontend code or logs.
4. Verify unauthenticated POST returns 401, authorized empty queue returns `processed:0`, signup/verification/RLS tests pass, and a real PDF is accepted and delivered by the provider.
5. Deploy the owner control UI, then activate:

```sql
select cron.alter_job(
 (select jobid from cron.job where jobname='automatic-owner-report-email'),
 active:=true
);
```

The cron polls every minute and dispatches at most five workers per poll. Each worker atomically leases one due job with `FOR UPDATE SKIP LOCKED`. One row per organization/report date and a stable provider idempotency key prevent duplicate sends. The exact recipient, sender, subject and PDF payload are persisted before the first provider call and reused on retries. A changed verified email cancels an old pending payload rather than sending to an outdated address. There are at most six attempts within 12 hours, below the provider's 24-hour idempotency retention. Rate-limit/network failures retry after 10 minutes. No multi-day backlog is sent. Provider quotas still apply.

### Monitoring and rollback

```sql
select jobname, schedule, active from cron.job
where jobname in ('automatic-owner-report-email','report-email-retention');
select id, restaurant_id, report_date, state, attempts, provider_id, last_error
from public.report_email_deliveries order by created_at desc limit 50;
```

`accepted` means provider acceptance, not inbox placement. Confirm delivery in Resend using `provider_id`. The queue intentionally has RLS with no public policies and no anon/authenticated grants: only the worker can access financial payloads. Payloads are removed immediately on success/cancellation, otherwise after 24 hours; metadata is retained for 30 days. To stop all automatic sends, disable the dispatch cron and set `organization_report_email.enabled=false`; manual Send now is independent. Pausing does not retract a message already accepted by the provider.

### Rollout verification (2026-10-28)

- 24 manual/automatic handler and payload tests passed, including immutable retry payloads, rejected credentials, configuration failures, revoked eligibility and no-send-before-persistence.
- Transactional signup tests passed and were rolled back: enrollment, unverified-email exclusion, verified-owner eligibility, duplicate prevention, owner pause, denied owner reassignment, denied public worker RPC and cross-tenant read isolation.
- Generated server PDF fixture: 178,017 bytes; real server-generated previous-day PDF accepted on the first attempt.
- Resend message `01a18286-f489-776a-a422-4be67d2618b0`, report date `2026-10-27`, showed **delivered** to the current organization's registered owner email. A repeated claim returned no work. Inbox placement and a physical signed-in mobile device are not verified.
