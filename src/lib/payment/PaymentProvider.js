import { isPaddleSandboxClientConfigured } from '@/lib/paddleSandbox';

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

export class ManualIbanPaymentProvider extends PaymentProvider {
  constructor(subscriptionApi) {
    super();
    this.subscriptionApi = subscriptionApi;
    this.id = 'manual_iban';
    this.label = 'Manual IBAN Transfer';
    this.isLiveGateway = false;
  }

  async createCheckout(planId, couponCode = null) {
    return this.subscriptionApi.createManualPaymentIntent(planId, couponCode);
  }

  async verifyPayment() {
    throw new Error('MANUAL_PAYMENT_REQUIRES_PLATFORM_OWNER_REVIEW');
  }

  async handleWebhook() {
    throw new Error('MANUAL_IBAN_PROVIDER_HAS_NO_WEBHOOK');
  }

  async cancelSubscription() {
    return this.subscriptionApi.cancelAtPeriodEnd();
  }

  async getSubscription() {
    return this.subscriptionApi.refresh();
  }
}

export class PaddleSandboxPaymentProvider extends PaymentProvider {
  constructor(subscriptionApi) {
    super();
    this.subscriptionApi = subscriptionApi;
    this.id = 'paddle_sandbox';
    this.label = 'Paddle Billing Sandbox';
    this.isLiveGateway = false;
  }

  async createCheckout(planId) {
    const { beginPaddleSandboxCheckout } = await import('@/lib/paddleBilling');
    return beginPaddleSandboxCheckout(planId);
  }

  async verifyPayment() {
    // Paddle webhooks, not browser callbacks, are authoritative for activation.
    return this.subscriptionApi.refresh();
  }

  async handleWebhook() {
    throw new Error('PADDLE_WEBHOOKS_ARE_SERVER_ONLY');
  }

  async cancelSubscription() {
    const { getPaddleCustomerPortalUrl } = await import('@/lib/paddleBilling');
    return getPaddleCustomerPortalUrl();
  }

  async getSubscription() {
    return this.subscriptionApi.refresh();
  }

  async openCustomerPortal() {
    const { getPaddleCustomerPortalUrl } = await import('@/lib/paddleBilling');
    return getPaddleCustomerPortalUrl();
  }
}

export function createPaymentProvider(subscriptionApi) {
  // Retain the existing manual billing path until the real, public-safe Paddle
  // Sandbox token is configured. No unverified provider IDs or secret fallback
  // values are ever substituted.
  if (isPaddleSandboxClientConfigured()) return new PaddleSandboxPaymentProvider(subscriptionApi);
  return new ManualIbanPaymentProvider(subscriptionApi);
}
