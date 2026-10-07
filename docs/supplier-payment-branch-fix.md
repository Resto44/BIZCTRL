# Purchase payment branch access

The supplier invoice policies permit `createPurchases`, but supplier payment INSERT was using the owner-only writer helper. The new INSERT policy preserves owner access and permits purchase-authorized users only when tenant, UUID branch, branch key, supplier and a posted/non-cancelled invoice match. Other supplier payment policies are unchanged.

The purchase form retains the saved invoice and successful payment IDs during a failed submission. Retry skips invoice creation/inventory processing and confirmed payments. It shows persisted invoice status and freezes document editing while payment recovery is pending. This guard lasts for the current form session; it is not a replacement for backend idempotency after an ambiguous network response.

Verification: authenticated branch-manager transaction inserted a cash payment, updated invoice paid amount/status and produced the canonical cash movement. Cross-branch and unlinked payment inserts were rejected. Entire transaction rolled back. Fifteen purchase calculation, lifecycle and retry tests passed. No physical iPhone test.

Observed three approved, unpaid invoices sharing PUR-20261007-0006 and total SAR 434. No historical invoices were deleted or modified. They require reconciliation before another invoice with this number is entered.
