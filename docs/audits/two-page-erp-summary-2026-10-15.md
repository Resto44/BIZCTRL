# Two-page management summary

Supersedes the default multi-page export introduced by PR105, following the user's explicit correction: exactly one sales page and one purchases/expenses page.

Page 1: finalized sales, daily average, prior-period growth, sales trend, cash/card/credit/other mix, and branch sales comparison.
Page 2: approved purchases, period expenses, sales less purchases and expenses, purchases/expenses trends, fixed/variable expenses, cost ratios, expense category comparison.

All scoped values remain in headline totals. Trend buckets aggregate all dates into at most 16 points without losing amounts. Branch/category lists display at most five rows, explicitly aggregating overflow into Other. The PDF is a management summary rather than a transaction ledger; it does not claim inventory-adjusted COGS or full SaaS audit coverage.

Font remains the shared embedded Vazirmatn Bold/ExtraBold. Same authorized sources and financial formulas; no new data access or writes. Both Reports and Scheduled Reports use the same exact-two-page generator. Previous detailed/compact renderers are not used by this export.

Validation: existing 986 tests pass; five new tests cover exact two-page output in EN/AR/FA, large values, long names, text bounds, and conservation of totals across 365 trend rows and 90 branches/categories. Production build passed. Actual jsPDF fixtures rendered and visually reviewed in Persian and Arabic; English and stress cases checked with layout assertions. Preview is illustrative fixture data, not an authenticated production export.
