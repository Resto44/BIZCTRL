import { supabase } from '@/api/supabaseClient';
import { openPaddleTransaction } from '@/lib/paddle';

function responseError(result, fallback) {
  const code = result?.data?.error || result?.error?.message || fallback;
  return new Error(code);
}

export async function beginPaddleCheckout(planId, paddleCustomerId = null) {
  const { data, error } = await supabase.functions.invoke('paddle-subscription-checkout', {
    body: { planId },
  });
  if (error || !data?.transactionId) throw responseError({ data, error }, 'PADDLE_CHECKOUT_UNAVAILABLE');

  // The transaction (including price and tenant association) is created by the
  // authenticated server function. The browser only opens its immutable ID.
  await openPaddleTransaction(data.transactionId, paddleCustomerId);
  return data;
}

export async function getPaddleCustomerPortalUrl() {
  const { data, error } = await supabase.functions.invoke('paddle-customer-portal', { body: {} });
  if (error || !data?.url) throw responseError({ data, error }, 'PADDLE_CUSTOMER_PORTAL_UNAVAILABLE');
  return data.url;
}
