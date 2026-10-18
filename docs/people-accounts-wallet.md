# Accounts & Wallet

Owner navigation: Finance & Treasury → Accounts & Wallet (existing `/sponsor-treasury` bookmarks are retained). Personal portal: `/wallet-portal`; existing `/partner-portal` invitations remain valid.

## Membership

The owner creates a seven-day registration link and shares it. Each person creates a login or signs in using an existing login, verifies their email, and explicitly requests membership. Signup does not create a profile, staff membership, branch assignment or financial access. The owner approves the request and assigns an account category (partner, manager or employee), an optional branch, and separate submission, personal-advance and custody permissions. Approval links an existing account by verified email where possible. Membership requests and reviews are retained; renewal invalidates the previous registration link, and Disable stops new requests using the link.

An owner can also create and invite an individual account. Account save and permission configuration execute in one database transaction. Existing partner IDs, invitations, loans and statements are preserved. Existing partner accounts keep loans enabled and custody disabled until their owner opts in. Adding a wallet for an existing ERP member does not consume a second user slot in this account creation check.

## Accounting boundaries

- Personal advances and repayments retain the existing two independent principal balances. They are neither operating revenue nor expenses.
- Custody records business funds physically handed to a person or returned to the business. Cash and bank holdings are tracked separately, by currency.
- Submission is pending and does not move money. Only the owner can approve another person's request; the owner selects an active, matching Treasury account.
- Approved custody handovers atomically append two equal opposite wallet entries: the owner-account leg and the person-custody leg. The owner account changes, but combined business cash does not. The custody request links both movements.
- Returning more than recorded holdings is rejected. An outgoing owner handover requires sufficient funds in the chosen Treasury account.
- Retries cannot create a second posting. Posted custody entries and their wallet legs cannot be edited or deleted. An owner correction requires a reason and creates one linked opposite entry; the original remains visible. Reversal still obeys available-funds checks.
- A pending rejection requires a reason and never posts money.
- The owner sees custody totals in Accounts & Wallet and Treasury, separately for each currency/payment method. Per-person holdings and pending counts appear in the personal portal. Requests/statuses refresh every 15 seconds.

This release is a custody-transfer and personal-advance workspace. It is not bank payment execution. Payroll, supplier invoices, customer credit and expense recognition remain in their dedicated modules and are explicitly excluded from these balances. Do not book wage payments or trade invoices as personal loans, or record expenses as custody returns. Automatic integration of those source documents is not included in this release.

## Validation

`supabase/tests/people_accounts_wallet.sql` is a synthetic rollback fixture. Run inside BEGIN/ROLLBACK. It checks existing partner behavior plus pending signup without privileges, owner-only admission, cross-person read denial, disabled-loan and read-only flags, request idempotency, matching payment methods, two equal transfer legs, no movement before approval, over-return denial, immutable postings, and idempotent linked reversal.

UI tests cover membership submission without self-selected privileges, custody request submission without posting, read-only accounts, existing partner confirmation and owner menu routing in restaurant, retail and services modes. No real financial records are created by these checks.
