import { supabase } from '@/api/supabaseClient';
import { openPaddleSandboxTransaction } from '@/lib/paddleSandbox';

function responseError(result, fallback) {
  const code = result?.data?.error || result?.error?.message || fallback;
  return new Error(code);
}

export async function beginPaddleSandboxCheckout(planId) {
  const { data, error } = await supabase.functions.invoke('paddle-subscription-checkout', {
    body: { planId },
  });
  if (error || !data?.transactionId) throw responseError({ data, error }, 'PADDLE_CHECKOUT_UNAVAILABLE');

  // The transaction (including price and tenant association) was created by the
  // authenticated server function. The browser only opens its immutable ID.
  await openPaddleSandboxTransaction(data.transactionId);
  return data;
}

export async function getPaddleCustomerPortalUrl() {
  const { data, error } = await supabase.functions.invoke('paddle-customer-portal', { body: {} });
  if (error || !data?.url) throw responseError({ data, error }, 'PADDLE_CUSTOMER_PORTAL_UNAVAILABLE');
  return data.url;
}
