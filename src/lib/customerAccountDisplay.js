// Customer-facing label must contain only the restaurant and the real branch name.
// Never fall back to the legacy internal branch key (e.g. main-9a50614652).
export function customerAccountDisplayLabel(account) {
 const restaurant = typeof account?.business === 'string' ? account.business.trim() : '';
 const branch = typeof account?.branch_name === 'string' ? account.branch_name.trim() : '';
 return [restaurant,branch].filter(Boolean).join(' · ') || '—';
}
