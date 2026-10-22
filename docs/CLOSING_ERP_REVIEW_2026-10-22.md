# Sales Closing ERP review — 22 October 2026

Scope: existing BizCTRL Closing at `Resto44/BIZCTRL`, based on commit 677a5532c4244705359735f106d483f20721a02d. This is a targeted upgrade, not certification of the entire accounting system.

## Confirmed and corrected

- Sources marked `included_in_revenue=false` were excluded from the sales summary but still entered the browser cash-reconciliation path. The source-to-tender adapter now applies the same policy, including split driver entries.
- Read-only inspection of the connected production database confirmed that the legacy posting core also included excluded cash sources. The driver normalizer unconditionally added driver cash/network totals. The migration excludes informational cash sources and reads the driver policy from the existing source master while retaining descriptive snapshots.
- Money aggregation now uses minor units for tender totals and movement totals; invalid physical counts stay pending, including negatives, whitespace and excessive decimals. Explicit zero remains valid.
- The page now has a localized overview of shift sales, expected drawer, counted cash and variance, plus navigation to existing sales/count/review controls. Unknown amounts use a dash instead of zero. Narrow layouts stack cash fields and permit amounts to wrap. Final review includes other sales when present. A collapsible operating statement shows purchases, fixed/variable expenses and a clearly labelled purchase-basis estimate.
- A synchronous in-flight guard prevents duplicate form submissions before React's disabled state renders. Existing server idempotency remains authoritative.
- Existing opening verification, overdrawn ledger, invalid actual count and unposted owner funding errors now have actionable messages.

## Preserved contracts

Debt collection and owner funding are cash movements, not new revenue. Credit sales do not increase physical drawer cash. Non-cash tenders stay outside drawer cash. Opening counts and movement scope still come from the canonical server context. Existing wallet/owner settlement, credit limit and draft/finalize pathways remain in place. No historical financial rows were updated by this migration. Function ACLs and scope controls were retained.

## Verification

- 108 targeted Vitest tests passed across 12 files, including 17 new behavioral tests.
- Production build passed; changed application files passed ESLint.
- Browser checks of the new overview: 320, 360, 375, 390, 430, 768 and 1440 CSS-pixel widths, Arabic/Persian/English, including large amounts. No page overflow in those 21 cases; navigation targets were at least 48px and the count action worked.
- Actual live function definitions were compiled in isolated PostgreSQL (PGlite) with synthetic source/driver tables. Checked migration repetition, excluded ordinary cash, excluded split-driver cash/network, included driver amounts, canonical source policy and snapshot retention.
- Production migration applied successfully; readback confirmed both guards and unchanged function ACLs. No real closing transaction was created for testing.

## Limits and remaining work

The browser test covered the new overview in isolation, not an authenticated complete closing on a physical phone. An authorized end-to-end cashier/manager test is still needed for full workflow assurance. The dormant automatic POS feed is intentionally still disabled: it lacks full shift/cashier scope and uses limited record queries. Do not enable it until that is redesigned. Existing security advisor findings were observed before the change; this migration introduces no tables or new exposed functions.

## Release status

Frontend production release is held: the repository-wide workflow failed. A detached baseline at 677a553 reproduced the unrelated failures in branch scope, Help Center, mobile owner menu, realtime refresh, portal reads, product form routing and subscription tests. Related Closing expense-contract assertions were updated for minor-unit sums; the existing cash-panel test now counts actual input nodes rather than both the React component and its input. No checks were disabled or bypassed. The server correction is applied; the UI remains on the PR preview until the repository release gate is resolved.
