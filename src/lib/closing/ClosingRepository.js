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

export const closingRepository = {
  saveClosingSession,
  requestClosingCorrection,
};

export default closingRepository;
