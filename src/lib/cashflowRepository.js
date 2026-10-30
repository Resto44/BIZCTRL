import { readAllPortalRows } from './portalReliability';
const COLUMNS = {
  cash_movements: 'id,date,branch_id,branch,amount,direction,is_reversed,movement_type,source_record_id,posted_at,created_date',
  daily_sales: 'id,date,branch_id,branch,shift,cashier_id,cashier_name,restaurant_network,network,credit,opening_cash,closing_cash,cash_difference,closing_session_no,actual_cash,closing_state,session_closed_at,updated_date,finalized_at,created_date',
  daily_cash_settlements: 'id,date,branch_id,branch,opening_cash,status',
  cash_shortages: 'id,date,branch_id,branch,shift,cashier_id,closing_id,shortage_amount,status,owner_payment_amount,wallet_payment_amount,created_date',
  sales_closing_opening_verifications: 'id,date,branch_id,branch,shift,cashier_id,counted_cash,verified_at',
};
export function resolveCashflowBranch({ role, user, branches, selectedBranch }) {
  if (role === 'owner' && selectedBranch === 'all') return null;
  const id = role === 'owner' ? selectedBranch : user?.branch_id || user?.branch;
  if (!id) throw new Error('Assigned branch is unavailable');
  const branch = branches.find(b => b.id === id || b.key === id || b.branch_key === id);
  if (!branch?.id) throw new Error('Assigned branch is unavailable');
  return branch;
}
export async function readCashflow(client, { restaurantId, branch, to }) {
  if (!restaurantId || !to) throw new Error('Cash flow scope required');
  const read = async (table, filters = []) => {
    const base = () => {
      let q=client.from(table).select(COLUMNS[table]).eq('restaurant_id',restaurantId).lte('date',to);
      for (const [method,field,value] of filters) q=q[method](field,value);
      return q.order('date').order('id');
    };
    if (!branch) return readAllPortalRows(base);
    const key=branch.key || branch.branch_key;
    const results=await Promise.all([
      readAllPortalRows(()=>base().eq('branch_id',branch.id)),
      key ? readAllPortalRows(()=>base().is('branch_id',null).eq('branch',key)) : Promise.resolve([]),
    ]);
    return [...new Map(results.flat().map(row=>[row.id,row])).values()];
  };
  // These are immutable/posted source records, not new money movements.
  // RLS and the same tenant/branch filters apply to all five sources.
  const [movements,sales,settlements,shortages,openingVerifications]=await Promise.all([
    read('cash_movements'),read('daily_sales',[['in','closing_state',['finalized','locked']]]),
    read('daily_cash_settlements'),read('cash_shortages'),read('sales_closing_opening_verifications'),
  ]);
  return {movements,sales,settlements,shortages,openingVerifications};
}
