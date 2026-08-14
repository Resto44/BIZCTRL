/**
 * Cash Register Service
 * Central service for all cash register operations.
 *
 * Principles:
 * - Cash is NEVER entered twice: all postings go through this service.
 * - Every module (Sales, Purchases, Expenses, Payments) calls this service.
 * - Supabase triggers handle DB-level auto-posting for robustness.
 * - This service handles the frontend-side orchestration.
 */
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { audit } from '@/lib/auditLogger';
import { format } from 'date-fns';

// ── Helpers ──────────────────────────────────────────────────────────────────

const today = () => format(new Date(), 'yyyy-MM-dd');

/**
 * Get or create the daily cash settlement for a given date/branch.
 * The opening_cash is automatically set from the previous day's expected_closing_cash.
 */
export async function getOrCreateSettlement({ date, branch, branchId, createdBy, restaurantId }) {
  const d = date || today();

  // Try to find existing settlement
  const existing = await base44.entities.DailyCashSettlement.filter({
    date: d,
    branch,
    created_by: createdBy,
  }, '-created_date', 1);

  if (existing && existing.length > 0) {
    return existing[0];
  }

  // Get previous day's closing as opening
  const prevSettlements = await base44.entities.DailyCashSettlement.filter({
    branch,
    created_by: createdBy,
  }, '-date', 10);

  const prevSettlement = prevSettlements.find(s =>
    s.date < d && ['Approved', 'Submitted'].includes(s.status)
  );

  const openingCash = prevSettlement ? Number(prevSettlement.expected_closing_cash || 0) : 0;

  const newSettlement = await base44.entities.DailyCashSettlement.create({
    date: d,
    branch,
    restaurant_id: restaurantId || null,
    // RLS required scope field
    branch_id: branchId || null,
    opening_cash: openingCash,
    status: 'Draft',
  });

  await audit.create('DailyCashSettlement', newSettlement, branch);
  return newSettlement;
}

/**
 * Recompute the expected_closing_cash and difference for a settlement.
 * Called after any cash movement is posted.
 */
export function computeExpectedClosing(settlement) {
  const s = settlement;
  const expected =
    Number(s.opening_cash || 0) +
    Number(s.cash_sales || 0) +
    Number(s.customer_debt_collection || 0) +
    Number(s.owner_injection || 0) +
    Number(s.cash_transfer_in || 0) +
    Number(s.supplier_refunds || 0) -
    Number(s.cash_purchases || 0) -
    Number(s.cash_expenses || 0) -
    Number(s.supplier_payments || 0) -
    Number(s.cash_refunds_out || 0) -
    Number(s.cash_transfer_out || 0);

  const difference = Number(s.cash_counted || 0) - expected;

  return {
    expected_closing_cash: expected,
    difference,
    shortage: difference < 0 ? Math.abs(difference) : 0,
    overage: difference > 0 ? difference : 0,
  };
}

/**
 * Update a settlement's computed fields after any change.
 */
export async function refreshSettlement(settlementId) {
  const settlement = await base44.entities.DailyCashSettlement.get(settlementId);
  if (!settlement) return null;

  const computed = computeExpectedClosing(settlement);
  return await base44.entities.DailyCashSettlement.update(settlementId, computed);
}

// ── Cash Movement Posting ─────────────────────────────────────────────────────

/**
 * Post a cash movement to the ledger and update the daily settlement.
 * This is the single entry point for ALL cash movements.
 * Supabase triggers also handle this at the DB level for robustness.
 */
export async function postCashMovement({
  date,
  branch,
  branchId,          // UUID branch_id — required for RLS
  restaurantId,
  createdBy,
  direction,         // 'in' | 'out'
  amount,
  movementType,      // see CashMovement.jsonc enum
  sourceModule,      // see CashMovement.jsonc enum
  sourceRecordId,
  description,
  postedByName,
}) {
  if (!amount || amount <= 0) return null;

  const d = date || today();

  // Get or create settlement
  const settlement = await getOrCreateSettlement({
    date: d,
    branch,
    branchId,
    createdBy,
    restaurantId,
  });

  // Post cash movement record
  const movement = await base44.entities.CashMovement.create({
    date: d,
    branch,
    restaurant_id: restaurantId || null,
    // RLS required scope field
    branch_id: branchId || null,
    direction,
    amount: Number(amount),
    movement_type: movementType,
    source_module: sourceModule,
    source_record_id: sourceRecordId || '',
    description: description || '',
    posted_by: createdBy,
    posted_by_name: postedByName || '',
    posted_at: new Date().toISOString(),
    settlement_id: settlement.id,
  });

  // Update the settlement's corresponding field
  const fieldMap = {
    cash_sale:                'cash_sales',
    customer_debt_collection: 'customer_debt_collection',
    supplier_refund:          'supplier_refunds',
    owner_injection:          'owner_injection',
    cash_transfer_in:         'cash_transfer_in',
    cash_purchase:            'cash_purchases',
    cash_expense:             'cash_expenses',
    supplier_payment:         'supplier_payments',
    customer_refund:          'cash_refunds_out',
    cash_transfer_out:        'cash_transfer_out',
  };

  const field = fieldMap[movementType];
  if (field) {
    // Recalculate the field total from all non-reversed movements
    const allMovements = await base44.entities.CashMovement.filter({
      settlement_id: settlement.id,
      movement_type: movementType,
      is_reversed: false,
    }, '-created_date', 500);

    const total = allMovements.reduce((sum, m) => sum + Number(m.amount || 0), 0);

    const updates = { [field]: total };
    const computed = computeExpectedClosing({ ...settlement, ...updates });
    await base44.entities.DailyCashSettlement.update(settlement.id, {
      ...updates,
      ...computed,
    });
  }

  return movement;
}

