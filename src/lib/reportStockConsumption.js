/** Server validates tenant, branch, role and subscription; errors must block export. */
export async function fetchReportStockConsumption({db,restaurantId,branchId=null,range}) {
  if (!restaurantId || !range?.from || !range?.to) throw new Error('Report scope required');
  const {data,error}=await db.rpc('erp_report_stock_consumption', {
    p_restaurant_id:restaurantId,p_branch_id:branchId,p_from:range.from,p_to:range.to,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Invalid inventory consumption report response');
  return data;
}
