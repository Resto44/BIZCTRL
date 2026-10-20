/**
 * Bound initial ERP read requests. A broken mobile connection must resolve into
 * a retryable authorization state, never an endless full-page spinner.
 *
 * A timeout never grants access or cancels an in-flight database write.
 * Use this helper only for idempotent reads.
 */
export function withPortalReadDeadline(request, milliseconds = 9000, code = 'ERP_READ_TIMEOUT') {
  let timeoutId;
  const deadline = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(code)), milliseconds);
  });
  return Promise.race([Promise.resolve(request), deadline]).finally(() => clearTimeout(timeoutId));
}
