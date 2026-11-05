/**
 * Canonicalize Network Management's branch choice for row-level security.
 * The selector historically returned a human-readable key instead of UUID.
 * Never save a network account with null branch_id or guess ambiguous matches.
 */
const normalized = value => String(value ?? '').trim().toLocaleLowerCase();

export function resolveCanonicalNetworkBranch(branches, value) {
  const input = normalized(value);
  if (!input) return null;
  const records = Array.isArray(branches) ? branches : [];
  // UUID identity wins over display aliases. Do not accept a cross-tenant ID
  // because only the caller's authorized tenant branch list is considered.
  const byId = records.find(branch => branch.id && normalized(branch.id) === input);
  if (byId) return byId;
  const matches = records.filter(branch => {
    if (!branch?.id) return false;
    return [branch.key, branch.branch_key, branch.name, branch.label]
      .filter(Boolean).some(alias => normalized(alias) === input);
  });
  return matches.length === 1 ? matches[0] : null;
}

export function networkAccountSavePayload(form, authorizedBranches) {
  const chosen = resolveCanonicalNetworkBranch(authorizedBranches, form?.branch_id);
  if (!chosen?.id) {
    throw new Error('Select one unambiguous authorized branch before saving the network account.');
  }
  const branchKey = String(chosen.key || chosen.branch_key || chosen.id);
  const status = form.status === 'active' ? 'active' : 'inactive';
  return {
    ...form,
    branch_id: chosen.id,
    branch: branchKey,
    branch_key: branchKey,
    status,
    is_active: status === 'active',
  };
}
