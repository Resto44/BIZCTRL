import { supabase } from '@/api/supabaseClient';

export const INVENTORY_PAGES = [
  { key: 'overview', path: '/inventory' },
  { key: 'stock', path: '/inventory/stock' },
  { key: 'operations', path: '/inventory/operations' },
  { key: 'control', path: '/inventory/control' },
];
export const EMPTY_INVENTORY = Object.freeze({ summary: {}, warehouses: [], branches: [], expiry: [], movements: [], replenishment: [], purchase_orders: [], documents: { total: 0, rows: [] } });
export async function inventoryRPC(name, params) {
  const { data, error } = await supabase.rpc(`erp_retail_inventory_${name}`, params);
  if (error) throw error;
  return data;
}
export function productName(product, lang = 'en') {
  return product?.[`name_${lang}`] || product?.name || product?.product_name || product?.sku || '—';
}
export function parseOrderItems(items) {
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { return []; } }
  return Array.isArray(items) ? items : [];
}
export function documentActions(doc, { owner, edit, purchase, userId, branchId }) {
  if (!doc || !edit) return [];
  const source = !branchId || doc.branch_id === branchId;
  const destination = !branchId || doc.destination_branch_id === branchId;
  const actions = [];
  if (doc.kind === 'count' && doc.status === 'draft' && source) actions.push('save_count', 'submit');
  if (doc.status === 'requested' && source) {
    if (doc.kind === 'receipt' && purchase) actions.push('receive');
    else if (doc.kind !== 'receipt' && owner) actions.push('approve', 'reject');
  }
  if (doc.kind === 'transfer' && doc.status === 'approved' && source) actions.push('dispatch');
  if (doc.kind === 'transfer' && doc.status === 'in_transit' && destination) actions.push('receive');
  if (['draft', 'requested', 'approved'].includes(doc.status) && source && (owner || doc.created_by === userId) && !(doc.kind === 'reorder' && doc.status === 'approved')) actions.push('cancel');
  return actions;
}
export function validateInventoryLines(kind, lines) {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 100) return 'Select 1–100 products.';
  if (lines.some((l) => !l.product_id || !Number.isFinite(Number(l.quantity)) || Number(l.quantity) === 0 || (kind !== 'adjustment' && Number(l.quantity) < 0) || !Number.isFinite(Number(l.unit_cost)) || Number(l.unit_cost) < 0)) return 'Enter valid quantities and costs.';
  return null;
}
export function csvCell(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const text = String(value ?? '');
  return `"${(/^[=+\-@\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`;
}
