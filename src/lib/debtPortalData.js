import { readAllPortalRows } from './portalReliability';

const TABLES = new Set(['debt_records', 'debt_payments', 'debt_invoices', 'debt_receipts', 'whatsapp_outbound_queue']);

export function readDebtPortalRows(db, table, restaurantId, branchId, restricted = false) {
  if (!TABLES.has(table) || !restaurantId || (restricted && !branchId)) {
    throw new Error('A verified debt ledger scope is required');
  }
  return readAllPortalRows(() => {
    let query = db.from(table).select('*').eq('restaurant_id', restaurantId);
    if (restricted) query = query.eq('branch_id', branchId);
    return query.order('created_date', { ascending: false }).order('id', { ascending: true });
  });
}
