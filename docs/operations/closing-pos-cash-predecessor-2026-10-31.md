# 2026-10-31 — POS records incorrectly used as cash drawer predecessors

## Reproduction

The authenticated Owner Cash Closing for the branch with a verified 2026-10-30
opening selected a finalized `POS:...` row from October 30 as the previous
physical cash closing. Its `actual_cash` is intentionally null because it
is a POS revenue row, not a physical drawer closing. That produced
`opening_verified=false`, preventing finalizing sales even when a real
Morning/Evening close with a certified physical count was already present.

## Fix

- `erp_closing_predecessor` now only searches `Morning` or `Evening` shifts
  for physical drawer carry-forward. It keeps tenant scope, branch,
  cashier, session sequencing, finalization and permission constraints.
- `erp_sales_closing_opening_context` also excludes POS-shift records from its
  legacy fallback searches (all five queries). POS sales remain intact and
  included in sales analytics; only cash carry-forward selection changes.
- No existing financial row is rewritten. A genuine missing physical count from
  a real Morning/Evening predecessor is still unresolved and fails closed.

## Read-only repro + rollback-only validation

Authenticated fixture: original shift opening verification dated Oct 30,
requesting a new Oct 31 Morning cash context in the same authorized branch.
Before: opening_verified=false, predecessor shift POS.
In a single BEGIN/ROLLBACK transaction with both functions replaced:
After: opening_verified=true, predecessor shift Morning.

## Deployment

Deploy the migration through Supabase migrations. It contains only
CREATE OR REPLACE FUNCTION, preserving the same signatures and grants.
Reopen the signed-in iPhone Sales Closing, refresh and check the current cash
count entry remains editable and the predecessor warning disappears.
Then test saving a draft and finalizing a genuine new closing.
Do not automatically post a financial closing on the live account as a test.
