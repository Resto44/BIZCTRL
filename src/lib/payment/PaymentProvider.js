/**
 * Payment providers are adapters, not entitlement authorities. Every adapter
 * action delegates to a backend RPC that validates ownership, subscription
 * state, plan price, and test-mode policy before altering billing data.
 */
export class PaymentProvider {
  async createCheckout() {
    throw new Error('PaymentProvider.createCheckout must be implemented');
  }

  async verifyPayment() {
    throw new Error('PaymentProvider.verifyPayment must be implemented');
  }

  async handleWebhook() {
    throw new Error('PaymentProvider.handleWebhook must be implemented');
  }

  async cancelSubscription() {
    throw new Error('PaymentProvider.cancelSubscription must be implemented');
  }

  async getSubscription() {
    throw new Error('PaymentProvider.getSubscription must be implemented');
  }
}

export class MockTestPaymentProvider extends PaymentProvider {
  constructor(subscriptionApi) {
    super();
    this.subscriptionApi = subscriptionApi;
    this.id = 'mock_test';
    this.label = 'TEST ONLY — Mock Payment Provider';
    this.isLiveGateway = false;
  }

  async createCheckout(planId) {
    return this.subscriptionApi.createPaymentIntent(planId);
  }

  async verifyPayment(paymentId, outcome) {
    if (!['succeeded', 'failed'].includes(outcome)) {
      throw new Error('TEST_PAYMENT_OUTCOME_INVALID');
    }
    return this.subscriptionApi.applyTestPayment(paymentId, outcome);
  }

  async handleWebhook() {
    throw new Error('TEST_ONLY_PROVIDER_HAS_NO_WEBHOOK');
  }

  async cancelSubscription() {
    return this.subscriptionApi.cancelAtPeriodEnd();
  }

  async getSubscription() {
    return this.subscriptionApi.refresh();
  }

  async simulateLifecycle(action) {
    if (!['renewal', 'cancellation', 'expiration'].includes(action)) {
      throw new Error('TEST_LIFECYCLE_ACTION_INVALID');
    }
    return this.subscriptionApi.simulateSubscriptionLifecycle(action);
  }
}

export function createPaymentProvider(subscriptionApi) {
  return new MockTestPaymentProvider(subscriptionApi);
}
