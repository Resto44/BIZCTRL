# Wallet navy interface, transfer analytics and private categories

The wallet screen now uses a compact navy balance panel, readable beneficiary identity, grouped lifetime totals, and short localized mobile navigation labels. Existing approval and treasury posting functions are unchanged.

Transfer requests offer direction-appropriate reasons in English, Arabic and Persian. The selected label and optional details are saved together in the existing immutable request note; Other requires details. Reasons are descriptive metadata and do not create payroll, revenue or expense entries.

Analytics use a new authorized database RPC over all person-side postings, not the dashboard's latest-100 history. Day boundaries use the browser IANA timezone; dates are inclusive, with a maximum 366-day range. Opening balance includes earlier postings, daily closing balance carries forward, and currencies remain separate. Pending/rejected requests are excluded.

Personal categories are private to the verified wallet holder, scoped to their person account and authenticated user. They can be created, renamed and assigned/removed on recent transactions. Owner mode cannot read them. Labels do not change financial entries. The existing recent-history picker is limited to 100 transactions; the analytics totals are not.

## Database deployment

Migration 20261020075901_wallet_navy_analytics_personal_labels was applied to RestoCTRL44. New tables have RLS enabled and no direct client grants. The two explicitly callable SECURITY DEFINER functions have empty search paths, revoked PUBLIC/anon execution, and authorization checks. Advisor notices for callable definer functions and RLS without policies are expected for this intentional RPC-only access model; cross-user denial tests passed.

## Validation

- Production build passed locally. The existing npm lockfile is out of sync with package.json; dependencies were installed without changing either lockfile.
- Focused ESLint: no source errors.
- Behavior and regression tests cover missing balances, localized reasons, Other validation, date boundaries, request payload, private category create/rename/tag, and absence of private-label reads in owner mode.
- Database checks under authenticated role passed: self create/rename/tag/untag, incoming/outgoing/closing reconciliation, invalid range rejection, foreign category rejection, cross-user denial, owner trend access and owner denial of private labels. All test writes were rolled back.
- Local browser visual check unavailable: Playwright browser download returned an invalid archive. Do not claim iPhone visual verification from these checks.
