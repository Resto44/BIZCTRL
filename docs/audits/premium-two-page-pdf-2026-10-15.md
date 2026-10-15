# Premium BizCTRL two-page PDF management report

Replaces earlier simplified two-page renderer with enterprise A4 portrait visual treatment based on the user's two reference mockups: colored KPI cards, branded header/footer, trend panels, payment split, per-branch summaries, purchases/expenses/consumption.

Exactly two pages:
1. Sales: six KPIs; current vs previous sales trend; payment-mix donut; branch sales ranking; finalized closing count trend; management metrics.
2. Procurement and spending: six KPIs; purchase and expense trends; expense-category bars; per-branch purchasing; product consumption names, recorded quantities and units; verified stock consumption event trend; recorded waste value when supported.

Data rules:
- Same tenant/branch/date-scoped snapshot in Reports and Scheduled Reports; same canonical generator.
- Finalized closings only, approved supplier invoices only, period variable and daily-allocated fixed expenses. Payment methods not double-counted.
- Finalized closing counts are NOT customer order counts.
- Purchases are NOT inventory-adjusted COGS. Sales less purchases and expenses is an operating proxy, not audited profit.
- Stock consumption event trend counts recorded movements; never sum kg, litres and units together.
- Unvalued consumption is not given fake costs, nor is waste cost guessed.
- Empty source data renders unavailable state. No demo values inserted in production reports.
- 16-bucket trends preserve totals; top rows aggregate the tail as Other. Financial transactions not modified.

QA plan: 365-day totals; multi-branch/category overflow; movement accounting; exactly 2 A4 pages in EN/AR/FA; text bounds, branch scope; shared Reports and Scheduled Reports generator.
