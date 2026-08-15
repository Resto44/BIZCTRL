export const toDailySalesCardRecord = (sale) => ({
  id: sale.id,
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
  manager_user_id: sale.manager_user_id,
  manager_name: sale.manager_name,
  manager_email: sale.manager_email,
  created_by: sale.created_by,
});

const customSourceTotal = (sale) => {
  if (Number(sale.custom_sources_total) > 0) return Number(sale.custom_sources_total);
  if (!sale.sales_sources_json) return 0;
  try {
    const entries = JSON.parse(sale.sales_sources_json);
    return Array.isArray(entries) ? entries.reduce((sum, entry) => sum + (Number(entry?.amount) || 0), 0) : 0;
  } catch {
    return 0;
  }
};

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
