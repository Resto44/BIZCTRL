# Cash Flow: audited Opening Cash, Closing Cash and Shortage

Cash Flow now displays an owner/manager scoped chronological audit list:
- **Opening cash** per finalized Morning/Evening closing; an independently verified opening appears immediately even before a closing exists.
- **Closing cash** per finalized Morning/Evening closing, based on `actual_cash` when physically counted. A legacy calculated `closing_cash` remains visibly *unverified*.
- **Cash shortage** per `cash_shortages` record with its pending/resolved status and linked closing reference. A missing linked shortage record can fall back to a finalized negative `cash_difference` visibly marked *Needs review*.

**Accounting invariant:** These are source-backed audit **snapshots and discrepancies**, NOT cash inflows or outflows. Financial inflow/outflow and running net remain solely sourced from `cash_movements`. Owner or wallet settlement, when actually posted, is already represented once by its cash movement, not by creating another movement for a shortage, opening or closing snapshot. Cash Opening is not revenue; Cash Closing is not a new receipt.

Source tables `daily_sales`, `sales_closing_opening_verifications`, and `cash_shortages` are already persisted and RLS protected. No mutation, migration, backfill, or duplicate financial writes are necessary. Cash Flow reads all of them with the same organization and branch selectors, and the audit records can be exported separately as CSV.

Checks:
- Two consecutive October 31 closings (opening 140/150, ending 150/50) and two shortages (111/150) produce six unique audit entries, shortage total 261 and net cash movement 0 in a no-cash-movements fixture.
- Authenticated Owner read-only query saw two finalized cash closings and two shortage rows on Oct 31, plus an earlier independently verified opening.
- POS-shift revenue entries with null physical cash are excluded from drawer snapshots.
- Missing/ambiguous historical cash is not turned into 0 and reported as verified.

After deployment, test owner iPhone Cash Flow for branch/all, month/today, report CSV, and ensure existing financial KPI cash totals match previous values.
