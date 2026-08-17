import { supabase } from '@/api/supabaseClient';

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export const platformOwnerApi = {
  snapshot: () => rpc('platform_owner_session_snapshot'),
  dashboard: () => rpc('platform_owner_dashboard'),
  organizations: (query, status, limit, offset) => rpc('platform_owner_list_organizations', { p_query: query || null, p_status: status || null, p_limit: limit, p_offset: offset }),
  users: (query, status, limit, offset) => rpc('platform_owner_list_users', { p_query: query || null, p_status: status || null, p_limit: limit, p_offset: offset }),
  subscriptions: (status, limit, offset) => rpc('platform_owner_list_subscriptions', { p_status: status || null, p_limit: limit, p_offset: offset }),
  payments: (status, limit, offset) => rpc('platform_owner_list_payments', { p_status: status || null, p_limit: limit, p_offset: offset }),
  plans: () => rpc('platform_owner_list_plans'),
  promotions: (limit, offset) => rpc('platform_owner_list_promotions', { p_limit: limit, p_offset: offset }),
  activity: (limit, offset) => rpc('platform_owner_list_activity_logs', { p_limit: limit, p_offset: offset }),
  manualPaymentSettings: () => rpc('platform_owner_manual_payment_settings'),
  reviewPayment: (paymentId, approve, note) => rpc('platform_owner_review_manual_payment', { p_payment_id: paymentId, p_approve: approve, p_note: note || null }),
  setUserStatus: (userId, status, reason) => rpc('platform_owner_set_user_status', { p_user_id: userId, p_status: status, p_reason: reason || null }),
  setOrganizationStatus: (restaurantId, active, reason) => rpc('platform_owner_set_organization_status', { p_restaurant_id: restaurantId, p_active: active, p_reason: reason || null }),
  setSubscriptionStatus: (restaurantId, action, reason) => rpc('platform_owner_set_subscription_status', { p_restaurant_id: restaurantId, p_action: action, p_reason: reason || null }),
  changeSubscriptionPlan: (restaurantId, planId, reason) => rpc('platform_owner_change_subscription_plan', { p_restaurant_id: restaurantId, p_plan_id: planId, p_reason: reason || null }),
  extendTrial: (restaurantId, days) => rpc('platform_owner_extend_trial', { p_restaurant_id: restaurantId, p_days: days }),
  featureOverride: (restaurantId, feature, enabled, reason) => rpc('platform_owner_set_feature_override', { p_restaurant_id: restaurantId, p_feature_key: feature, p_enabled: enabled, p_reason: reason || null }),
  saveManualPaymentSettings: (settings) => rpc('platform_owner_save_manual_payment_settings', {
    p_company_name: settings.companyName || null,
    p_bank_name: settings.bankName || null,
    p_account_holder: settings.accountHolder || null,
    p_iban: settings.iban || null,
    p_currency: settings.currency || 'USD',
    p_instructions: settings.instructions || null,
    p_payment_reference_rules: settings.paymentReferenceRules || null,
    p_is_active: Boolean(settings.isActive),
  }),
  savePlan: (plan) => rpc('platform_owner_save_plan', {
    p_plan_id: plan.id,
    p_display_name: plan.displayName || null,
    p_monthly_price_cents: Number(plan.monthlyPriceCents),
    p_original_price_cents: Number(plan.originalPriceCents),
    p_billing_period_months: Number(plan.billingPeriodMonths || 1),
    p_feature_flags: plan.featureFlags || null,
    p_limits: plan.limits || null,
    p_is_active: Boolean(plan.isActive),
  }),
  archiveUser: (userId, reason) => rpc('platform_owner_archive_user', { p_user_id: userId, p_reason: reason || null }),
  anonymizeUser: (userId, confirmation, reason) => rpc('platform_owner_anonymize_user', { p_user_id: userId, p_confirmation: confirmation, p_reason: reason || null }),
  savePromotion: (promotion) => rpc('platform_owner_save_promotion', {
    p_id: promotion.id || null,
    p_name: promotion.name || null,
    p_plan_id: promotion.planId || null,
    p_percent_off: promotion.percentOff ? Number(promotion.percentOff) : null,
    p_fixed_amount_cents: promotion.fixedAmountCents ? Number(promotion.fixedAmountCents) : null,
    p_starts_at: promotion.startsAt || null,
    p_ends_at: promotion.endsAt || null,
    p_max_redemptions: promotion.maxRedemptions ? Number(promotion.maxRedemptions) : null,
    p_first_time_only: Boolean(promotion.firstTimeOnly),
    p_coupon_code: promotion.couponCode || null,
    p_is_active: Boolean(promotion.isActive),
  }),
  paymentProofUrl: async (objectKey) => {
    if (!objectKey) throw new Error('PAYMENT_PROOF_NOT_AVAILABLE');
    const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(objectKey, 60);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error('PAYMENT_PROOF_URL_UNAVAILABLE');
    return data.signedUrl;
  },
};