/**
 * Reverse a previously posted cash movement (e.g., when a sale is deleted).
 */
export async function reverseCashMovement(sourceModule, sourceRecordId, branch) {
  const movements = await base44.entities.CashMovement.filter({
    source_module: sourceModule,
    source_record_id: sourceRecordId,
    is_reversed: false,
  }, '-created_date', 10);

  for (const movement of movements) {
    await base44.entities.CashMovement.update(movement.id, { is_reversed: true });

    if (movement.settlement_id) {
      await refreshSettlement(movement.settlement_id);
    }
  }

  await audit.delete('CashMovement', { id: sourceRecordId, source_module: sourceModule }, branch);
}

// ── Owner Cash Injection ──────────────────────────────────────────────────────

/**
 * Create an Owner Cash Injection.
 * - Increases Cash Register (DailyCashSettlement.owner_injection)
 * - Creates WalletTransaction (owner_investment type)
 * - Creates CashMovement record
 * - Appears in Daily Settlement
 */
export async function createOwnerCashInjection({
  date,
  branch,
  branchId,
  restaurantId,
  amount,
  reason,
  notes,
  createdBy,
  createdByName,
  shortageId,
}) {
  const d = date || today();

  // 1. Create the injection record
  const injection = await base44.entities.OwnerCashInjection.create({
    date: d,
    branch,
    restaurant_id: restaurantId || null,
    // RLS required scope field
    branch_id: branchId || null,
    amount: Number(amount),
    reason: reason || 'Operational Funding',
    notes: notes || '',
    created_by_name: createdByName || '',
    approval_status: 'Approved',
    approved_by: createdBy,
    approved_at: new Date().toISOString(),
    shortage_id: shortageId || null,
  });

  // 2. Create WalletTransaction for treasury tracking
  const walletTx = await base44.entities.WalletTransaction.create({
    transaction_date: d,
    transaction_type: 'owner_capital_contribution',
    wallet: 'branch_cash',
    direction: 'in',
    branch,
    restaurant_id: restaurantId || null,
    branch_id: branchId || null,
    amount: Number(amount),
    payment_method: 'cash',
    description: `Owner Cash Injection: ${reason || 'Operational Funding'}`,
    reference_id: injection.id,
    auto_generated: true,
    recorded_by: createdBy,
  });

  // 3. Update injection with wallet transaction reference
  await base44.entities.OwnerCashInjection.update(injection.id, {
    wallet_transaction_id: walletTx.id,
  });

  // 4. Post cash movement (this also updates the settlement)
  await postCashMovement({
    date: d,
    branch,
    branchId,
    restaurantId,
    createdBy,
    direction: 'in',
    amount: Number(amount),
    movementType: 'owner_injection',
    sourceModule: 'OwnerCashInjection',
    sourceRecordId: injection.id,
    description: `Owner Cash Injection: ${reason || ''}`,
    postedByName: createdByName,
  });

  // 5. If this resolves a shortage, update the shortage record
  if (shortageId) {
    await base44.entities.CashShortage.update(shortageId, {
      status: 'Resolved',
      resolution: 'Owner Injection',
      injection_id: injection.id,
      owner_notes: notes || '',
    });
  }

  await audit.create('OwnerCashInjection', injection, branch);
  return injection;
}

// ── Daily Cash Settlement ─────────────────────────────────────────────────────

/**
 * Submit a daily cash settlement.
 * - Sets status to 'Submitted'
 * - Triggers shortage/overage record creation (via DB trigger or frontend)
 * - Sends notification to owner
 */
