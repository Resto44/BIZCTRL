import { supabase } from '@/api/supabaseClient';

function newRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeClosingPayload(payload, requestId) {
  const actualCash = payload.actual_cash ?? payload.actualCash ?? null;
  return {
    ...payload,
    request_id: requestId,
    business_date: payload.business_date || payload.date,
    actual_cash: actualCash === '' ? null : actualCash,
    payment_reconciliation_json: Array.isArray(payload.payment_reconciliation_json)
      ? payload.payment_reconciliation_json
      : [],
  };
}

/**
 * Executes the sole persistence path for a Sales Closing. The server performs
 * permission checks, calculates final totals, writes source snapshots and audit
 * records, and treats the request ID as an idempotency key.
 */
export async function saveClosingSession({ payload, closingId = null, requestId = newRequestId() }) {
  const { data, error } = await supabase.rpc('erp_save_sales_closing', {
    p_payload: normalizeClosingPayload(payload, requestId),
    p_closing_id: closingId,
    p_request_id: requestId,
  });
  if (error) throw error;
  if (!data?.closing) throw new Error('The closing server did not return a saved record.');
  return {
    ...data.closing,
    _idempotent: Boolean(data.idempotent),
    _finalizedTransition: Boolean(data.finalized_transition),
    _requiresCorrection: Boolean(data.requires_correction),
    _lifecycleAction: data.lifecycle_action || 'saved',
    _requestId: requestId,
  };
}

export async function requestClosingCorrection({ closingId, reason, fields = [], oldValues = {}, newValues = {} }) {
  const { data, error } = await supabase.rpc('erp_request_sales_closing_correction', {
    p_closing_id: closingId,
    p_reason: reason,
    p_fields: fields,
    p_old_values: oldValues,
    p_new_values: newValues,
  });
  if (error) throw error;
  return data;
}

export function closingSaveErrorMessage(error) {
  const code = String(error?.code || error?.message || '');
  if (code.includes('SALES_CLOSING_HISTORY_IMMUTABLE') || code.includes('SALES_CLOSING_CORRECTION_REQUIRED')) {
    return 'This finalized closing requires an authorized correction.';
  }
  if (code.includes('SALES_CLOSING_PERMISSION_DENIED')) return 'You do not have permission to change this Closing.';
  if (code.includes('SALES_CLOSING_ACTUAL_CASH_REQUIRED')) return 'Actual cash is required before finalizing this Closing.';
  if (code.includes('SALES_CLOSING_VARIANCE_NOTE_REQUIRED')) return 'Add a cash variance note before finalizing this Closing.';
  if (code.includes('SALES_CLOSING_MANAGER_APPROVAL_REQUIRED')) return 'Manager approval is required for this cash variance.';
  return 'The Closing could not be saved. Please review the form and try again.';
}

export const closingRepository = {
  saveClosingSession,
  requestClosingCorrection,
  closingSaveErrorMessage,
};

export default closingRepository;
