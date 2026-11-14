# Automatic emailed Owner PDF: Driver Sales parity (2026-11-14)

## Evidence and root cause

- Owner dashboard PDF for 2026-11-14 has three pages. Page 3 includes Network Management and **Driver Sales · Trends & Analytics**, with the driver trend and top-driver panel.
- Previously emailed daily PDF for 2026-11-12 has three pages but **omits the Driver Sales panel**. The two dates differ: this is a missing-section comparison, NOT a comparison of their daily financial totals.
- The Vercel React app and the separate Supabase `automatic-report-email` Edge worker are deployed independently. The production worker was version 5, built before Driver Sales was added to the shared third page: its deployed `report-bundle.js` had no `driver_sales_entries` source read or `REPORT_DRIVER_APPENDIX_MISSING` guard.
- The repository's current canonical `buildAutomaticReportPdf` already reads `driver_sales_entries` and `drivers` scoped to restaurant, period and branch and refuses to send missing data. The Owner PDF renderer draws the Driver Sales portion **within the existing third A4 page**, below Network Management.

## Production remedy

1. Validate the repository PDF calculation/report tests in all three languages (en, ar, fa); validate the Driver Sales fixture has a finalized current and prior closing without double counting revenue.
2. Build `report-bundle.js` using `node scripts/build-automatic-report.mjs`, then run `node scripts/pack-automatic-report-edge.mjs`: missing Driver Sales, Network Management, or either protective error marker fails CI.
3. Deploy `index.ts`, `handler.ts` and the exact tested generated `report-bundle.js` together to Supabase `automatic-report-email`. Preserve `verify_jwt: false`, the secret-based `x-dispatch-secret` authorization and all existing schedules/recipients.
4. Read the deployed function back; require `REPORT_DRIVER_APPENDIX_MISSING` in `handler.ts` and `report-bundle.js`; require `driver_sales_entries`, `Driver sales trend`, and `REPORT_NETWORK_APPENDIX_MISSING` in the bundle.
5. Check the next naturally scheduled newly generated email PDF. Do not invoke the dispatcher simply for testing: doing so might send a real email. An accepted email is not itself proof that a physical inbox received it.
6. Already sent PDFs are immutable. Never alter/replay frozen email payloads or provider idempotency keys to repair historical attachments.

## Verified release

2026-11-14: production Supabase `automatic-report-email` **version 6**, status ACTIVE, read-back confirmed:
- `report-bundle.js`: Driver Sales drawing, `driver_sales_entries`, `REPORT_DRIVER_APPENDIX_MISSING`, Network appendix and guard all present;
- `handler.ts`: driver-missing failure code handled; existing dispatcher-secret check preserved;
- `verify_jwt`: false (unchanged), no schema migration, cron/recipient changes, or dispatch used for testing.

Production Vercel alone cannot update the emailed report. An actual future delivered email with the driver panel still requires end-to-end confirmation after the next scheduled send.

## Finance safeguards

The driver amounts are already part of finalized/locked Sales Closing. Driver collections are attribution and must not be added to total revenue, payment mix or network receipts again. Missing/unavailable driver inputs should fail rather than be silently labelled as zero.
