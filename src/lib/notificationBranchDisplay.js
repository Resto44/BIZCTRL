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


// Historical notifications were saved with Persian/Arabic mixed source strings.
// Localize only known generated event prefixes; preserve business-entered names,
// amounts, invoice identifiers and arbitrary custom notification content.
const titlePrefixes = {
  sale_recorded: {
    source: ['💰 فروش جديد', '💰 فروش جدید', '💰 بيع جديد', '💰 New sale'],
    fa: '💰 فروش جدید', ar: '💰 بيع جديد', en: '💰 New sale',
  },
  owner_to_branch: {
    source: ['💳 تمويل فرع', '💳 تمویل شعبه', '💳 تمويل الفرع', '💳 Branch funding'],
    fa: '💳 تمویل شعبه', ar: '💳 تمويل الفرع', en: '💳 Branch funding',
  },
  branch_to_owner: {
    source: ['↔️ تحويل فرع → مالک', '↔️ انتقال شعبه به مالک', '↔️ تحويل الفرع إلى المالك', '↔️ Branch to owner transfer'],
    fa: '↔️ انتقال شعبه به مالک', ar: '↔️ تحويل الفرع إلى المالك', en: '↔️ Branch to owner transfer',
  },
  purchase_recorded: {
    source: ['🛒 خريد جديد', '🛒 خرید جدید', '🛒 شراء جديد', '🛒 New purchase'],
    fa: '🛒 خرید جدید', ar: '🛒 شراء جديد', en: '🛒 New purchase',
  },
  expense_recorded: {
    source: ['💸 مصارف جديد', '💸 مصارف جدید', '💸 مصروف جديد', '💸 New expense'],
    fa: '💸 مصرف جدید', ar: '💸 مصروف جديد', en: '💸 New expense',
  },
};

export function localizeNotificationContent(notification, lang = 'en') {
  if (!notification) return notification;
  const language = lang === 'fa' || lang === 'ar' ? lang : 'en';
  const rule = titlePrefixes[notification.type];
  let title = notification.title;
  if (typeof title === 'string' && rule) {
    const source = rule.source.find(prefix => title === prefix || title.startsWith(prefix + ' — ')
      || title.startsWith(prefix + ' ('));
    if (source) title = rule[language] + title.slice(source.length);
  }
  let message = notification.message;
  if (typeof message === 'string') {
    // Translate the standard amount field only, not user-entered free text.
    message = message.replace(/^(?:مبلغ|المبلغ|Amount)\s*:/i,
      (language === 'fa' ? 'مبلغ' : language === 'ar' ? 'المبلغ' : 'Amount') + ':');
  }
  return { ...notification, title, message };
}
