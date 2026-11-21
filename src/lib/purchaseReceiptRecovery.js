// Persist the exact command before sending it: a missing response is not a rollback.
export function receiptRecoveryKey(userId, order) {
  if (!userId || !order?.restaurant_id || !order?.branch_id || !order?.id) return null;
  return `po-receipt:v1:${userId}:${order.restaurant_id}:${order.branch_id}:${order.id}`;
}

export function readPendingReceipt(key, orderId, storage = localStorage) {
  if (!key) throw new Error('PO_RECEIPT_RECOVERY_UNAVAILABLE');
  const raw = storage.getItem(key);
  if (raw === null) return null;
  const request = JSON.parse(raw);
  if (request?.p_order_id !== orderId || typeof request.p_request_id !== 'string' ||
      !request.p_request_id || typeof request.p_receipt_date !== 'string' ||
      !Array.isArray(request.p_items) || !request.p_items.length ||
      request.p_items.some((item, index) => item.line_index !== index ||
        !Number.isFinite(item.received_qty) || item.received_qty < 0)) {
    throw new Error('PO_RECEIPT_RECOVERY_INVALID');
  }
  return request;
}

// Only explicit PostgreSQL transaction rejections prove this attempt did not post.
// Gateway errors, malformed success bodies and network failures remain ambiguous.
export function receiptWasRejected(error) {
  return ['23514', '42501', '22P02', '22003', '22007', '22008', 'P0001'].includes(error?.code);
}

export function hasPendingReceipt(userId, order, storage = localStorage) {
  const key = receiptRecoveryKey(userId, order);
  if (!key) return false;
  try { return storage.getItem(key) !== null; }
  // Allow opening recovery to display the blocked-storage error, never silently
  // hide a potentially posted receipt after the server changes order status.
  catch { return true; }
}
