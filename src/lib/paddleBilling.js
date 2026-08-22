import { supabase } from '@/api/supabaseClient';
import { openPaddleTransaction } from '@/lib/paddle';

async function responseError(result, fallback) {
  let code = result?.data?.error;
  const context = result?.error?.context;
  if (!code && typeof context?.clone === 'function') {
    const body = await context.clone().json().catch(() => null);
    code = body?.error;
  }
  return new Error(code || result?.error?.message || fallback);
}

export async function beginPaddleCheckout(planId, paddleCustomerId = null) {
  const { data, error } = await supabase.functions.invoke('paddle-subscription-checkout', {
    body: { planId },
  });
  if (error || !data?.transactionId) throw await responseError({ data, error }, 'PADDLE_CHECKOUT_UNAVAILABLE');

  // The transaction (including price and tenant association) is created by the
  // authenticated server function. The browser only opens its immutable ID.
  await openPaddleTransaction(data.transactionId, paddleCustomerId);
  return data;
}

export async function getPaddleCustomerPortalUrl() {
  const { data, error } = await supabase.functions.invoke('paddle-customer-portal', { body: {} });
  if (error || !data?.url) throw await responseError({ data, error }, 'PADDLE_CUSTOMER_PORTAL_UNAVAILABLE');
  return data.url;
}
