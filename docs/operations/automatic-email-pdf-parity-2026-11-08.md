# Automatic emailed PDF parity — November 8, 2026

## Root cause
Manual BizCTRL PDF uses `src/lib/salesAnalyticsPdf.js`, which appends the Network Management branch intelligence page after the two financial pages.
The daily/weekly owner email is **not generated on Vercel**. It runs as the separate Supabase Edge Function `automatic-report-email`, which imports a compiled bundle from `scripts/build-automatic-report.mjs`.
The live Edge function remained at version 4 from November 2 and contained a pre-Network appendix `report-bundle.js`. This explains 3 manual pages versus 2 emailed pages.

## Production release runbook
1. Modify shared source, and test English/Arabic/Persian PDF output. The Worker now raises `REPORT_NETWORK_APPENDIX_MISSING` if the full-scoped report does not include all expected Network appendix pages (`2 + max(1, ceil(branch count / 8))`).
2. Compile: `node scripts/build-automatic-report.mjs`. Validate the resulting file contains `REPORT_NETWORK_APPENDIX_MISSING`, `Network Management`, and `Finalized network operations`. `node scripts/pack-automatic-report-edge.mjs` produces 95,000-codepoint checksummed parts for restricted deployment transport.
3. Deploy **all three** Edge files from the exact tested commit: `index.ts`, `handler.ts` and the newly generated `report-bundle.js`. Preserve `verify_jwt: false` and the existing server-only `x-dispatch-secret` check and cron configuration.
4. Read back the deployed function and verify compiled-bundle hash/string markers; an unauthenticated POST **must** return HTTP 401, without claiming a queued job.
5. Verify the next naturally scheduled owner's new email PDF. Do **not** trigger the dispatcher solely for testing without authorization: it may claim and send an actual organization report.
6. A previously sent PDF is immutable. A frozen retry payload must keep its original provider idempotency key/body even if the source code is updated; change applies to **newly built** reports only.

## Financial safety
The third page is read-only, derived from the same finalized/locked sales and already scoped branches. Card/network is included in sales totals already and must never be added as additional revenue.
The email worker retains tenant/branch access checks, calendar-exact reporting periods, and provider persistence before send.

## Regression
- `tests/networkManagementPdfAppendix.test.js` — manual full report 3+ pages.
- `tests/automaticOwnerReportControls.test.js` — automatic reporting scope + fail closed on missing appendix.
- `tests/automaticEmailNetworkPdfParity.test.js` — rendered Arabic, Persian, English automatic reports: real PDF and 3 pages.
