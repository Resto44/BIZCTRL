# Owner wallet operations

The owner portal now opens an owner overview instead of presenting a beneficiary balance as the owner's balance. The overview separates eligible Treasury liquidity, all person-side wallet balances, pending requests, funded totals and returned totals. Amounts follow the selected app currency and are never combined across currencies. Totals cover the full ledger, while history is paginated in 50-row pages and filterable by status.

Owners can initiate funding or return transfers through an explicit review and confirmation form. A new owner-only RPC creates the request, one Treasury transfer and two balanced wallet postings in one transaction. It validates tenant ownership, active linked beneficiary, active wallet, eligible same-currency Treasury account, amount/precision and available source funds. Request-key and wallet locks serialize retries and postings; Treasury account row locking matches the existing approval engine. Exact retries are idempotent; changed payloads fail. Owner-originated records are marked `initiated_by_owner` and record the owner as creator and reviewer. Beneficiary-originated requests retain their existing independent owner review rule.

These are internal wallet transfers, not bank payments, revenue, expenses, payroll or personal loan postings. Selecting a descriptive salary/settlement reason does not create those accounting records. Historical sponsor/loan/custody ledgers remain separate. Direct table access remains revoked, and all new APIs authenticate and check tenant ownership. Existing ledger immutability and deferred double-entry validation remain in force.

The existing beneficiary view is retained as a tab. Its owner Transfer/Receive actions now open the direct owner form, and personal wallet users retain their request workflow. Pending requests can be approved or rejected directly in the paginated owner history.

## Verification

- SQL rollback test with synthetic identities: funding, return, exact replay, conflicting replay, Treasury/wallet overspend, currency mismatch, frozen wallet, non-owner/outsider denial, pending totals, existing request approval, balanced postings, no sales generation and anonymous privilege denial.
- React tests: separate Treasury/wallet balances, explicit confirmation, both directions, insufficient funds/precision validation and same-key retry after transport error, plus existing wallet regressions.
- Supabase advisors reviewed: wallet tables intentionally have no direct read policies; narrowly authorized SECURITY DEFINER RPCs are the only client access path. The corresponding advisor notices are expected for this architecture. See https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy .
- Physical iPhone and a real user's authenticated transaction were not exercised. Synthetic financial test data was rolled back. Cross-module concurrent Treasury writers were not stress-tested; the new flow follows the existing Treasury row-lock convention.

## Daily transaction timeline

Owner history now uses compact date groups with expandable details, a month selector,
name search and All / Incoming / Outgoing / Pending filters. Directions are from the
owner Treasury perspective: posted funding is negative/outgoing; posted returns are
positive/incoming. Pending and rejected requests have no signed movement or balance change.

`erp_bank_wallet_owner_timeline` enforces owner and tenant access, computes full-ledger
balances before filtering, and paginates 50 records. Month boundaries and day groups
use the browser timezone. The overview remains independent of history filters.
Migration: `20261020133549_wallet_owner_daily_timeline.sql`.

Validated with rollback SQL assertions (filters, pagination, full-ledger balances,
timezone and cross-tenant denial), 23 UI tests, targeted ESLint and production build.
