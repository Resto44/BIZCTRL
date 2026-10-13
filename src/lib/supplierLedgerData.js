import {readAllPortalRows} from './portalReliability';
// The caller supplies an authenticated client. Never fetch an unscoped ledger.
export async function fetchSupplierLedger(client, {restaurantId, branch}) {
  if (!restaurantId) throw new Error('Select an organization');
  const read = table => readAllPortalRows(() => {
    let query = client.from(table).select('*').eq('restaurant_id', restaurantId).order('id');
    if (branch && table !== 'suppliers') {
      const key = branch.key || branch.branch_key;
      query = key ? query.or(`branch_id.eq.${branch.id},and(branch_id.is.null,branch.eq.${JSON.stringify(key)})`) : query.eq('branch_id',branch.id);
    }
    return query;
  });
  const [invoices,payments,suppliers] = await Promise.all(['supplier_invoices','supplier_payments','suppliers'].map(read));
  return {invoices,payments,suppliers};
}
