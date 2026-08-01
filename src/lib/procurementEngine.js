/**
 * Procurement Engine — Phase 7
 * Enterprise Accounts Payable & Inventory Integration Logic
 *
 * Handles:
 * - Invoice creation with approval workflow
 * - Inventory stock update on approval
 * - Supplier liability (debt record) creation
 * - Partial payment processing
 * - Cash flow integration
 * - Overdue detection
 */

import { supabase } from '@/api/supabaseClient';
import { format } from 'date-fns';

// ── Approval Threshold ─────────────────────────────────────────────────────
const AUTO_APPROVE_THRESHOLD = 5000;

// ── Status helpers ─────────────────────────────────────────────────────────
export function computeInvoiceStatus(totalAmount, paidAmount) {
  const remaining = (totalAmount || 0) - (paidAmount || 0);
  if (remaining <= 0) return 'paid';
  if (paidAmount > 0) return 'partial';
  return 'unpaid';
}

export function computeApprovalStatus(totalAmount) {
  return totalAmount < AUTO_APPROVE_THRESHOLD ? 'auto_approved' : 'pending';
}

// ── Line item calculations ─────────────────────────────────────────────────
export function calcLineTotal({ quantity = 0, unit_cost = 0, discount = 0, tax = 0 }) {
  const base = quantity * unit_cost;
  const afterDiscount = base - (discount || 0);
  const taxAmount = afterDiscount * ((tax || 0) / 100);
  return Math.max(0, afterDiscount + taxAmount);
}

export function calcInvoiceTotals(items = [], additionalCosts = []) {
  const subtotal = items.reduce((sum, item) => sum + (item.line_total || calcLineTotal(item)), 0);
  const taxAmount = items.reduce((sum, item) => {
    const base = (item.quantity || 0) * (item.unit_cost || 0) - (item.discount || 0);
    return sum + base * ((item.tax || 0) / 100);
  }, 0);
  const discountAmount = items.reduce((sum, item) => sum + (item.discount || 0), 0);
  const additionalTotal = additionalCosts.reduce((sum, c) => sum + (c.amount || 0), 0);
  const grandTotal = subtotal + additionalTotal;
  return { subtotal, taxAmount, discountAmount, additionalTotal, grandTotal };
}

// ── Create Purchase Invoice ────────────────────────────────────────────────
export async function createPurchaseInvoice({
  invoiceData,
  items,
  additionalCosts,
  createdBy,
}) {
  const { grandTotal, subtotal, taxAmount, discountAmount } = calcInvoiceTotals(items, additionalCosts);
  const approvalStatus = computeApprovalStatus(grandTotal);
  const status = approvalStatus === 'auto_approved' ? 'approved' : 'pending';

  const payload = {
    ...invoiceData,
    items: items || [],
    additional_costs: additionalCosts || [],
    total_amount: grandTotal,
    subtotal,
    tax_amount: taxAmount,
    discount_amount: discountAmount,
    paid_amount: invoiceData.paid_amount || 0,
    approval_status: approvalStatus,
    status,
    created_by: createdBy,
  };

  const { data: invoice, error } = await supabase
    .from('supplier_invoices')
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(`Invoice creation failed: ${error.message}`);

  // If auto-approved, process inventory and create debt record immediately
  if (approvalStatus === 'auto_approved') {
    await processApprovedInvoice(invoice, createdBy);
  }

  return invoice;
}

// ── Delete Purchase Invoice with Complete Rollback ─────────────────────────
export async function deletePurchaseInvoiceWithRollback(invoiceId) {
  const { data, error } = await supabase.rpc('delete_supplier_invoice_with_rollback', {
    p_invoice_id: invoiceId,
  });

  if (error) throw new Error(`Purchase invoice deletion failed: ${error.message}`);
  return data;
}

// ── Update Purchase Invoice ────────────────────────────────────────────────
export async function updatePurchaseInvoice({
  invoiceId,
  invoiceData,
  items,
  additionalCosts,
  createdBy,
}) {
  const { grandTotal, subtotal, taxAmount, discountAmount } = calcInvoiceTotals(items, additionalCosts);

  const payload = {
    ...invoiceData,
    items: items || [],
    additional_costs: additionalCosts || [],
    total_amount: grandTotal,
    subtotal,
    tax_amount: taxAmount,
    discount_amount: discountAmount,
    updated_date: new Date().toISOString(),
  };

  const { data: invoice, error } = await supabase
    .from('supplier_invoices')
    .update(payload)
    .eq('id', invoiceId)
    .select()
    .single();

  if (error) throw new Error(`Invoice update failed: ${error.message}`);
  return invoice;
}

