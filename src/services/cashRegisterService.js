import { supabase } from '@/api/supabaseClient';
import { format } from 'date-fns';
import { validCashAmount } from '@/lib/cashRegisterData';

// ── Helpers ──────────────────────────────────────────────────────────────────

const today = () => format(new Date(), 'yyyy-MM-dd');

/**
 * Get or create the daily cash settlement for a given date/branch.
 * New opening cash uses the most recent approved counted cash.
 */
export async function getOrCreateSettlement({ date, branch, branchId, createdBy, restaurantId }) {
  if (!restaurantId || !branchId) throw new Error('Business and branch required');
  const { data, error } = await supabase.rpc('cash_register_prepare', { p_restaurant: restaurantId, p_branch: branchId, p_date: date || today() });
  if (error) throw error;
  return data;
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

  const rounded = Math.round((expected + Number.EPSILON) * 100) / 100;
  const difference = Math.round((Number(s.cash_counted || 0) - rounded) * 100) / 100;

  return {
    expected_closing_cash: rounded,
    difference,
    shortage: difference < 0 ? Math.abs(difference) : 0,
    overage: difference > 0 ? difference : 0,
  };
}

// ── Owner Cash Injection ──────────────────────────────────────────────────────

/**
 * Create an Owner Cash Injection.
 * - Increases Cash Register (DailyCashSettlement.owner_injection)
 * - Creates the linked owner capital contribution in treasury
 * - Creates CashMovement record
 * - Appears in Daily Settlement
 */
export async function createOwnerCashInjection({ requestId, date, branchId, restaurantId, amount, reason, notes, shortageId }) {
  if (!requestId || !restaurantId || !branchId || !validCashAmount(amount)) throw new Error('Valid request, business, branch and amount required');
  const { data, error } = await supabase.rpc('post_owner_cash_injection', {
    p_request_id: requestId, p_restaurant: restaurantId, p_branch: branchId,
    p_date: date || today(), p_amount: Number(amount), p_reason: reason,
    p_notes: notes || '', p_shortage: shortageId || null,
  });
  if (error) throw error;
  return data;
}

// ── Daily Cash Settlement ─────────────────────────────────────────────────────

/**
 * Submit a daily cash settlement.
 * - Sets status to 'Submitted'
 * - Records the count and shortage atomically on the server
 */
async function transition(settlementId, action, counted = null, notes = '') {
  const { data, error } = await supabase.rpc('cash_register_transition', { p_id: settlementId, p_action: action, p_counted: counted, p_notes: notes });
  if (error) throw error;
  return data;
}
export function submitSettlement({ settlementId, cashCounted, notes }) {
  if (!validCashAmount(cashCounted, true)) throw new Error('Valid counted cash required');
  return transition(settlementId, 'submit', Number(cashCounted), notes || '');
}
export function approveSettlement({ settlementId }) { return transition(settlementId, 'approve'); }
export function rejectSettlement({ settlementId, notes }) { return transition(settlementId, 'reject', null, notes || ''); }

// ── Shortage Management ───────────────────────────────────────────────────────

/**
 * Owner approves a cash shortage.
 */
async function reviewShortage(shortageId, status, ownerNotes, reviewedBy) {
  const { data, error } = await supabase.from('cash_shortages').update({ status, owner_notes: ownerNotes || '', reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
    .eq('id', shortageId).is('closing_id', null).in('status', ['Pending', 'Investigating']).select().single();
  if (error) throw error;
  return data;
}
export function approveShortage({ shortageId, ownerNotes, reviewedBy }) { return reviewShortage(shortageId, 'Approved', ownerNotes, reviewedBy); }
export function investigateShortage({ shortageId, ownerNotes, reviewedBy }) { return reviewShortage(shortageId, 'Investigating', ownerNotes, reviewedBy); }