export async function submitSettlement({ settlementId, cashCounted, notes, manager, managerName }) {
  const settlement = await base44.entities.DailyCashSettlement.get(settlementId);
  if (!settlement) throw new Error('Settlement not found');

  const cashCountedNum = Number(cashCounted || 0);
  const computed = computeExpectedClosing({ ...settlement, cash_counted: cashCountedNum });

  const updated = await base44.entities.DailyCashSettlement.update(settlementId, {
    cash_counted: cashCountedNum,
    notes: notes || settlement.notes,
    manager: manager || settlement.manager,
    manager_name: managerName || settlement.manager_name,
    submitted_at: new Date().toISOString(),
    status: 'Submitted',
    ...computed,
  });

  // Create shortage/overage record if there is a discrepancy
  if (computed.difference !== 0) {
    const shortageRecord = await base44.entities.CashShortage.create({
      date: settlement.date,
      branch: settlement.branch,
      restaurant_id: settlement.restaurant_id || null,
      // RLS required scope field
      branch_id: settlement.branch_id || null,
      settlement_id: settlementId,
      expected_amount: computed.expected_closing_cash,
      actual_amount: cashCountedNum,
      shortage_amount: computed.shortage,
      overage_amount: computed.overage,
      type: computed.difference < 0 ? 'Shortage' : 'Overage',
      status: 'Pending',
      reported_by: manager,
    });

    await base44.entities.DailyCashSettlement.update(settlementId, {
      shortage_record_id: shortageRecord.id,
    });
  }

  await audit.create('DailyCashSettlement', updated, settlement.branch);
  return updated;
}

/**
 * Owner approves a daily cash settlement.
 */
export async function approveSettlement({ settlementId, approvedBy }) {
  const updated = await base44.entities.DailyCashSettlement.update(settlementId, {
    status: 'Approved',
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
  });
  await audit.update('DailyCashSettlement', settlementId, { status: 'Submitted' }, { status: 'Approved' });
  return updated;
}

/**
 * Owner rejects a daily cash settlement.
 */
export async function rejectSettlement({ settlementId, rejectedBy, notes }) {
  const updated = await base44.entities.DailyCashSettlement.update(settlementId, {
    status: 'Rejected',
    notes: notes || '',
    approved_by: rejectedBy,
    approved_at: new Date().toISOString(),
  });
  await audit.update('DailyCashSettlement', settlementId, { status: 'Submitted' }, { status: 'Rejected' });
  return updated;
}

// ── Shortage Management ───────────────────────────────────────────────────────

/**
 * Owner approves a cash shortage.
 */
export async function approveShortage({ shortageId, ownerNotes, reviewedBy }) {
  return await base44.entities.CashShortage.update(shortageId, {
    status: 'Approved',
    owner_notes: ownerNotes || '',
    reviewed_by: reviewedBy,
    reviewed_at: new Date().toISOString(),
  });
}

/**
 * Owner rejects a cash shortage (marks for investigation).
 */
export async function investigateShortage({ shortageId, ownerNotes, reviewedBy }) {
  return await base44.entities.CashShortage.update(shortageId, {
    status: 'Investigating',
    owner_notes: ownerNotes || '',
    reviewed_by: reviewedBy,
    reviewed_at: new Date().toISOString(),
  });
}

// ── Dashboard Data ────────────────────────────────────────────────────────────

/**
 * Get today's cash register summary for the dashboard.
 */
export async function getTodayCashSummary({ branch, createdBy, restaurantId }) {
  const d = today();

  const [settlements, shortages, injections] = await Promise.all([
    base44.entities.DailyCashSettlement.filter({
      date: d,
      ...(branch !== 'all' ? { branch } : {}),
      created_by: createdBy,
    }, '-created_date', 50),
    base44.entities.CashShortage.filter({
      date: d,
      ...(branch !== 'all' ? { branch } : {}),
      created_by: createdBy,
    }, '-created_date', 50),
    base44.entities.OwnerCashInjection.filter({
      date: d,
      ...(branch !== 'all' ? { branch } : {}),
      created_by: createdBy,
    }, '-created_date', 50),
  ]);

  const totalOpening = settlements.reduce((s, r) => s + Number(r.opening_cash || 0), 0);
  const totalExpectedClosing = settlements.reduce((s, r) => s + Number(r.expected_closing_cash || 0), 0);
  const totalCashCounted = settlements.reduce((s, r) => s + Number(r.cash_counted || 0), 0);
  const totalShortage = shortages.filter(s => s.type === 'Shortage').reduce((s, r) => s + Number(r.shortage_amount || 0), 0);
  const totalOverage = shortages.filter(s => s.type === 'Overage').reduce((s, r) => s + Number(r.overage_amount || 0), 0);
  const totalInjection = injections.reduce((s, r) => s + Number(r.amount || 0), 0);
  const pendingSettlements = settlements.filter(s => s.status === 'Draft' || s.status === 'Submitted');

  return {
    totalOpening,
    totalExpectedClosing,
    totalCashCounted,
    totalShortage,
    totalOverage,
    totalInjection,
    pendingSettlements: pendingSettlements.length,
    settlements,
    shortages,
    injections,
  };
}
