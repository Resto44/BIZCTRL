# Balance-first wallet

The balance follows the compact wallet heading. Account details and owner beneficiary management are collapsed initially, with the existing Beneficiaries action opening and focusing owner management.

The bell provides in-app notifications from the existing authorized wallet dashboard snapshot, for the selected person and currency. It includes pending, posted and rejected transfers, refreshes with the existing 20-second polling, and opens the exact transaction or owner review form without approving anything. English, Arabic and Persian labels are provided.

Scope: latest 100 transfers in the server snapshot, not a complete notification archive. Read indicators last for this mounted wallet view and reset on reload/account switch. These are in-app activity notifications; OS push, cross-device read receipts and membership notifications are not implemented by this change. No financial posting or authorization logic changes.

Validation: wallet interaction tests include balance ordering, opening a specific notification, and pending review without mutation. Existing wallet interaction/presentation tests and production build are run before release. Physical iPhone and live authenticated workflows are not covered by mocked tests.
