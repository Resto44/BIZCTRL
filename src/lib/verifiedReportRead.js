import { readAllPortalRows } from './portalReliability';

// Financial reports must never turn a failed or truncated read into a zero.
export function readTenantReportRows(db, table, restaurantId, column = 'id', ascending = true) {
  if (!restaurantId) throw new Error('A restaurant scope is required');
  return readAllPortalRows(() => {
    let query = db.from(table).select('*').eq('restaurant_id', restaurantId)
      .order(column, { ascending });
    if (column !== 'id') query = query.order('id', { ascending: true });
    return query;
  });
}

export function visibleEmployeeAnnouncement(row, now = Date.now()) {
  return row.is_active === true
    && (!row.target_role || ['all', 'employee'].includes(row.target_role))
    && (!row.expires_at || new Date(row.expires_at).getTime() > now);
}
