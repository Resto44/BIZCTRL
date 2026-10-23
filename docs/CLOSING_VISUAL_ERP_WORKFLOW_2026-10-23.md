# Sales Closing ERP visual implementation — 23 Oct 2026

Branch: fix/closing-single-cash-reconciliation (Draft PR #194)
Risk control: UI and client-side breakdown only; existing server posting, opening verification and closing finalization are unchanged. No migration or historical data rewrite. Not deployed to production.

## Screen 1 — Sales

Preserves existing manual/offline cash input, card terminal amounts, credit and configured sources. Automatic POS remains disabled until branch/date/shift/cashier provenance is certified. Advanced entries stay in the mobile sheet; no duplicate closing editor.

## Screen 2 — Cash

- ClosingCashSalesSources shows cash-tender sales by configured source, including the cash portion of split driver payments; excludes network/card, credit, wallet, previous-period source balances, excluded sources and owner/treasury funding. Source mismatch blocks advancing.
- Compact CashReconciliationPanel is the single current-shift cash count and equation: Opening + Cash Sales + Posted Cash In − Posted Cash Out = Expected; physical count is Actual Cash.
- Posted receipts show source/reference through existing scoped ERP context. Owner/treasury funding uses the existing confirmed, idempotent erp_fund_sales_closing_drawer RPC; no posting on render.
- Negative Expected is a ledger funding gap, not a cash overage. Physical count stays visible for investigation; finalization remains blocked.
- A positive Expected with lower Actual is a physical count shortage. The owner/treasury funding form pre-fills this shortage, but posting Cash In also increases Expected: this NEVER erases a historical shortage. Separate audited adjustment/correction is required to resolve variance.

## Screen 3 — Review

ClosingFinalReview shows one sales summary, the same drawer calculation, funding exceptions and the next-opening preview. Preview is not a posted opening. Only an audited finalized actual physical count seeds the next verified drawer via existing server opening-context logic. Purchase-based management estimate remains Estimated and is not canonical COGS profit.

## Safety boundaries and acceptance

- Strict restaurant, branch, business date, shift and cashier context.
- No owner funding in sales; no card/credit/wallet tender in physical cash.
- A cash-paid purchase affects the drawer only through an independently valid posted Cash Out event. This PR does not implement purchase-invoice postings.
- Full Vitest, build, i18n and mobile input tests; real ledger and funding end-to-end requires separate authenticated test before production.
- Draft PR not merged; no production financial mutations; no canonical feature flag changes.
