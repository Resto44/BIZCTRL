import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';

const SubscriptionContext = createContext(null);

const EMPTY_SUMMARY = {
  found: false,
  status: 'EXPIRED',
  has_erp_access: false,
  plan_id: null,
  plan_name: 'No active plan',
  trial_days_remaining: 0,
  limits: {},
  usage: {},
  feature_flags: [],
  pricing: {},
  pending_payment_id: null,
  test_mode_enabled: false,
  can_manage_billing: false,
};

function normalizeError(error) {
  const message = error?.message || 'Unable to load your subscription.';
  const detail = error?.details || error?.hint || '';
  const code = message.match(/(SUBSCRIPTION_[A-Z_]+|BILLING_[A-Z_]+|PAID_PLAN_REQUIRED|ACTIVE_SUBSCRIPTION_REQUIRED|RENEWAL_NOT_AVAILABLE|TEST_[A-Z_]+)/)?.[1] || 'BILLING_REQUEST_FAILED';
  return { code, message, detail, billingRoute: '/billing' };
}

export function SubscriptionProvider({ children }) {
  const { user, isLoadingAuth } = useAuth();
  const { activeRestaurant, loadingRestaurants, loadingPortalIdentity } = useTenant();
  const tenantReady = !isLoadingAuth && !loadingRestaurants && (!activeRestaurant?.id || !loadingPortalIdentity);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const summaryRef = useRef(EMPTY_SUMMARY);
  const [plans, setPlans] = useState([]);
  const [payments, setPayments] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    summaryRef.current = summary;
  }, [summary]);

  const refresh = useCallback(async () => {
    if (isLoadingAuth || loadingRestaurants || loadingPortalIdentity) return null;
    if (!user?.id || !activeRestaurant?.id) {
      setSummary(EMPTY_SUMMARY);
      setPlans([]);
      setPayments([]);
      setEvents([]);
      setLoading(false);
      return EMPTY_SUMMARY;
    }

    // Keep a previously verified subscription visible while a background refresh
    // runs so focus/navigation cannot flash the ERP into its loading shell.
    if (!summaryRef.current?.found) setLoading(true);
    setError(null);
    try {
      const [snapshotResult, planResult] = await Promise.all([
        supabase.rpc('erp_subscription_snapshot'),
        supabase
          .from('subscription_plans')
          .select('id, display_name, monthly_price_cents, original_price_cents, discount_percent, discount_active, discount_label, trial_days, billing_period_months, billing_product_key, paddle_price_id, max_restaurants, max_branches, max_employees, max_users, max_storage_mb, max_pdf_exports, max_ocr_scans, advanced_analytics, feature_flags, sort_order')
          .eq('is_active', true)
          .eq('is_public', true)
          .order('sort_order'),
      ]);

      if (snapshotResult.error) throw snapshotResult.error;

      // A catalog failure must not erase a valid server subscription snapshot.
      // Otherwise an already active ERP user is switched to the paywall while
      // Billing is still mounted, which presents as a flash/reload.
      const nextSummary = { ...EMPTY_SUMMARY, ...(snapshotResult.data || {}) };
      setSummary(nextSummary);
      setPlans(planResult.data || []);
      if (planResult.error) setError(normalizeError(planResult.error));

      const [paymentResult, eventResult] = await Promise.all([
        supabase
          .from('subscription_payments')
          .select('id, plan_id, provider, status, amount_cents, currency, is_test, display_label, payment_reference, payment_proof_key, payment_proof_filename, submitted_at, paid_at, failed_at, period_start, period_end, created_at')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('subscription_events')
          .select('id, event_type, previous_status, next_status, source, details, created_at')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      if (paymentResult.error || eventResult.error) {
        const historyError = paymentResult.error || eventResult.error;
        setPayments(paymentResult.data || []);
        setEvents(eventResult.data || []);
        setError(normalizeError(historyError));
        return nextSummary;
      }
      setPayments(paymentResult.data || []);
      setEvents(eventResult.data || []);
      return nextSummary;
    } catch (nextError) {
      const structured = normalizeError(nextError);
      setError(structured);
      // Retain a previously verified snapshot during a transient refresh failure
      // so an active user's route does not disappear before they can retry.
      setSummary((previous) => previous?.found ? previous : EMPTY_SUMMARY);
      return summaryRef.current?.found ? summaryRef.current : EMPTY_SUMMARY;
    } finally {
      setLoading(false);
    }
  }, [activeRestaurant?.id, isLoadingAuth, loadingPortalIdentity, loadingRestaurants, user?.id]);

  useEffect(() => {
    if (!tenantReady) return;
    refresh();
  }, [refresh, tenantReady]);

  useEffect(() => {
    if (!tenantReady) return undefined;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refresh, tenantReady]);

  const invoke = useCallback(async (name, args = {}) => {
    const { data, error: mutationError } = await supabase.rpc(name, args);
    if (mutationError) throw normalizeError(mutationError);
    await refresh();
    return data;
  }, [refresh]);

  const value = useMemo(() => {
    const status = summary.status || 'EXPIRED';
    const limits = summary.limits || {};
    const usage = summary.usage || {};
    const featureFlags = summary.feature_flags || [];

    return {
      summary,
      plans,
      payments,
      events,
      loading,
      error,
      tenantReady,
      status,
      plan: summary.plan_id || null,
      planName: summary.plan_name || 'No active plan',
      limits,
      usage,
      trialDaysRemaining: Number(summary.trial_days_remaining || 0),
      isTrial: status === 'TRIAL',
      isActive: Boolean(summary.has_erp_access),
      isPendingPayment: status === 'PENDING_PAYMENT',
      pendingPaymentId: summary.pending_payment_id || null,
      isTestModeEnabled: Boolean(summary.test_mode_enabled),
      canManageBilling: Boolean(summary.can_manage_billing),
      hasFeature: (feature) => featureFlags.includes('all') || featureFlags.includes(String(feature || '').toLowerCase()),
      withinLimit: (metric) => {
        const used = Number(usage[metric] || 0);
        const limit = Number(limits[metric] || 0);
        return Boolean(summary.has_erp_access) && used < limit;
      },
      refresh,
      createManualPaymentIntent: (planId, couponCode = null) => invoke('create_manual_iban_payment_intent', { p_plan_id: planId, p_coupon_code: couponCode }),
      getManualPaymentInstructions: () => invoke('platform_manual_payment_instructions'),
      submitManualPaymentProof: async (paymentId, paymentReference, file) => {
        if (!paymentId || !paymentReference || !file || !user?.id) throw normalizeError(new Error('MANUAL_PAYMENT_PROOF_INPUT_INVALID'));
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type) || file.size > 10 * 1024 * 1024) throw normalizeError(new Error('MANUAL_PAYMENT_PROOF_FILE_INVALID'));
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const objectKey = `${user.id}/${paymentId}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('payment-proofs').upload(objectKey, file, { contentType: file.type, upsert: false });
        if (uploadError) throw normalizeError(uploadError);
        try {
          return await invoke('submit_manual_iban_payment_proof', {
            p_payment_id: paymentId,
            p_payment_reference: paymentReference,
            p_proof_key: objectKey,
            p_filename: file.name,
            p_content_type: file.type,
          });
        } catch (proofError) {
          await supabase.storage.from('payment-proofs').remove([objectKey]);
          throw proofError;
        }
      },
      cancelAtPeriodEnd: () => invoke('cancel_subscription_at_period_end'),
      renewSubscription: () => invoke('renew_subscription'),
      consumeUsage: (metric, amount = 1) => invoke('erp_consume_subscription_usage', { p_metric: metric, p_amount: amount }),
      applyTestPayment: (paymentId, outcome) => invoke('erp_apply_mock_test_payment', { p_payment_id: paymentId, p_outcome: outcome }),
      simulateSubscriptionLifecycle: (action) => invoke('erp_simulate_subscription_lifecycle', { p_action: action }),
    };
  }, [error, events, invoke, loading, payments, plans, refresh, summary, tenantReady, user?.id]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
}
