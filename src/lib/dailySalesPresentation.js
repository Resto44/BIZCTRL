export const toDailySalesCardRecord = (sale) => ({
  id: sale.id,
  closing_state: sale.closing_state || 'finalized',
  date: sale.date,
  branch: sale.branch,
  branch_id: sale.branch_id,
  restaurant_cash: sale.restaurant_cash,
  cash: sale.cash,
  restaurant_network: sale.restaurant_network,
  network: sale.network,
  credit: sale.credit,
  custom_sources_total: sale.custom_sources_total,
  sales_sources_json: sale.sales_sources_json,
  cashier_name: sale.cashier_name,
  shift: sale.shift,
  approved_purchases_total: sale.approved_purchases_total,
  expenses_total: sale.expenses_total,
  operating_result: sale.operating_result,
  manager_user_id: sale.manager_user_id,
  manager_name: sale.manager_name,
  manager_email: sale.manager_email,
  created_by: sale.created_by,
});

// Source snapshots explain the saved payment buckets; they are not an extra
// revenue bucket. Cash, network, and credit source amounts are already folded
// into their canonical columns, while only an explicit other bucket belongs in
// custom_sources_total.
const customSourceTotal = (sale) => Math.max(0, Number(sale?.custom_sources_total) || 0);

export const filterDailySalesRecords = (sales, filters) => sales.filter((sale) => {
  if (!sale?.date) return false;
  if (filters.branch !== 'all' && sale.branch !== filters.branch) return false;
  if (filters.from && sale.date < filters.from) return false;
  if (filters.to && sale.date > filters.to) return false;
  const total = (Number(sale.restaurant_cash) || Number(sale.cash) || 0)
    + (Number(sale.restaurant_network) || Number(sale.network) || 0)
    + (Number(sale.credit) || 0)
    + customSourceTotal(sale);
  if (filters.minTotal && total < Number(filters.minTotal)) return false;
  if (filters.maxTotal && total > Number(filters.maxTotal)) return false;
  return true;
});
