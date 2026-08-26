import { supabase } from '@/api/supabaseClient';

function newRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : value;
  } catch {
    // Preserve malformed legacy values so the server returns its typed
    // SALES_CLOSING_PAYLOAD_INVALID response instead of silently dropping data.
    return value;
  }
}

export function normalizeClosingPayload(payload, requestId) {
  const actualCash = payload.actual_cash ?? payload.actualCash ?? null;
  return {
    ...payload,
    request_id: requestId,
    business_date: payload.business_date || payload.date,
    actual_cash: actualCash === '' ? null : actualCash,
    // The transactional RPC consumes JSON arrays. Older callers may still carry
    // serialized values, so normalize them at the one persistence boundary.
    sales_sources_json: normalizeJsonArray(payload.sales_sources_json),
    payment_reconciliation_json: normalizeJsonArray(payload.payment_reconciliation_json),
    credit_entries_json: normalizeJsonArray(payload.credit_entries_json),
  };
}

const BUSINESS_MESSAGES = {
  SALES_CLOSING_AUTH_REQUIRED: 'Your session has expired. Sign in again before saving the Closing.',
  SALES_CLOSING_SCOPE_REQUIRED: 'Select the business, branch, date, shift, and cashier before saving the Closing.',
  SALES_CLOSING_PERMISSION_DENIED: 'You do not have permission to change this Closing.',
  SALES_CLOSING_STATE_INVALID: 'This Closing cannot be saved in its current state.',
  SALES_CLOSING_ACTUAL_CASH_REQUIRED: 'Actual cash is required before finalizing this Closing.',
  SALES_CLOSING_VARIANCE_NOTE_REQUIRED: 'Add a cash variance note before finalizing this Closing.',
  SALES_CLOSING_MANAGER_APPROVAL_REQUIRED: 'Manager approval is required for this cash variance.',
  SALES_CLOSING_PAYLOAD_INVALID: 'The Closing details could not be processed. Review the entered sales sources and customer credit entries, then try again.',
  SALES_CLOSING_CREDIT_CUSTOMER_REQUIRED: 'Select an active Customer Master customer for every Today Credit amount.',
  SALES_CLOSING_CREDIT_CUSTOMER_INVALID: 'One or more selected credit customers are no longer active or do not belong to this branch.',
  SALES_CLOSING_CREDIT_LIMIT_EXCEEDED: 'Credit limit exceeded. Correct the Today Credit amount or perform an authorized manager override.',
  SALES_CLOSING_CREDIT_OVERRIDE_DENIED: 'Only an authorized manager or owner can approve a credit-limit override.',
  SALES_CLOSING_HISTORY_IMMUTABLE: 'This finalized Closing requires an authorized correction.',
  SALES_CLOSING_CORRECTION_REQUIRED: 'This finalized Closing requires an authorized correction.',
  SALES_CLOSING_PROTECTED_RECORD: 'This finalized Closing requires an authorized correction.',
  CLOSING_ALREADY_EXISTS: 'An active draft Closing already exists for this branch, date, shift, and cashier.',
};

function resolveClosingErrorCode(error) {
  const technicalMessage = String(error?.message || '');
  const knownCode = Object.keys(BUSINESS_MESSAGES).find((code) => technicalMessage.includes(code));
  return knownCode || error?.code || 'CLOSING_SAVE_FAILED';
}

export function createClosingSaveError(error, requestId) {
  const code = resolveClosingErrorCode(error);
  const structuredError = new Error(error?.message || 'Sales Closing save failed.');
  structuredError.name = 'ClosingSaveError';
  structuredError.code = code;
  structuredError.details = error?.details || error?.hint || error?.message || null;
  structuredError.request_id = requestId;
  structuredError.requestId = requestId;
  structuredError.userMessage = BUSINESS_MESSAGES[code]
    || 'The Closing service could not complete this request. Please retry using the reference shown below.';
  return structuredError;
}

export function closingErrorDetails(error) {
  if (!error) return null;
  return {
    code: error.code || 'CLOSING_SAVE_FAILED',
    message: error.message || 'Sales Closing save failed.',
    details: error.details || null,
    request_id: error.request_id || error.requestId || null,
  };
}

/**
 * Executes the sole persistence path for a Sales Closing. The server performs
 * permission checks, calculates final totals, writes source snapshots and audit
 * records, and treats the request ID as an idempotency key.
 */
export async function saveClosingSession({ payload, closingId = null, requestId = newRequestId() }) {
  const normalizedPayload = normalizeClosingPayload(payload, requestId);
  try {
    const rpcName = normalizedPayload.closing_state === 'finalized'
      ? 'erp_finalize_sales_closing'
      : 'erp_save_sales_closing_draft';
    const { data, error } = await supabase.rpc(rpcName, {
      p_payload: normalizedPayload,
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
  } catch (error) {
    const structuredError = createClosingSaveError(error, requestId);
    console.error('[ClosingRepository] Sales Closing save failed', closingErrorDetails(structuredError));
    throw structuredError;
  }
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
  if (error?.userMessage) return error.userMessage;
  const code = resolveClosingErrorCode(error);
  return BUSINESS_MESSAGES[code]
    || 'The Closing service could not complete this request. Please retry using the reference shown below.';
}

export const closingRepository = {
  saveClosingSession,
  requestClosingCorrection,
  closingSaveErrorMessage,
  closingErrorDetails,
};

export default closingRepository;
