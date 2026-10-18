# Partner treasury

Owner entry: `/sponsor-treasury` (menu: Partner Treasury). External partner entry: `/partner-portal`, also linked from ERP login.

## Operation

1. Owner creates a named partner with an email address and copies the private activation link.
2. Partner creates a login or signs in with the invited email, verifies that email, and activates the invitation.
3. Owner selects a partner and records advances or principal repayments using a compatible owner cash or network/bank account.
4. Partner sees only their own statements and balances per currency, and can acknowledge posted transfers. Acknowledgement does not post another movement.
5. Owner can rename or disable a partner. Email binding is immutable; disabled partners cannot read statements or receive new postings. Renewing an unused invitation invalidates its previous token.

Dashboard title, balance visibility and compact layout are saved per login on the current device. Financial rules and access boundaries are not customizable. Labels are provided in English, Arabic and Persian. The workflow uses the existing business tenant regardless of its business type.

## Accounting and access boundaries

- Four advance/repayment types retain the existing atomic owner treasury posting engine. These are principal liabilities/receivables, not equity, revenue, or operating expenses.
- Repayment ceilings are scoped by tenant, partner, currency and debt direction. Separate claims are never silently netted.
- Existing entries retain a NULL partner and remain in the unassigned legacy ledger. The legacy API cannot consume a partner's principal.
- Idempotency includes partner identity. Posted documents and their linked wallet movements remain immutable.
- External partners are linked through `business_partners.user_id` after verified-email acceptance; they receive no ERP staff membership, branch assignment, or owner wallet permissions.
- Raw partner directory and financial tables remain owner-only. The partner statement RPC returns a restricted DTO with full-ledger balances and 50-record pages.
- The invitation table intentionally has RLS enabled, no read policy and no client grants. Only owner-controlled invitation/activation functions access it. Tokens are hashed at rest and stripped from signup metadata by the AFTER INSERT trigger.
- Public SECURITY DEFINER RPCs are deliberate authenticated APIs with explicit identity and scope checks. Anonymous execution is revoked. Security advisors report these endpoints as review notices; SQL tests exercise denial paths.
- Partner creation checks the current subscription user capacity plus existing partner records. There is no hard-coded six-partner limit.

## Verification

`npx vitest run tests/partnerTreasury.test.jsx tests/sponsorOwnerBilateralERP.test.js tests/sponsorOwnerLedgerRender.test.jsx tests/treasuryMobileSponsorERP.test.js`

`npm run build` and `node scripts/check-portal-startup-bundle.mjs`.

Run `supabase/tests/partner_treasury.sql` inside `BEGIN; ... ROLLBACK;` on a database with the migration applied. It creates only synthetic identities/tenants and tests invitation activation, absence of ERP grants, independent partner/currency/legacy balances, duplicate posting, wallet method, scoped statements, acknowledgement, deactivation, anonymous rejection and authenticated RLS. Never commit these fixtures.

Actual email delivery and a physical iPhone login have not been exercised by this change. Email verification uses the configured Supabase confirmation flow and the `/partner-portal` redirect on the application domain.
