export function buildLowStockDraft({ restaurantId, branch, supplier, stock, products, quantities = {}, orderNumber }) {
  if (!restaurantId || !branch?.id || !(branch.key || branch.branch_key) || !supplier?.id) throw new Error('Select a business, branch and supplier.');
  if (supplier.restaurant_id !== restaurantId || (supplier.branch_id && supplier.branch_id !== branch.id)) throw new Error('Supplier is outside the selected branch.');
  if (!stock.length) throw new Error('No matching low-stock products.');
  const items = stock.map(row => {
    if (row.restaurant_id !== restaurantId || row.branch_id !== branch.id) throw new Error('Stock is outside the selected branch.');
    const product = products.find(p => p.restaurant_id === restaurantId && p.supplier_id === supplier.id && [p.id, p.product_id].includes(row.product_id));
    if (!product || (product.unit && row.unit && product.unit !== row.unit)) throw new Error('Select products supplied in the matching stock unit.');
    const qty = Number(quantities[row.id] ?? Math.max(1, Number(row.low_stock_threshold ?? 5) * 2));
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('Reorder quantity must be greater than zero.');
    return { product_id: row.product_id, product_name: row.product_name, qty, unit: row.unit || '', unit_price: 0 };
  });
  return { restaurant_id: restaurantId, branch_id: branch.id, branch: branch.key || branch.branch_key,
    supplier_id: supplier.id, supplier_name: supplier.name || '', order_number: orderNumber,
    status: 'draft', items: JSON.stringify(items), total_amount: 0, notes: 'Draft from low stock; prices require review before submission.' };
}
