import { latestInventorySnapshots } from './inventorySnapshotView';
/** Stock movements update inventory.quantity in the database. Never replay them over that balance. */
export function computeLiveStock(inventoryItems, purchases, wastageItems = []) {
  const map = {};

  const stockKey = row => JSON.stringify([row.restaurant_id || '', row.product_id, row.branch_id || row.branch, row.unit || '']);
  // Keep units and tenant/branch identities separate.
  latestInventorySnapshots(inventoryItems).forEach(item => {
    const key = stockKey(item);
    if (!map[key] || item.date > map[key].date) {
      map[key] = {
        ...item,
        purchasedQty: 0,
        wastedQty: 0,
      };
    }
  });

  // Add purchases
  purchases.forEach(p => {
    const key = stockKey(p);
    if (map[key]) map[key].purchasedQty += Number(p.qty || 0);
  });

  // Subtract waste
  wastageItems.forEach(w => {
    const key = stockKey(w);
    if (map[key]) map[key].wastedQty += Number(w.quantity ?? w.qty ?? 0);
  });

  // Compute current stock
  Object.values(map).forEach(item => {
    const current = item.quantity;
    item.currentStock = current !== null && current !== undefined && current !== '' && Number.isFinite(Number(current))
      ? Number(current)
      : Number(item.opening_stock || 0) + item.purchasedQty - item.wastedQty;
    item.isLow = item.currentStock <= Number(item.low_stock_threshold ?? 5);
  });

  return Object.values(map);
}

/**
 * Send WhatsApp alert for a low-stock item.
 * Opens WA deep-link — in a real setup this would be a backend call to WA Business API.
 */
export function sendWhatsAppAlert(phone, items, branchLabel) {
  if (!phone) return;
  const lines = items.map(i => `• ${i.product_name}: ${i.currentStock.toFixed(1)} ${i.unit || ''} (min: ${i.low_stock_threshold})`).join('\n');
  const msg = encodeURIComponent(`⚠️ Low Stock Alert — ${branchLabel}\n\n${lines}\n\nPlease arrange restocking.`);
  window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${msg}`, '_blank');
}

/**
 * Build a grouped map of low-stock items per branch.
 */
export function groupLowStockByBranch(liveStock) {
  const map = {};
  liveStock.filter(i => i.isLow).forEach(i => {
    if (!map[i.branch]) map[i.branch] = [];
    map[i.branch].push(i);
  });
  return map;
}