# ERP two-page PDF — prominent financial executive summary (2026-11-02)

All existing **manual** exports from Reports and Scheduled Reports use the same canonical
`generateSalesAnalyticsPDF` and `drawTwoPageERPReport`. The October 2026 owner PDF
had a sales-only first page and small, scattered expense/profit KPIs on page 2.
With eight accounting measures as 4 columns × 2 rows at the top of page one,
the owner can immediately read all key numbers before the charts.

## First page, eight financial cards

1. Total finalized sales **across all sources** (already includes cash, network, credit and other).
2. Approved purchase invoices — *not* necessarily consumed raw materials.
3. Allocated portion of monthly fixed expenses for the selected date range.
4. Variable expenses in the selected date range.
5. Total operating expenses = allocated fixed + variable, **excluding purchases**.
6. Purchases plus operating expenses (a separate total to prevent ambiguous totals).
7. Gross purchase-based proxy = sales − approved purchases, **not true COGS gross profit**.
8. Net operating proxy = sales − purchases − operating expenses, **not audited net profit**.

Each card uses a large abbreviated value (e.g. **25.9K**, **−2.4K**) with the
exact, two-decimal `SAR` amount below it. Financial figures are taken from the
existing tenant-scoped `buildSalesReportSnapshot`. The source-breakdown rows in
the lower reports are **not added again**. Red denotes a negative result.
Language-aware labels support English, Dari/Persian, and Arabic and the existing
font shaping. Dense charts/tables stay below the new executive section.

### Source reconciliation fixture, October 2026
- Sales 25,867.00 SAR; purchases 26,570.65 SAR.
- Fixed allocated 650.07 SAR; variable expenses 1,084.00 SAR.
- Total operating expenses 1,734.07 SAR.
- Purchases + expenses 28,304.72 SAR.
- Gross purchase-based estimate −703.65 SAR.
- Net operating estimate −2,437.72 SAR.

### Delivery and testing
- Same source generator produces browser manual PDF via Reports and ScheduledReports.
- The **automatic owner Edge worker** uses a separately compiled bundle
  `supabase/functions/automatic-report-email/report-bundle.js` (not committed).
  It must be **rebuilt and redeployed separately** with
  `node scripts/build-automatic-report.mjs` before new auto emails can be
  claimed to use the updated PDF. No automatic worker/cron was changed by this PR.
- Preserve two-page A4 output and do not alter historical PDFs already sent.
- New regression tests check calculations, compact/exact money, missing values,
  three languages and the shared export entry points.
