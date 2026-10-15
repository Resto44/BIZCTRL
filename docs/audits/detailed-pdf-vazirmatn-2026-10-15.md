# Readable multilingual management PDF

The user requested visibly bold Persian typography matching the app and a detailed report rather than the compressed single-page export.

## Changes

- Bundle Vazirmatn v33.003 Bold (700) and ExtraBold (800), licensed SIL OFL. Source: https://github.com/rastikerdar/vazirmatn/tree/v33.003/fonts/ttf . License is included alongside the font module. Arabic/Persian app CSS uses the same family first; removes the competing Google-hosted Vazirmatn import. English UI retains its existing system stack. PDF normal/bold faces map to genuine 700/800 outlines, with Arabic, Persian and Latin glyphs embedded.
- Default Reports and Scheduled Reports downloads now use a paginated A4 management report. Retain the compact generator only as an explicit integration option.
- Executive summary, sales chart, complete date breakdown, payment sources, branch results, expense categories, stock, consumption/waste, recorded purchase invoices, expense register, debt records and management exceptions.
- No slice limits on inventory, consumption, cost categories or low-stock report models. Full wrapped rows, repeated table headers, deterministic page breaks, 10.5pt body text and page totals. Exceptionally long references continue on subsequent pages rather than shrinking below readable size.
- Tenant/branch query boundaries and financial formulas unchanged. Summary uses finalized sales and approved purchases. Recorded invoice appendix explicitly includes statuses and does not claim to be a supplier payment ledger. Flow periods are distinguished from current stock/debt snapshots. Unknown values remain unavailable, not fabricated zeroes.

## Coverage boundary

This report includes the datasets already loaded by the authorized Reports and Scheduled Reports screens. It does NOT claim to include every SaaS module: payroll, attendance, bank reconciliation, supplier payment allocations and platform subscription datasets are not loaded here. The PDF explicitly states that boundary. No database migration, new access policy or additional sensitive query is introduced.

## Verification

Run `npx vitest run` and `npm run build`. Regression cases assert all 95 inventory/consumption rows survive, Persian/Arabic/English long-reference pagination keeps body text at least 10pt, bounds are respected and every page has the correct total. Existing financial period, tenant isolation and invoice export tests are retained.

Run `node scripts/render-sales-pdf-fixtures.mjs` to generate synthetic, offline QA fixtures. Poppler-rendered Persian/Arabic/English covers, sales chart, inventory and continuation pages reviewed. Fonts confirmed embedded with `pdffonts`. No claim of physical iPhone or live authenticated financial export validation. Previously downloaded PDFs require regeneration.
