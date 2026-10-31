# Owner Dashboard: last verified drawer cash from multiple Closing sessions

## Root cause
The old `erp_owner_drawer_cash_asof` grouped every finalized row of the
latest date/shift and required exactly one row. When a cashier legitimately
finalized six independent Morning sessions on 2026-10-31, each with an
`actual_cash` count, the six records caused `ambiguous_drawer` even though
the latest session (number 6) recorded a physical count of SAR 150.

A second issue is multi-branch scope: the organization's four active branches
include two branches without a verified cash count. The global aggregate
must remain NULL, but this must not hide the latest verified branch count.

## Contract and safety
- Use the most recent **physical** finalized Morning/Evening Closing session
  for each permitted branch and date at or before the requested as-of date.
- Exclude POS sales. Never use expected cash, cash sales, network or
  calculated `closing_cash` as physical drawer count.
- When a latest shift contains distinct cashier drawer owners (or only
  unknown cashiers in multiple sessions), treat its physical drawer as ambiguous.
- Do not automatically fall back to a prior count if the latest Closing
  session lacks `actual_cash`. This is unknown, not zero.
- `amount` is the all-branch sum ONLY when every authorized active branch has
  a verified latest count. Otherwise `amount=null` and each verified branch
  remains available in `details`. The UI may show the single latest verified
  branch amount with explicit **not an all-branches total** labeling.
- Branch scope remains enforced by `erp_can_access_scope_text`. No tenant
  mixing or mutation of historic financial records.

## Validation
- In a rollback-only authenticated owner transaction, the patched function
  returned branch Main `cash=150`, `status=verified`, `sessionNo=6`.
- Four branches in scope, two incomplete; all-branch amount remains NULL.
- JS normalizer checks ensure partial branch value never becomes a global
  total and unread or missing amounts are not coerced to zero.
- Signed-in iPhone check still needed: Owner Dashboard -> Cash position &
  payments -> latest verified branch and branch breakdown, including today's
  date and scoped sum. Production READY is a build check, not the real iOS
  UI test.

No change to posted sales, cash flows, payments or historical Closings.