// ── Approve Invoice (manager action) ──────────────────────────────────────
export async function approveInvoice(invoiceId, createdBy) {
  const { data: invoice, error } = await supabase
    .from('supplier_invoices')
    .update({ approval_status: 'approved', status: 'approved', updated_date: new Date().toISOString() })
    .eq('id', invoiceId)
    .select()
    .single();

  if (error) throw new Error(`Approval failed: ${error.message}`);

  await processApprovedInvoice(invoice, createdBy);
  return invoice;
}

// ── Process Approved Invoice: Inventory + Debt Record ─────────────────────
export async function processApprovedInvoice(invoice, createdBy) {
  const items = invoice.items || [];
  const additionalCosts = invoice.additional_costs || [];
  const { grandTotal } = calcInvoiceTotals(items, additionalCosts);

  // 1. Update inventory for each line item
  for (const item of items) {
    if (!item.product_id) continue;
    await updateInventoryOnPurchase({
      productId:    item.product_id,
      productName:  item.product_name,
      branch:       invoice.branch,
      quantity:     item.quantity || 0,
      unitCost:     item.unit_cost || 0,
      unit:         item.unit,
      createdBy,
      supplierId:   invoice.supplier_id,
      supplierName: invoice.supplier_name,
      invoiceId:    invoice.id,
    });
  }

  // 2. Create supplier debt record if not fully paid
  const paidAmount = invoice.paid_amount || 0;
  const remaining = grandTotal - paidAmount;

  if (remaining > 0) {
    await createSupplierDebtRecord({
      invoice,
      totalAmount: grandTotal,
      paidAmount,
      remaining,
      createdBy,
    });
  }

  // 3. Update invoice with debt_record_id if created
  return invoice;
}

// ── Price History Recording ───────────────────────────────────────────────
/**
 * Records a price change entry in product_price_history.
 * Only inserts when the new price differs from the previous price.
 * Never overwrites — always inserts a new immutable row.
 */
export async function recordPriceHistory({
  productId,
  productName,
  previousPrice,
  newPrice,
  supplierId,
  supplierName,
  branch,
  invoiceId,
  createdBy,
}) {
  // Only record when price actually changes
  if (previousPrice === newPrice) return;

  const { error } = await supabase
    .from('product_price_history')
    .insert({
      product_id:    productId,
      product_name:  productName,
      previous_price: previousPrice,
      new_price:     newPrice,
      supplier_id:   supplierId || null,
      supplier_name: supplierName || null,
      branch:        branch || null,
      invoice_id:    invoiceId || null,
      recorded_at:   new Date().toISOString(),
      created_by:    createdBy,
    });

  if (error) console.error('[procurementEngine] price history insert error:', error.message);
}

