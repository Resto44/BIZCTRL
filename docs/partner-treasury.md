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

## Partner workspace (2026-10-18)

The partner portal now has Overview, Transactions, Reports and My account views. Overview displays independent all-time obligations and period movements. Periods include today, last seven days, this calendar month, current plus previous two/five/eleven months, and all time. Dates use the business deployment's Asia/Riyadh day boundary. Currency is always selected separately; no FX conversion or netting is applied. Incoming/outgoing labels use the partner's perspective.

The existing restricted statement RPC is paged to completion before analytics or export is available. Duplicate IDs, changing counts, empty intermediate pages and changed aggregate balances reject the read instead of showing partial totals. Refresh runs every 30 seconds while active; confirmation refreshes immediately. This is polling, not an instantaneous realtime guarantee. Large ledgers may require server-side aggregates in a future performance revision.

Reports contain monthly movement bars, payment-method distribution and independent month-end obligations for months with activity (prior principal included). Search, method and confirmation filters apply to transaction lists and exports. Leaving Transactions clears these additional filters. PDF uses embedded bold Vazirmatn and includes all filtered records with pagination, reference and notes. The portal DTO does not expose receipt URLs, so no fictitious receipt button is shown. Read-only account preferences remain scoped to the authenticated user and device.

Validation: 16 focused tests cover paginated completeness, consistency failures, currency separation, integer-minor-unit totals, prior principal, portal navigation, confirmation, denied reads and three-language PDF generation. Persian/Arabic sample PDFs were rendered for layout review. Production partner sign-in/activation and a real partner's post-login mobile UI still require user-session verification; no real account or financial record was created for this change.
