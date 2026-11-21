# ERP recovery review — 2026-11-19

Base reviewed: `0f7989db165b35e2a6209a2b9dd2dc0cfe3ef75c` (`main`).

## Confirmed defects corrected

- Restaurant purchase receiving previously kept only a request UUID in component memory. Closing/reloading after an ambiguous response lost it; generic gateway failures also permitted changing quantities. Persist the immutable RPC arguments before posting, scoped by actor/tenant/branch/order. Restore them after remount; retry even if progress is unavailable or remaining quantity is zero. Block new writes when recovery storage is unavailable/corrupt. Explicit PostgreSQL rejections release the request; unknown outcomes retain it. Completed orders retain a recovery entry point. Same-tick submissions are guarded. Refresh failures do not turn a confirmed receipt into a failed receipt.
- POS treated every five-character uppercase error code as a definite rollback. Connection/unknown-completion codes must retain the pending command. Malformed or wrong-device RPC responses can no longer clear pending commands or establish a connected state. Existing checkout/next-order separation remains covered by the executable hook tests.
- Integrity snapshot parsing accepted contradictory supplier/daily-sales counters, which could still produce green badges. Validate aggregate/detail relationships, subset limits and table totals before rendering success.
- Purchase-order list and detail parsed JSONB arrays as JSON strings, hiding valid line items. Both now use the existing shared parser, consistent with receiving and supplier messages.

## Evidence boundaries

- Source review and executable local unit/component tests support these fixes. RPCs in these tests are mocked; they do not prove production transactions, database permissions or physical printing.
- No schema migration, production data mutation, payment, merge or deployment was performed for this change.
- Existing atomic receipt RPC is a prerequisite. This patch does not reconcile historical partial receipts or change stock/accounting entries.
- Browser recovery is not a global receipt identity across different users/devices; simultaneous independent physical deliveries need the server journal and operational reconciliation. Deleting browser storage removes client recovery evidence.
- COGS/cash-ledger reconciliation, actual Owner/Manager closing history, iPhone controls, multilingual report output, product category/import/export correctness and printer hardware still require their respective integration/acceptance evidence. Passing the repository suite does not certify a complete ERP.

## Release validation still required

1. In a controlled non-production environment, drop a receipt response after server commit, reload, retry, and verify one receipt journal entry and one set of purchase/stock effects.
2. Repeat POS checkout/next-order interruption with the same command identifiers; verify one payment and recovery of only the next order.
3. Compare read-only production financial findings with source documents and branch/tenant scope before any historical correction.
4. Verify actual printer output and mobile layouts on target devices separately.
