export function invitationCandidates({ employees = [], suppliers = [], drivers = [], memberships = [], invitations = [] }, role, branchId) {
  const rows = [
    ...memberships.filter(r => r.role === role).map(r => ({ ...r, source: 'membership' })),
    ...(role === 'employee' ? employees : role === 'supplier' ? suppliers : role === 'driver' ? drivers : []).map(r => ({ ...r, full_name: r.full_name || r.name, source: 'record' })),
    ...invitations.filter(r => r.role === role).map(r => ({ ...r, source: 'invitation' })),
  ];
  const seen = new Set();
  return rows.filter(r => !r.branch_id || r.branch_id === branchId).filter(r => {
    const key = r.email?.trim().toLowerCase() || r.phone?.replace(/\D/g, '') || `${r.source}:${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map(r => ({ ...r, key: `${r.source}:${r.id}`, full_name: r.full_name || r.email || r.phone || '—' }));
}

export async function loadInvitationDirectory(client, restaurantId) {
  const tables = [
    ['employees', 'id,full_name,email,phone,branch_id'],
    ['suppliers', 'id,name,email,phone,branch_id'],
    ['drivers', 'id,full_name,email,phone,branch_id'],
    ['erp_memberships', 'id,full_name,email,phone,branch_id,role,status'],
    ['erp_invitations', 'id,full_name,email,phone,branch_id,role,status'],
  ];
  const data = await Promise.all(tables.map(async ([table, columns]) => {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const result = await client.from(table).select(columns).eq('restaurant_id', restaurantId).order('id').range(offset, offset + 499);
      if (result.error) throw result.error;
      rows.push(...(result.data || []));
      if ((result.data || []).length < 500) return rows;
    }
  }));
  return { employees: data[0], suppliers: data[1], drivers: data[2], memberships: data[3], invitations: data[4] };
}
