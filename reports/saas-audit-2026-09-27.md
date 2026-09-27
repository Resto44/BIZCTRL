# BizCTRL audit — 27 September 2026

## Completed fixes

- PR #29: Customer debt payment no longer reads nonexistent collection columns. Cash is posted once by the collection trigger, card payments do not increase the cash drawer, and sales revenue remains unchanged. The credit-sale status panel is now a real review action leading to Closing; finalization remains the single owner of credit-sale posting.
- Owner cash contribution: reproduced SQLSTATE 42703 (`v_row.branch_key` absent), changed optional branch extraction to JSON, and verified insert/update/delete and settlement reversal. Contributions do not create sales revenue.

## Evidence and coverage

| Area | Verification | Result |
| --- | --- | --- |
| Existing application regression tests | `npm test` | 569 tests, 102 files passed |
| Production frontend build | `npm run build` | Passed |
| Project lint | `npm run lint` | Passed (quiet errors-only gate) |
| Restaurant, cafe, retail, warehouse, factory, pharmacy, clinic, wholesale, services, other | Synthetic signup-trigger provisioning, authenticated session context, correct organization/branch and cross-tenant denial | Passed |
| Manager, employee, supplier | Owner creates invitation; confirmed synthetic identity activates it; session role/home/branch checked; non-owner invitation attempt rejected | Passed |
| Customer credit | Finalized credit closing, retry, cash/card repayment, repayment retry, overpayment and anonymous rejection, ledger/settlement/revenue assertions | Passed |
| Restaurant POS | Existing authenticated SQL workflow suite | Passed |
| Retail POS | Existing authenticated SQL cashier suite | Passed |
| Retail inventory | Existing SQL receipt, stock, transfer and permission suite | Passed |
| Product barcodes | Existing SQL barcode suite | Passed |
| Restaurant category images | Existing SQL image validation and branch isolation suite | Passed |
| Owner cash contribution | New authenticated SQL insert/update/delete suite | Passed |
| Public browser UI | Landing page and role selector rendered; Owner opens email/password login | Observed |

All database fixtures above are synthetic and rolled back. Test identities are not permanent user accounts. SQL session tests do not establish successful password/MFA sign-in in a browser. Existing frontend tests include touch workspace, mobile menu, navigation, portal identity and pharmacy resilience, but passing them is not equivalent to a full live visual audit.

## Remaining work requiring signed-in browser access

- Create persistent reusable test identities through the supported account/invitation flows and sign into each role.
- Walk every protected route and main form with test data, including reports, purchasing, expenses, employees, suppliers, settings and billing.
- Inspect actual mobile and desktop rendering, keyboard obstruction, scrolling, RTL, printing and downloads. No viewport emulation was available in the selected browser interface during this pass.
- Platform Owner requires its separate authorized sign-in and MFA. No global platform administrator was provisioned and no protection was disabled.
- External paid integrations, real card capture, SMS/email delivery, physical printer/scanner hardware, and store publishing were not transacted or certified.

## Audit tooling note

`scripts/verify-erp-audit-regression.cjs` fails on an obsolete exact-source-string assertion for Reports. Current Reports uses branch-scoped Supabase queries instead of that previous source expression. This standalone script failure is not evidence of a runtime reports failure; the normal Vitest suite and lint pass. It needs conversion to behavioral tests before being used as a release gate.

This is a bounded verification record, not a claim that every possible SaaS defect has been eliminated.
