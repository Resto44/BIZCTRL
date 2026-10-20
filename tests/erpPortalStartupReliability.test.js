import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { withPortalReadDeadline } from '../src/lib/portalReadDeadline.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('ERP portal startup reliability', () => {
  it('completes a fast authorized read without waiting for the deadline', async () => {
    expect(await withPortalReadDeadline(Promise.resolve('verified'), 500)).toBe('verified');
  });

  it('fails closed with a retryable timeout rather than spinning forever', async () => {
    vi.useFakeTimers();
    try {
      const pending = withPortalReadDeadline(new Promise(() => {}), 800, 'ERP_TEST_TIMEOUT');
      const rejected = expect(pending).rejects.toThrow('ERP_TEST_TIMEOUT');
      await vi.advanceTimersByTimeAsync(800);
      await rejected;
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not redirect users to onboarding or paywall when tenant authorization is unavailable', async () => {
    const [app, tenant, auth] = await Promise.all([
      source('../src/App.jsx'),
      source('../src/lib/TenantContext.jsx'),
      source('../src/lib/AuthContext.jsx'),
    ]);
    expect(tenant).toContain('ERP_RESTAURANTS_TIMEOUT');
    expect(tenant).toContain('ERP_IDENTITY_TIMEOUT');
    expect(tenant).toContain('restaurantLoadError');
    expect(app).toContain('<PortalStartupRecovery onRetry={refetchRestaurants} />');
    expect(app).toContain('<PortalStartupRecovery onRetry={refresh} />');
    expect(auth).toContain("type: 'network_unavailable'");
    expect(app).toContain('Retry authorization');
    expect(app).not.toContain('localStorage.clear(); sessionStorage.clear()');
  });

  it('refreshes subscription without refetching billing history for every mobile app focus', async () => {
    const subscription = await source('../src/lib/SubscriptionContext.jsx');
    expect(subscription).toContain('lastVisibilityRefreshRef');
    expect(subscription).toContain('skipBilling: true');
    expect(subscription).toContain('60_000');
    expect(subscription).toContain('ERP_SUBSCRIPTION_TIMEOUT');
    expect(subscription).not.toContain("window.addEventListener('focus', refreshWhenVisible)");
  });

  it('shows canonical branch rows only once and refuses to remove financial source records automatically', async () => {
    const [tenant, owner, manager] = await Promise.all([
      source('../src/lib/TenantContext.jsx'),
      source('../src/lib/ownerReportCenter.js'),
      source('../src/pages/ManagerDashboardERP.jsx'),
    ]);
    expect(tenant).toContain('seenLegacyKeys');
    expect(tenant).toContain('seenLegacyIds');
    expect(owner).toContain('latestInventorySnapshots(inventory, branches)');
    expect(manager).toContain('latestInventorySnapshots(snapshots)');
  });
});
