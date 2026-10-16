/**
 * Presentation-only mapping for Treasury's canonical branch key/UUID.
 * Never replace keys in saved transactions, filters, settlement references,
 * audit records, or RLS scopes. The caller supplies only tenant-scoped branches.
 */
const TECHNICAL_MAIN_KEY = /^main-[a-z0-9]{8,32}$/i;
const UUID_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isTechnicalTreasuryBranch(value) {
  const text = String(value ?? '').trim();
  return TECHNICAL_MAIN_KEY.test(text) || UUID_KEY.test(text);
}

const unknownLabels = {
  fa: 'فرع نامشخص', ar: 'فرع غير محدد', en: 'Unknown branch',
};
const allLabels = {
  fa: 'تمام فرع‌ها', ar: 'جميع الفروع', en: 'All branches',
};

export function treasuryBranchDisplayName(transaction, branches = [], lang = 'en') {
  const value = typeof transaction === 'string'
    ? { branch: transaction } : (transaction || {});
  const key = String(value.branch ?? value.branch_key ?? '').trim();
  const uuid = String(value.branch_id ?? '').trim();
  if (key === 'all') return allLabels[lang] || allLabels.en;

  // Prefer UUID linkage, then canonical branch_key, then a known branch name.
  // Never resolve a key across another restaurant's branch metadata.
  const found = (branches || []).find((b) =>
    (uuid && String(b.id || b.branch_id || '') === uuid)
    || (key && [b.key,b.branch_key,b.name,b.label]
      .some(candidate => candidate != null && String(candidate).trim() === key)));

  const name = String(found?.name || found?.label || '').trim();
  if (name && !isTechnicalTreasuryBranch(name)) return name;

  if (key && !isTechnicalTreasuryBranch(key)) return key;
  if (key || uuid) return unknownLabels[lang] || unknownLabels.en;
  return '';
}
