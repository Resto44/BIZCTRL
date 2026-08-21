import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { beginPaddleCheckout } from '@/lib/paddleBilling';
import { isPaddleClientConfigured } from '@/lib/paddle';

export function safeInternalReturnTo(value, fallback = '/') {
  const candidate = String(value || '').trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) return fallback;
  return candidate;
}

export function publicCheckoutReturnTo(planId) {
  const safePlanId = String(planId || '').trim();
  return safePlanId ? `/pricing?checkout_plan=${encodeURIComponent(safePlanId)}` : '/pricing';
}

export function ownerRegistrationForPlan(planId) {
  const safePlanId = String(planId || '').trim();
  const returnTo = publicCheckoutReturnTo(safePlanId);
  return `/erp-register?owner=1&plan=${encodeURIComponent(safePlanId)}&returnTo=${encodeURIComponent(returnTo)}`;
}

export function usePublicPlanCheckout() {
  const navigate = useNavigate();
  const { user, isLoadingAuth } = useAuth();
  const [checkoutNotice, setCheckoutNotice] = useState('');
  const [checkoutPlanId, setCheckoutPlanId] = useState('');

  const beginPlanCheckout = useCallback(async (plan) => {
    const planId = String(plan?.id || '').trim();
    if (!planId) return;

    if (!user) {
      navigate(ownerRegistrationForPlan(planId));
      return;
    }

    // A browser checkout is never attempted unless the actual public live token
    // is configured. The server remains the authority for plan ownership and the
    // provider transaction; this guard prevents a false pending subscription.
    if (!isPaddleClientConfigured()) {
      setCheckoutNotice('Paddle checkout is not available yet. Your subscription has not been changed.');
      return;
    }

    if (!String(plan?.paddle_price_id || '').trim()) {
      setCheckoutNotice('This plan is not currently available for online checkout.');
      return;
    }

    setCheckoutPlanId(planId);
    setCheckoutNotice('');
    try {
      await beginPaddleCheckout(planId);
      setCheckoutNotice('Paddle checkout has opened. BizCTRL access will update only after a verified Paddle webhook synchronizes your subscription.');
    } catch (error) {
      setCheckoutNotice(error?.message || 'Paddle checkout is not available yet.');
    } finally {
      setCheckoutPlanId('');
    }
  }, [navigate, user]);

  const contactSales = useCallback(() => {
    navigate('/contact?topic=enterprise');
  }, [navigate]);

  return {
    beginPlanCheckout,
    contactSales,
    checkoutNotice,
    checkoutPlanId,
    isLoadingAuth,
    setCheckoutNotice,
  };
}
