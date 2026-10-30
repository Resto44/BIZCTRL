# Owner PDF control center

This change extends PR #217 without re-enrolling any existing tenant, changing the
08:00 Asia/Riyadh schedule, or relaxing the server-only provider credential.

## Safe rollout order

1. Review `20261030160000_owner_report_control_center.sql`. Run a rollback-only
   authorization/branch validation check using a non-production fixture first.
2. Apply the migration before releasing the UI: it adds owner-controlled language
   and a single branch selector (default remains English, all branches), owner-only
   metadata history RPC and audit RPC, and write-triggered audit.
3. Build and deploy the automatic-report-email bundle again, using
   `node scripts/build-automatic-report.mjs`. The updated renderer reads the
   verified owner settings from the server-side lease-bound context.
4. Promote the UI only after the two RPCs are available and worker / no-job
   safety checks pass. Test the control on a signed-in iPhone.
5. Observe the next 08:00 execution and validate attachment language/branch
   by opening the PDF in the verified owner mailbox.

## Security

- Owner membership/creator identity is enforced server-side by RLS and both
  RPCs. Managers/staff cannot read another owner's history or audit.
- The delivery history RPC returns only metadata: date, state, attempts,
  provider ID and error code. No addresses, secrets or financial attachments.
- The selected branch must belong to the same restaurant. Both the DB
  validator and the PDF renderer fail closed on cross-tenant branch IDs.
- Preference changes are logged by an audit trigger; service-role updates of
  acceptance metadata do not create false owner audit events.
- Provider "accepted" must never be called "delivered" or "inbox received".
  Inbox and provider event verification remain operational checks.

## Mobile acceptance checklist

- Owner signed in, toggles stay changed after page refresh.
- Switcher does not reveal controls to a manager or another tenant.
- Arabic and Persian layout fits iPhone width without horizontal overflow.
- 7/30 day history and audit expand, load and show actionable failures.
- Manual saved reports show "Manual send only", not an inert automation switch.
- Repeated worker claims create no second previous-day delivery.
- Do not toggle a live tenant only for demonstration; use a dedicated test tenant.

## Rollback

Hide/remove the new UI and redeploy the previous worker bundle if necessary.
Leave the additive columns and audit/history schema in place until a separate
reviewed rollback migration. Disabling dispatch cron temporarily stops automatic
sending; do not disable it during ordinary UI troubleshooting.