// ── Inventory Update ───────────────────────────────────────────────────────
export async function updateInventoryOnPurchase({
  productId,
  productName,
  branch,
  quantity,
  unitCost,
  unit,
  createdBy,
  supplierId,
  supplierName,
  invoiceId,
}) {
  // Find existing inventory record
  const { data: existing } = await supabase
    .from('inventory')
    .select('*')
    .eq('product_id', productId)
    .eq('branch', branch)
    .single();

  if (existing) {
    // Update: recalculate average cost
    const oldQty = existing.quantity || 0;
    const oldCost = existing.average_cost || existing.last_purchase_price || 0;
    const newQty = oldQty + quantity;
    const newAvgCost = newQty > 0 ? ((oldQty * oldCost) + (quantity * unitCost)) / newQty : unitCost;
    const newTotalValue = newQty * newAvgCost;

    const { error } = await supabase
      .from('inventory')
      .update({
        quantity: newQty,
        average_cost: newAvgCost,
        last_purchase_price: unitCost,
        total_value: newTotalValue,
        last_updated: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) console.error('[procurementEngine] inventory update error:', error.message);
  } else {
    // Create new inventory record
    const { error } = await supabase
      .from('inventory')
      .insert({
        product_id: productId,
        product_name: productName,
        branch,
        quantity,
        opening_stock: 0,
        average_cost: unitCost,
        last_purchase_price: unitCost,
        total_value: quantity * unitCost,
        unit: unit || '',
        date: new Date().toISOString().split('T')[0],
        created_by: createdBy,
      });

    if (error) console.error('[procurementEngine] inventory create error:', error.message);
  }

  // Also update product default_cost and record price history
  if (unitCost > 0) {
    // Fetch current cost before overwriting
    const { data: currentProduct } = await supabase
      .from('products')
      .select('default_cost, purchase_cost')
      .eq('id', productId)
      .single();

    const previousPrice = currentProduct?.purchase_cost ?? currentProduct?.default_cost ?? 0;

    await supabase
      .from('products')
      .update({ default_cost: unitCost, purchase_cost: unitCost, updated_date: new Date().toISOString() })
      .eq('id', productId);

    // Record price history entry (only if price changed)
    await recordPriceHistory({
      productId,
      productName,
      previousPrice,
      newPrice: unitCost,
      supplierId,
      supplierName,
      branch,
      invoiceId,
      createdBy,
    });
  }
}

// ── Create Supplier Debt Record ────────────────────────────────────────────
export async function createSupplierDebtRecord({
  invoice,
  totalAmount,
  paidAmount,
  remaining,
  createdBy,
}) {
  const status = paidAmount > 0 ? 'partial' : 'open';

  const { data: debtRecord, error } = await supabase
    .from('debt_records')
    .insert({
      type: 'liability',
      party_type: 'supplier',
      party_name: invoice.supplier_name || 'Unknown Supplier',
      branch: invoice.branch,
      invoice_number: invoice.invoice_number,
      date: invoice.date,
      due_date: invoice.due_date,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      remaining_amount: remaining,
      status,
      supplier_invoice_id: invoice.id,
      description: `Purchase Invoice ${invoice.invoice_number || invoice.id}`,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) {
    console.error('[procurementEngine] debt record error:', error.message);
    return null;
  }

  // Link debt record back to invoice
  await supabase
    .from('supplier_invoices')
    .update({ debt_record_id: debtRecord.id })
    .eq('id', invoice.id);

  return debtRecord;
}

// ── Add Payment to Invoice ─────────────────────────────────────────────────
export async function addInvoicePayment({
  invoiceId,
  amount,
  paymentMethod,
  notes,
  date,
  createdBy,
}) {
  // 1. Get current invoice
  const { data: invoice, error: fetchError } = await supabase
    .from('supplier_invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (fetchError) throw new Error(`Invoice fetch failed: ${fetchError.message}`);

  const newPaidAmount = (invoice.paid_amount || 0) + amount;
  const remaining = (invoice.total_amount || 0) - newPaidAmount;
  const newStatus = computeInvoiceStatus(invoice.total_amount, newPaidAmount);
  const paymentDate = date || new Date().toISOString().split('T')[0];
  const isCash = !paymentMethod || paymentMethod === 'cash';

  // 2. Insert payment record
  // Only use columns that exist in the supplier_payments schema:
  // id, date, branch, supplier_id, supplier_name, amount, payment_method,
  // notes, created_by, created_date, updated_date, invoice_id, restaurant_id,
  // branch_id, tenant_id
  const { data: payment, error: payError } = await supabase
    .from('supplier_payments')
    .insert({
      invoice_id: invoiceId,
      supplier_id: invoice.supplier_id,
      supplier_name: invoice.supplier_name,
      branch: invoice.branch,
      amount,
      payment_method: paymentMethod || 'cash',
      restaurant_id: invoice.restaurant_id || null,
      // RLS required scope fields — branch_id must be present for policy check
      branch_id: invoice.branch_id || null,
      tenant_id: invoice.tenant_id || null,
      notes,
      date: paymentDate,
      created_by: createdBy,
    })
    .select()
    .single();

  if (payError) throw new Error(`Payment creation failed: ${payError.message}`);

  // 3. Update invoice paid_amount and status
  await supabase
    .from('supplier_invoices')
    .update({
      paid_amount: newPaidAmount,
      status: newStatus,
      updated_date: new Date().toISOString(),
    })
    .eq('id', invoiceId);

  // 4. Update debt record if exists
  if (invoice.debt_record_id) {
    await supabase
      .from('debt_records')
      .update({
        paid_amount: newPaidAmount,
        remaining_amount: Math.max(0, remaining),
        status: newStatus === 'paid' ? 'paid' : 'partial',
        updated_date: new Date().toISOString(),
      })
      .eq('id', invoice.debt_record_id);
  }

  // 5. Create Treasury (WalletTransaction) record so the payment appears
  //    in the Treasury page and is included in dashboard refreshes.
  try {
    await supabase
      .from('wallet_transactions')
      .insert({
        transaction_date: paymentDate,
        transaction_type: 'branch_purchase_payment',
        flow_type: 'branch_purchase_payment',
        direction: 'out',
        wallet: 'branch_cash',
        branch: invoice.branch,
        amount,
        payment_method: isCash ? 'cash' : 'network',
        description: `Supplier Payment — ${invoice.supplier_name || 'Supplier'} — Invoice ${invoice.invoice_number || invoiceId}`,
        reference_id: invoiceId,
        auto_generated: true,
        recorded_by: createdBy,
        created_by: createdBy,
        restaurant_id: invoice.restaurant_id || null,
      });
  } catch (txErr) {
    console.warn('[procurementEngine] WalletTransaction creation failed (non-fatal):', txErr.message);
  }

  // 6. Supplier balance is computed from supplier_invoices (no outstanding_balance column on suppliers).
  //    Nothing to update on the suppliers table — the ledger reads live from invoices.

  return { payment, newStatus, remaining: Math.max(0, remaining) };
}

// ── Overdue Detection ──────────────────────────────────────────────────────
export function getOverdueInfo(invoice) {
  if (!invoice.due_date || invoice.status === 'paid' || invoice.status === 'cancelled') {
    return { isOverdue: false, daysOverdue: 0, color: null };
  }

  const today = new Date();
  const due = new Date(invoice.due_date);
  const diffMs = today - due;
  const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (daysOverdue <= 0) return { isOverdue: false, daysOverdue: 0, color: null };

  let color;
  if (daysOverdue <= 7) color = 'yellow';
  else if (daysOverdue <= 30) color = 'orange';
  else color = 'red';

  return { isOverdue: true, daysOverdue, color };
}

// ── Procurement KPIs ───────────────────────────────────────────────────────
export function computeProcurementKPIs(invoices = [], payments = []) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const thisMonthStart = today.substring(0, 7) + '-01';

  // KPI must include Approved supplier invoices only
  const approvedInvoices = invoices.filter(i => 
    ['approved', 'auto_approved'].includes(i.approval_status) || 
    ['approved', 'paid', 'partial'].includes(i.status)
  );

  // Use invoice transaction date (purchase date), never created_at
  const purchasesToday = approvedInvoices
    .filter(i => i.date === today)
    .reduce((s, i) => s + (i.total_amount || 0), 0);

  const purchasesThisMonth = approvedInvoices
    .filter(i => i.date >= thisMonthStart)
    .reduce((s, i) => s + (i.total_amount || 0), 0);

  // Payables usually consider all non-cancelled invoices that are approved or at least not draft
  const outstandingPayables = approvedInvoices
    .filter(i => i.status !== 'paid' && i.status !== 'cancelled')
    .reduce((s, i) => s + ((i.total_amount || 0) - (i.paid_amount || 0)), 0);

  const overduePayables = approvedInvoices
    .filter(i => {
      const { isOverdue } = getOverdueInfo(i);
      return isOverdue;
    })
    .reduce((s, i) => s + ((i.total_amount || 0) - (i.paid_amount || 0)), 0);

  // Top supplier by total spend (Approved only)
  const supplierSpend = {};
  approvedInvoices.forEach(i => {
    const name = i.supplier_name || 'Unknown';
    supplierSpend[name] = (supplierSpend[name] || 0) + (i.total_amount || 0);
  });
  const topSupplier = Object.entries(supplierSpend).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  // Most purchased product (Approved only)
  const productQty = {};
  approvedInvoices.forEach(i => {
    (i.items || []).forEach(item => {
      const name = item.product_name || 'Unknown';
      productQty[name] = (productQty[name] || 0) + (item.quantity || 0);
    });
  });
  const mostPurchasedProduct = Object.entries(productQty).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  const avgPurchaseCost = approvedInvoices.length > 0
    ? approvedInvoices.reduce((s, i) => s + (i.total_amount || 0), 0) / approvedInvoices.length
    : 0;

  const inventoryValueAdded = approvedInvoices
    .reduce((s, i) => s + (i.subtotal || i.total_amount || 0), 0);

  return {
    purchasesToday,
    purchasesThisMonth,
    outstandingPayables,
    overduePayables,
    topSupplier,
    mostPurchasedProduct,
    avgPurchaseCost,
    inventoryValueAdded,
  };
}

// ── Distribute Additional Costs Proportionally ────────────────────────────
export function distributeAdditionalCosts(items = [], additionalCosts = []) {
  const totalAdditional = additionalCosts.reduce((s, c) => s + (c.amount || 0), 0);
  if (totalAdditional === 0 || items.length === 0) return items;

  const subtotal = items.reduce((s, i) => s + (i.line_total || 0), 0);
  if (subtotal === 0) return items;

  return items.map(item => {
    const share = (item.line_total || 0) / subtotal;
    const allocatedCost = totalAdditional * share;
    return {
      ...item,
      allocated_additional_cost: allocatedCost,
      effective_unit_cost: ((item.line_total || 0) + allocatedCost) / (item.quantity || 1),
    };
  });
}
