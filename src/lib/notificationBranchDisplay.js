/**
 * Render notifications with branch names without changing canonical branch keys.
 * Keys are needed for filtering, role scoping and audit/treasury associations.
 * Only use the branches of the currently selected restaurant.
 */
const AUTO_BRANCH_KEY = /^main-[a-z0-9]{8,32}$/i;
const AUTO_BRANCH_IN_TEXT = /main-[a-z0-9]{8,32}/gi;

export function isTechnicalBranchKey(value) {
  return AUTO_BRANCH_KEY.test(String(value || '').trim());
}

export function resolveNotificationBranchName(value, branches = [], unknown = 'Branch') {
  const key = String(value ?? '').trim();
  if (!key) return '';
  const branch = (branches || []).find(b => [b?.id, b?.key, b?.branch_key]
    .some(candidate => candidate != null && String(candidate) === key));
  const name = String(branch?.name || branch?.label || '').trim();
  if (name && !isTechnicalBranchKey(name)) return name;
  // Never expose generated main-... codes if branch metadata is unavailable.
  return isTechnicalBranchKey(key) ? unknown : key;
}

export function presentNotificationBranches(notification, branches = [], unknown = 'Branch') {
  if (!notification) return notification;
  const canonical = String(notification.branch || '').trim();
  const displayBranch = resolveNotificationBranchName(canonical, branches, unknown);
  const render = value => {
    if (typeof value !== 'string') return value;
    let result = value;
    // The main branch ID may also appear in the title/message of old notifications.
    if (canonical && displayBranch && canonical !== displayBranch) {
      result = result.split(canonical).join(displayBranch);
    }
    return result.replace(AUTO_BRANCH_IN_TEXT, token =>
      resolveNotificationBranchName(token, branches, unknown));
  };
  return {
    ...notification,
    branch: displayBranch,
    title: render(notification.title),
    message: render(notification.message),
  };
}
