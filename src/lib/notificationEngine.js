/**
 * Notification Engine — Central service for creating notifications.
 * Import and call from any page/component.
 * Real-time delivery is handled by base44 subscriptions in NotificationContext.
 */
import { base44, supabase } from '@/api/base44Client';
import { isTechnicalBranchKey } from '@/lib/notificationBranchDisplay';

/**
 * Core create function
 */
export async function createNotification(opts) {
  const {
    orgId,
    restaurantId,
    branch = null,
    type = 'info',
    title,
    message,
    amount = null,
    actorEmail = null,
    actorName = null,
    targetRole = 'all',
    severity = 'info',
    metadata = null,
  } = opts;

  if (!orgId || !title || !message) {
    console.warn('[notify] Missing orgId, title, or message — skipped');
    return;
  }

  // Keep branch as its canonical key for filtering and authorization.
  // Resolve the user-facing title/message from the current restaurant record,
  // rather than storing generated `main-...` branch IDs in new notifications.
  let branchName = String(branch || '').trim();
  if (branchName && restaurantId && isTechnicalBranchKey(branchName)) {
    try {
      const { data, error } = await supabase.from('branches').select('name')
        .eq('restaurant_id', restaurantId).eq('branch_key', branchName).maybeSingle();
      if (!error && data?.name?.trim()) branchName = data.name.trim();
      else branchName = 'فرع';
    } catch {
      branchName = 'فرع';
    }
  }
  const displayTitle = typeof title === 'string' && branch
    ? title.split(branch).join(branchName) : title;
  const displayMessage = typeof message === 'string' && branch
    ? message.split(branch).join(branchName) : message;

  const payload = {
    org_id: orgId,
    restaurant_id: restaurantId || null,
    branch: branch || null,
    type,
    title: displayTitle,
    message: displayMessage,
    amount: amount != null ? Number(amount) : null,
    actor_email: actorEmail || null,
    actor_name: actorName || null,
    target_role: targetRole,
    severity,
    is_read: false,
    metadata: metadata ? JSON.stringify(metadata) : null,
  };

  try {
    const result = await base44.entities.Notification.create(payload);
    
    // --- Telegram Dispatch ---
    try {
      // Load Telegram settings for this org
      const settings = await base44.entities.AppSettings.filter({ 
        org_id: orgId,
        key: 'telegram_notification_settings' 
      });
      const config = settings?.[0];

      let settingsData = null;
      if (config?.value) {
        try {
          settingsData = typeof config.value === 'string' ? JSON.parse(config.value) : config.value;
        } catch (e) {
          console.warn('[notify] Failed to parse telegram settings JSON:', e);
        }
      }

      if (settingsData?.enabled && settingsData?.bot_token && settingsData?.chat_id) {
        const botToken = settingsData.bot_token;
        const chatId = settingsData.chat_id;
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        
        const text = `<b>${displayTitle}</b>\n${displayMessage}`;
        
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML'
          })
        });
      }
    } catch (teleErr) {
      console.warn('[notify] Telegram dispatch failed:', teleErr);
    }

    return result;
  } catch (e) {
    console.warn('[notify] Notification creation failed:', e);
  }
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

