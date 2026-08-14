import { describe, expect, it, vi } from 'vitest';
import { MockTestPaymentProvider } from '../src/lib/payment/PaymentProvider.js';

function createApi() {
  return {
    createPaymentIntent: vi.fn(async (planId) => ({ plan_id: planId, payment_status: 'pending', subscription_status: 'PENDING_PAYMENT', test_only: true })),
    applyTestPayment: vi.fn(async (paymentId, outcome) => ({ payment_id: paymentId, subscription_status: outcome === 'succeeded' ? 'ACTIVE' : 'PAST_DUE', test_only: true })),
    cancelAtPeriodEnd: vi.fn(async () => ({ cancel_at_period_end: true })),
    refresh: vi.fn(async () => ({ status: 'ACTIVE' })),
    simulateSubscriptionLifecycle: vi.fn(async (action) => ({ action, test_only: true })),
  };
}

describe('MockTestPaymentProvider', () => {
  it('creates a TEST ONLY pending payment intent instead of activating a paid plan', async () => {
    const api = createApi();
    const provider = new MockTestPaymentProvider(api);
    const intent = await provider.createCheckout('starter_20');

    expect(provider.isLiveGateway).toBe(false);
    expect(intent).toMatchObject({ plan_id: 'starter_20', payment_status: 'pending', subscription_status: 'PENDING_PAYMENT', test_only: true });
    expect(api.createPaymentIntent).toHaveBeenCalledWith('starter_20');
    expect(api.applyTestPayment).not.toHaveBeenCalled();
  });

  it('permits only explicit simulated success or failure outcomes', async () => {
    const api = createApi();
    const provider = new MockTestPaymentProvider(api);

    await expect(provider.verifyPayment('payment-1', 'succeeded')).resolves.toMatchObject({ subscription_status: 'ACTIVE', test_only: true });
    await expect(provider.verifyPayment('payment-1', 'failed')).resolves.toMatchObject({ subscription_status: 'PAST_DUE', test_only: true });
    await expect(provider.verifyPayment('payment-1', 'manual')).rejects.toThrow('TEST_PAYMENT_OUTCOME_INVALID');
  });

  it('does not expose a webhook implementation for the Mock/Test provider', async () => {
    const provider = new MockTestPaymentProvider(createApi());
    await expect(provider.handleWebhook()).rejects.toThrow('TEST_ONLY_PROVIDER_HAS_NO_WEBHOOK');
  });

  it('only permits the defined lifecycle simulations', async () => {
    const api = createApi();
    const provider = new MockTestPaymentProvider(api);
    await provider.simulateLifecycle('renewal');
    await provider.simulateLifecycle('cancellation');
    await provider.simulateLifecycle('expiration');
    await expect(provider.simulateLifecycle('activate')).rejects.toThrow('TEST_LIFECYCLE_ACTION_INVALID');
    expect(api.simulateSubscriptionLifecycle).toHaveBeenCalledTimes(3);
  });
});
