# Cash register integrity review — 2026-10-13

## Delivered

Owner cash contributions now use one authenticated, RLS-enforced database command. The linked treasury entry, injection, drawer movement and optional shortage resolution commit together. A persisted request ID makes retries safe after a lost response; changed payloads cannot reuse an ID. The existing injection trigger is the only cash-movement poster.

Settlement submission validates the ledger against counters, detects incomplete/duplicate injection postings, preserves a count of zero and creates shortages once. Approval carries counted cash forward and cannot overwrite a later closed settlement. Existing owner-only write permissions remain; manager reads retain branch restrictions. Internal security-definer settlement helpers are no longer directly executable by clients.

Register reads are tenant scoped, paginated and fail visibly instead of presenting failed requests as empty balances. Forms show branch names, separate currency from the amount, preserve cents and expose mobile tab labels. Contributions explain that moving existing owner funds belongs in Treasury.

## Evidence and limits

Six focused automated tests cover monetary validation, zero counts, reconciliation detection, paging, RPC-only posting and persisted retry IDs in the rendered form. ESLint has no errors (existing unused-variable warnings remain); production build succeeds.

An authenticated database transaction tested a contribution and replay (one wallet entry and one active movement), changed-payload rejection, zero-count submission, a single shortage, approval and counted carry-forward. All fixture writes were rolled back. Unauthorized-user and function-execute restrictions were also checked during the candidate transaction. Tests were repeated after applying the migration.

Audit found five historical injections: three lacked treasury links and two source IDs had duplicate active movements. Historical financial records were not rewritten or deleted. They require document-backed reconciliation; the UI flags them and closing rejects affected ledger discrepancies.

This does not replace the entire accounting engine or repair every legacy source-module trigger. Physical iPhone interaction and a signed-in production UI session were not available; UI behavior was exercised with component tests and production compilation.

Supabase security advisors reported no finding for the new command functions. Existing project findings remain outside this change, including other executable security-definer functions, protected tables without policies, and leaked-password protection. See https://supabase.com/docs/guides/database/database-linter and https://supabase.com/docs/guides/auth/password-security .
