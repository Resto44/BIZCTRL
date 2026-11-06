# Branch manager closing wallet funding

Branch managers can choose the restaurant or owner wallet when finalizing their own branch closing. Wallet accounts remain tenant scoped. General treasury transfer permissions remain owner-only.

The manager path debits the selected wallet and posts one drawer receipt within the existing atomic closing transaction. It does not also credit the branch wallet. Failed finalization rolls back funding. Existing request idempotency is retained.

Validation completed:
- 15 targeted Vitest tests passed, including owner/manager wallet selection and unsupported-role denial.
- Production Vite build passed.
- Database migration applied successfully.
- Both wallet sources finalized under the authenticated manager role in rollback-only transactions, including retry idempotency.
- Cross-branch and cross-tenant scope checks, insufficient balance rejection and private helper privilege checks passed.
- All test money movements and closing records were rolled back.

Not verified: signed-in browser/mobile interaction. Frontend publication is blocked by automatic approval review rejecting the Git push to Resto44/BIZCTRL pending explicit destination approval. Backend changes are live; UI changes are committed locally.