export const notify = {

  // ── Sales ──────────────────────────────────────────────────────────────────
  sale: ({ orgId, restaurantId, branch, amount, actorEmail, actorName, currency = 'SAR', action = 'create' }) =>
    createNotification({
      orgId, restaurantId, branch,
      type: 'sale_recorded',
      severity: 'info',
      targetRole: 'all',
      title: action === 'delete'
        ? `🗑 فروش حذف شد — ${branch || ''}`
        : action === 'update'
          ? `✏️ فروش ويرايش شد — ${branch || ''}`
          : `💰 فروش جديد — ${branch || ''}`,
      message: action === 'delete'
        ? `فروش حذف شد توسط ${actorName || actorEmail || 'کاربر'}`
        : `مبلغ: ${currency} ${Number(amount || 0).toLocaleString()}`,
      amount: action === 'delete' ? null : amount,
      actorEmail, actorName,
    }),

  // ── Purchases ──────────────────────────────────────────────────────────────
  purchase: ({ orgId, restaurantId, branch, amount, actorEmail, actorName, currency = 'SAR', action = 'create' }) =>
    createNotification({
      orgId, restaurantId, branch,
      type: 'purchase_recorded',
      severity: 'info',
      targetRole: 'all',
      title: action === 'delete'
        ? `🗑 خريد حذف شد — ${branch || ''}`
        : action === 'update'
          ? `✏️ خريد ويرايش شد — ${branch || ''}`
          : `🛒 خريد جديد — ${branch || ''}`,
      message: action === 'delete'
        ? `خريد حذف شد توسط ${actorName || actorEmail || 'کاربر'}`
        : `مبلغ: ${currency} ${Number(amount || 0).toLocaleString()}`,
      amount: action === 'delete' ? null : amount,
      actorEmail, actorName,
    }),

  // ── Expenses ───────────────────────────────────────────────────────────────
  expense: ({ orgId, restaurantId, branch, amount, category, actorEmail, actorName, currency = 'SAR', action = 'create' }) =>
    createNotification({
      orgId, restaurantId, branch,
      type: 'expense_recorded',
      severity: action === 'delete' ? 'info' : 'warning',
      targetRole: 'owner',
      title: action === 'delete'
        ? `🗑 مصارف حذف شد — ${branch || ''}`
        : action === 'update'
          ? `✏️ مصارف تعديل شد — ${branch || ''} (${category || ''})`
          : `💸 مصارف جديد — ${branch || ''} (${category || ''})`,
      message: action === 'delete'
        ? `مصرف حذف شد توسط ${actorName || actorEmail || 'کاربر'}`
        : `مبلغ: ${currency} ${Number(amount || 0).toLocaleString()}`,
      amount: action === 'delete' ? null : amount,
      actorEmail, actorName,
    }),

  // ── Salary Advance ─────────────────────────────────────────────────────────
  salaryAdvance: ({ orgId, restaurantId, branch, employeeName, amount, actorEmail, actorName, currency = 'SAR', action = 'create' }) =>
    createNotification({
      orgId, restaurantId, branch,
      type: 'salary_advance',
      severity: 'warning',
      targetRole: 'owner',
      title: action === 'delete'
        ? `🗑 سلفه حذف شد — ${employeeName || ''}`
        : `👤 سلفه راتب — ${employeeName || ''} (${branch || ''})`,
      message: action === 'delete'
        ? `سلفه حذف شد توسط ${actorName || actorEmail || 'کاربر'}`
        : `مبلغ: ${currency} ${Number(amount || 0).toLocaleString()}`,
      amount: action === 'delete' ? null : amount,
      actorEmail, actorName,
    }),

  // ── Salary Payment ─────────────────────────────────────────────────────────
  salaryPayment: ({ orgId, restaurantId, branch, employeeName, amount, actorEmail, actorName, currency = 'SAR' }) =>
    createNotification({
      orgId, restaurantId, branch,
      type: 'salary_payment',
      severity: 'info',
      targetRole: 'owner',
      title: `💵 صرف راتب — ${employeeName || ''} (${branch || ''})`,
      message: `مبلغ: ${currency} ${Number(amount || 0).toLocaleString()}`,
      amount, actorEmail, actorName,
    }),

  // ── Low Stock ──────────────────────────────────────────────────────────────
  lowStock: ({ orgId, restaurantId, branch, productName, currentQty, unit }) =>
    createNotification({
      orgId, restaurantId, branch,
      type: 'low_stock',
      severity: currentQty <= 0 ? 'critical' : 'warning',
      targetRole: 'all',
      title: `📦 موجودی کم — ${productName || ''} (${branch || ''})`,
      message: `موجودی: ${currentQty} ${unit || ''} — نیاز به سفارش`,
    }),

  // ── Credit Collection ──────────────────────────────────────────────────────
  creditCollection: ({ orgId, restaurantId, branch, amount, actorEmail, actorName, currency = 'SAR', action = 'create' }) =>
    createNotification({
      orgId, restaurantId, branch,
      type: 'credit_collection',
      severity: 'info',
      targetRole: 'owner',
      title: action === 'delete'
        ? `🗑 تحصيل دين حذف شد — ${branch || ''}`
        : `🏦 تحصيل دين — ${branch || ''}`,
      message: action === 'delete'
        ? `رکورد حذف شد توسط ${actorName || actorEmail || 'کاربر'}`
        : `مبلغ محصّل: ${currency} ${Number(amount || 0).toLocaleString()}`,
      amount: action === 'delete' ? null : amount,
      actorEmail, actorName,
    }),

  // ── Branch → Owner Transfer ────────────────────────────────────────────────
  branchToOwner: ({ orgId, restaurantId, branch, amount, actorEmail, actorName, currency = 'SAR' }) =>
    createNotification({
      orgId, restaurantId, branch,
      type: 'branch_to_owner',
      severity: 'info',
      targetRole: 'owner',
      title: `↔️ تحويل فرع → مالک — ${branch || ''}`,
      message: `مبلغ: ${currency} ${Number(amount || 0).toLocaleString()}`,
      amount, actorEmail, actorName,
    }),

  // ── Owner → Branch Funding ─────────────────────────────────────────────────
  ownerToBranch: ({ orgId, restaurantId, branch, amount, actorEmail, actorName, currency = 'SAR' }) =>
    createNotification({
      orgId, restaurantId, branch,
      type: 'owner_to_branch',
      severity: 'info',
      targetRole: 'all',
      title: `💳 تمويل فرع — ${branch || ''}`,
      message: `مبلغ: ${currency} ${Number(amount || 0).toLocaleString()}`,
      amount, actorEmail, actorName,
    }),

  // ── Price Change ───────────────────────────────────────────────────────────
  priceChange: ({ orgId, restaurantId, branch, productName, oldPrice, newPrice, actorEmail, actorName, currency = 'SAR' }) =>
    createNotification({
      orgId, restaurantId, branch,
      type: 'price_change',
      severity: 'warning',
      targetRole: 'owner',
      title: `🏷️ تغيير سعر — ${productName || ''}`,
      message: `${currency} ${oldPrice} → ${currency} ${newPrice} (${branch || ''})`,
      actorEmail, actorName,
    }),

  // ── Profit Drop ────────────────────────────────────────────────────────────
  profitDrop: ({ orgId, restaurantId, branch, dropPct }) =>
    createNotification({
      orgId, restaurantId, branch,
      type: 'profit_drop',
      severity: 'critical',
      targetRole: 'owner',
      title: `📉 تنزل الربح — ${branch || ''}`,
      message: `انخفاض ${dropPct}% مقارنة بالفترة السابقة`,
    }),

  // ── PDF Export ─────────────────────────────────────────────────────────────
  pdfExport: ({ orgId, restaurantId, actorEmail, actorName }) =>
    createNotification({
      orgId, restaurantId,
      type: 'pdf_export',
      severity: 'info',
      targetRole: 'owner',
      title: '📄 تصدير PDF اكتمل',
      message: `تم تصدير التقرير بنجاح بواسطة ${actorName || actorEmail || 'المستخدم'}`,
      actorEmail, actorName,
    }),

  // ── Suspicious Activity ────────────────────────────────────────────────────
  suspiciousActivity: ({ orgId, restaurantId, branch, description, actorEmail }) =>
    createNotification({
      orgId, restaurantId, branch,
      type: 'suspicious_activity',
      severity: 'critical',
      targetRole: 'owner',
      title: `🚨 نشاط مشبوه — ${branch || ''}`,
      message: description || 'تم رصد نشاط غير معتاد',
      actorEmail,
    }),

  // ── Expense Spike ──────────────────────────────────────────────────────────
  expenseSpike: ({ orgId, restaurantId, branch, pct }) =>
    createNotification({
      orgId, restaurantId, branch,
      type: 'expense_spike',
      severity: 'warning',
      targetRole: 'owner',
      title: `⚠️ ارتفاع المصاريف — ${branch || ''}`,
      message: `المصاريف أعلى بـ ${pct}% من المعدل الطبيعي`,
    }),

  // ── Inventory Update ───────────────────────────────────────────────────────
  inventoryUpdate: ({ orgId, restaurantId, branch, productName, qty, unit, actorEmail, actorName, action = 'update' }) =>
    createNotification({
      orgId, restaurantId, branch,
      type: 'inventory_update',
      severity: 'info',
      targetRole: 'all',
      title: action === 'delete'
        ? `🗑 مخزون حذف شد — ${branch || ''}`
        : `📦 تحديث المخزون — ${branch || ''}`,
      message: action === 'delete'
        ? `رکورد حذف شد توسط ${actorName || actorEmail || 'کاربر'}`
        : `${productName}: ${qty} ${unit || ''}`,
      actorEmail, actorName,
    }),

  // ── Transfer ───────────────────────────────────────────────────────────────
  transfer: ({ orgId, restaurantId, fromBranch, toBranch, productName, qty, unit, actorEmail, actorName }) =>
    createNotification({
      orgId, restaurantId,
      branch: fromBranch,
      type: 'transfer',
      severity: 'info',
      targetRole: 'all',
      title: `↔️ نقل مخزون — ${fromBranch || ''} → ${toBranch || ''}`,
      message: `${productName}: ${qty} ${unit || ''}`,
      actorEmail, actorName,
    }),

  // ── Login Alert ────────────────────────────────────────────────────────────
  loginAlert: ({ orgId, restaurantId, actorEmail, actorName }) =>
    createNotification({
      orgId, restaurantId,
      type: 'login_alert',
      severity: 'info',
      targetRole: 'owner',
      title: `🔐 تسجيل دخول جديد`,
      message: `${actorName || actorEmail || 'مستخدم'} قام بتسجيل الدخول`,
      actorEmail, actorName,
    }),
};