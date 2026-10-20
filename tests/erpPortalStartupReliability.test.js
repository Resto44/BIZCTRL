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

  it('loads wallet and platform-owner sessions within a bounded wait', async () => {
    const [wallet, platform] = await Promise.all([
      source('../src/pages/PartnerPortal.jsx'),
      source('../src/pages/PlatformOwnerPortal.jsx'),
    ]);
    expect(wallet).toContain('WALLET_SESSION_TIMEOUT');
    expect(wallet).toContain('WALLET_ACCOUNTS_TIMEOUT');
    expect(platform).toContain('PLATFORM_OWNER_AUTH_TIMEOUT');
    expect(platform).toContain('refetchOnWindowFocus: false');
  });

  it('defers hidden, heavy owner report datasets and uses client-side redirects', async () => {
    const [owner, app] = await Promise.all([
      source('../src/pages/OwnerDashboard.jsx'),
      source('../src/App.jsx'),
    ]);
    expect(owner).toContain("enabled: enabled && activePage === 'operations'");
    expect(owner).toContain("enabled: Boolean(createdBy) && activePage === 'price-control'");
    expect(app).toContain("navigate(home, { replace: true })");
    expect(app).toContain('<Navigate to="/onboarding" replace />');
  });

  it('refuses a supplier invoice with an existing matching number before creating it', async () => {
    const invoiceForm = await source('../src/components/purchases/PurchaseInvoiceForm.jsx');
    expect(invoiceForm).toContain("if (!isEdit && !submissionRef.current.invoice && restaurantId && supplierId && branchId && invoiceNumber)");
    expect(invoiceForm).toContain(".eq('invoice_number', invoiceNumber)");
    expect(invoiceForm).toContain('Open Supplier Ledger and review the existing invoice');
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
