import { supabase } from '@/api/supabaseClient';

const MANAGED_ALERT_TYPES = ['cash_shortage', 'customer_credit_overdue', 'supplier_invoice_overdue', 'low_stock', 'out_of_stock', 'negative_profit'];
const numeric = (value) => Number(value) || 0;

function resolveBranch(branches, branchId, branchKey) {
  return (branches || []).find((branch) =>
    (branchId && branch.id === branchId)
    || (branchKey && (branch.key === branchKey || branch.branch_key === branchKey)),
  ) || null;
}

function candidate({ sourceKey, type, title, message, severity, branch, metadata = {} }) {
  return {
    source_key: sourceKey,
    type,
    title,
    message,
    severity,
    branch_id: branch?.id || null,
    branch: branch?.key || branch?.branch_key || null,
    metadata,
  };
}

export function buildActiveAlertCandidates({
  inventory = [],
  todaySales = [],
  customerDebts = [],
  supplierInvoices = [],
  netProfit = 0,
  branches = [],
  today,
  currency = '',
}) {
  const result = [];

  for (const item of inventory) {
    const quantity = numeric(item.quantity ?? item.opening_stock);
    const threshold = numeric(item.low_stock_threshold ?? item.min_quantity ?? item.reorder_point);
    const branch = resolveBranch(branches, item.branch_id, item.branch || item.branch_key);
    if (quantity <= 0) {
      result.push(candidate({
        sourceKey: `inventory:${item.id}`,
        type: 'out_of_stock',
        title: `Out of stock: ${item.product_name || item.name || 'Inventory item'}`,
        message: `${item.product_name || item.name || 'This item'} has no available stock and needs replenishment.`,
        severity: 'critical',
        branch,
        metadata: { inventory_id: item.id, quantity, threshold },
      }));
    } else if (threshold > 0 && quantity <= threshold) {
      result.push(candidate({
        sourceKey: `inventory:${item.id}`,
        type: 'low_stock',
        title: `Low stock: ${item.product_name || item.name || 'Inventory item'}`,
        message: `${item.product_name || item.name || 'This item'} has ${quantity} remaining; threshold is ${threshold}.`,
        severity: 'warning',
        branch,
        metadata: { inventory_id: item.id, quantity, threshold },
      }));
    }
  }

  for (const sale of todaySales) {
    const shortage = numeric(sale.cash_difference);
    if (shortage >= 0) continue;
    const branch = resolveBranch(branches, sale.branch_id, sale.branch || sale.branch_key);
    result.push(candidate({
      sourceKey: `cash-shortage:${sale.id}`,
      type: 'cash_shortage',
      title: 'Cash shortage requires review',
      message: `Cash reconciliation is short by ${currency}${Math.abs(shortage).toLocaleString()}.`,
      severity: 'critical',
      branch,
      metadata: { daily_sale_id: sale.id, cash_difference: shortage, date: sale.date },
    }));
  }

  for (const debt of customerDebts) {
    if (['paid', 'written_off', 'cancelled'].includes(debt.status) || !debt.due_date || debt.due_date > today) continue;
    const remaining = numeric(debt.remaining_amount ?? debt.balance ?? debt.total_amount);
    if (remaining <= 0) continue;
    const branch = resolveBranch(branches, debt.branch_id, debt.branch || debt.branch_key);
    result.push(candidate({
      sourceKey: `customer-debt:${debt.id}`,
      type: 'customer_credit_overdue',
      title: `Overdue customer balance: ${debt.party_name || debt.customer_name || 'Customer'}`,
      message: `${currency}${remaining.toLocaleString()} is overdue since ${debt.due_date}.`,
      severity: 'warning',
      branch,
      metadata: { debt_id: debt.id, due_date: debt.due_date, remaining_amount: remaining },
    }));
  }

  for (const invoice of supplierInvoices) {
    if (['paid', 'cancelled'].includes(invoice.status) || !invoice.due_date || invoice.due_date > today) continue;
    const remaining = Math.max(0, numeric(invoice.total_amount) - numeric(invoice.paid_amount));
    if (remaining <= 0) continue;
    const branch = resolveBranch(branches, invoice.branch_id, invoice.branch || invoice.branch_key);
    result.push(candidate({
      sourceKey: `supplier-invoice:${invoice.id}`,
      type: 'supplier_invoice_overdue',
      title: `Supplier invoice overdue: ${invoice.supplier_name || invoice.invoice_number || 'Invoice'}`,
      message: `${currency}${remaining.toLocaleString()} is overdue since ${invoice.due_date}.`,
      severity: 'high',
      branch,
      metadata: { supplier_invoice_id: invoice.id, due_date: invoice.due_date, remaining_amount: remaining },
    }));
  }

  if (numeric(netProfit) < 0) {
    result.push(candidate({
      sourceKey: `negative-profit:${today}`,
      type: 'negative_profit',
      title: 'Negative operating result requires review',
      message: `Current operating result is ${currency}${Math.abs(numeric(netProfit)).toLocaleString()} below zero.`,
      severity: 'critical',
      metadata: { date: today, net_profit: numeric(netProfit) },
    }));
  }

  return result;
}

export async function reconcileActiveAlerts({ restaurantId, candidates }) {
  if (!restaurantId) return [];

  const { data: existing, error: readError } = await supabase
    .from('active_alerts')
    .select('id, source_key, status')
    .eq('restaurant_id', restaurantId)
    .in('type', MANAGED_ALERT_TYPES)
    .limit(1000);
  if (readError) throw readError;

  const existingByKey = new Map((existing || []).map((alert) => [alert.source_key, alert]));
  const candidateKeys = new Set((candidates || []).map((alert) => alert.source_key));

  for (const alert of candidates || []) {
    const current = existingByKey.get(alert.source_key);
    if (!current) {
      const { error } = await supabase.from('active_alerts').insert({ restaurant_id: restaurantId, ...alert });
      if (error) throw error;
      continue;
    }
    if (current.status === 'resolved') continue;
    const { error } = await supabase
      .from('active_alerts')
      .update({ ...alert, status: 'active', resolved_at: null, resolved_by: null })
      .eq('id', current.id);
    if (error) throw error;
  }

  const clearedIds = (existing || [])
    .filter((alert) => alert.status === 'active' && !candidateKeys.has(alert.source_key))
    .map((alert) => alert.id);
  if (clearedIds.length > 0) {
    const { error } = await supabase
      .from('active_alerts')
      .update({ status: 'cleared', resolved_at: new Date().toISOString() })
      .in('id', clearedIds);
    if (error) throw error;
  }

  return candidates || [];
}
