/** Canonical attendance button state is issued by the server; never infer
 * an overnight check-out from the handset's current calendar date.
 */
export function employeeAttendanceAction(status) {
  if (!status || !status.configured) return 'setup';
  if (status.phase === 'waiting') return 'waiting';
  if (status.phase === 'completed') return 'completed';
  if (status.phase === 'review_required') return 'review';
  if (status.phase === 'checked_in' && (status.can_check_out === true || status.can_request_code === true)) return 'out';
  if (status.phase === 'not_checked_in' && status.can_check_in === true) return 'in';
  return 'review';
}
