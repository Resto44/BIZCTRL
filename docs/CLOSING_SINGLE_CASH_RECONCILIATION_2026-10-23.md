# Sales Closing — single physical cash reconciliation (draft)

The Cash step now renders **one** `CashReconciliationPanel`, not a quick cash input, an independent overdrawn-warning amount, and a second cash input in Advanced Details. Its money inputs and the existing owner/treasury funding action consume the same server `erp_sales_closing_cash_context` result for the exact restaurant/branch/business date/shift/cashier/closing identity.

## Accounting contract

- `Physical Count` is the amount physically counted by the operator. It may be entered and displayed while the ledger is unresolved, but this **does not create money, revenue or permission to finalize**.
- `Expected Drawer = verified Opening + recorded current Cash Sales + posted Cash In - posted Cash Out`. Network, credit and wallet-only transfers are excluded. Purchases/expenses alone do not debit physical cash without a posted cash movement.
- Owner or treasury cash funding counts as **Cash In** only after explicitly confirmed physical receipt and server-side idempotent posting, with branch/date/shift/cashier identity. It is **not sales**.
- A negative expected balance is an **invalid ledger**; do not subtract it from a physical count and display a fake "unexplained variance"/overage. Show the missing recorded funding amount and the actual physical count separately for investigation.
- `Variance = actual - expected` only if opening is verified, ledger is loaded and expected balance is not negative. Cash short/over is separate from revenue.
- On successful finalization, `actual_cash` is immutable audited close count and `erp_sales_closing_opening_context` reads that physically verified count as the next shift's opening only when the previous matching branch drawer is uniquely identified. A draft count or ambiguous multiple cashier shift is **never silently carried forward**.
- A cash payment **directly** from a treasury account should not be posted as outgoing drawer cash; funding is posted only if notes/receipt confirm physical arrival.
- No automatic POS legacy feed, no changes to historical financial rows, no retrospective injection, and no automatic funding on page render.

## UX

The main Cash step displays a single count control, expected cash equation, source receipt drilldown, audit notes and approval. The existing `ClosingFundingPanel` now opens inside the same card. Advanced ERP Details shows sales/credit settings and directs operators back to the single cash card rather than rendering another independent money editor.

## Release gate

This is a code-only PR; it is not a production data correction. The existing owner/treasury RPC supports funding **into any authorized selected branch**. It does not independently authorize a new direct branch-to-branch cash handover. A future branch-to-branch flow must atomically debit the sending branch's physical drawer and wallet, credit the receiving branch once, and use a signed receipt and paired movement references. **Do not assume an arbitrary branch source transfer is supported or fabricate Cash In.**

Before deployment: run the full GitHub CI, verify mobile focus/one-input behavior, check an authorized branch's real `cash_movements` (read-only), and exercise actual owner and treasury funding, overdrawn draft, finalization and next-shift opening end-to-end in a controlled environment.
