import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Owner Dashboard mobile responsiveness contract', () => {
  it('does not use 100vw in the Owner Dashboard or shared responsive shell', async () => {
    const files = await Promise.all([
      source('../src/pages/OwnerDashboard.jsx'),
      source('../src/components/dashboard/OwnerReportCenter.jsx'),
      source('../src/components/layout/AppLayout.jsx'),
      source('../src/components/layout/ERPLayout.jsx'),
      source('../src/components/layout/ERPHeader.jsx'),
      source('../src/components/layout/BottomNav.jsx'),
      source('../src/components/dashboard/QuickActionsDock.jsx'),
    ]);
    expect(files.join('\n')).not.toMatch(/100vw/);
  });

  it('uses shrinkable viewport-bounded containers for the shared shell and four-page Report Center', async () => {
    const [owner, reportCenter, appLayout, erpLayout] = await Promise.all([
      source('../src/pages/OwnerDashboard.jsx'),
      source('../src/components/dashboard/OwnerReportCenter.jsx'),
      source('../src/components/layout/AppLayout.jsx'),
      source('../src/components/layout/ERPLayout.jsx'),
    ]);
    expect(owner).toContain('data-testid="owner-mega-dashboard"');
    expect(owner).toContain('data-testid="owner-report-center"');
    expect(owner).toContain('data-testid="owner-report-nav"');
    expect(owner).toContain('mx-auto w-full max-w-6xl');
    expect(owner).toContain('flex flex-col gap-4 sm:flex-row');
    expect(owner).toContain('overflow-x-auto rounded-2xl');
    expect(reportCenter).toContain('overflow-x-auto pb-1');
    expect(reportCenter).toContain('min-w-[34rem]');
    expect(appLayout).toContain('mx-auto w-full min-w-0 max-w-[1600px]');
    expect(erpLayout).toContain('flex-1 min-w-0 max-w-full overflow-y-auto');
  });

  it('keeps fixed-width data tables inside local horizontal scroll containers', async () => {
    const [driver, trend] = await Promise.all([
      source('../src/components/dashboard/DriverPerformance.jsx'),
      source('../src/components/dashboard/DriverTrendAnalytics.jsx'),
    ]);
    expect(driver).toContain('w-full max-w-full overflow-x-auto');
    expect(driver).toContain('min-w-[580px]');
    expect(trend).toContain('w-full max-w-full overflow-x-auto');
    expect(trend).toContain('min-w-[760px]');
    expect(trend).toContain('min-w-[800px]');
  });

  it('removes the floating shortcuts from Owner Dashboard and keeps actions inside normal document flow', async () => {
    const [owner, reportCenter, appLayout, bottomNav, erpLayout, subscriptionBanner] = await Promise.all([
      source('../src/pages/OwnerDashboard.jsx'),
      source('../src/components/dashboard/OwnerReportCenter.jsx'),
      source('../src/components/layout/AppLayout.jsx'),
      source('../src/components/layout/BottomNav.jsx'),
      source('../src/components/layout/ERPLayout.jsx'),
      source('../src/components/subscription/SubscriptionStatusBanner.jsx'),
    ]);
    expect(owner).not.toContain("import QuickActionsDock from '@/components/dashboard/QuickActionsDock';");
    expect(owner).not.toContain('<QuickActionsDock');
    expect(reportCenter).toContain('data-testid="owner-mega-actions"');
    expect(reportCenter).toContain('model.canAddBranch ?');
    expect(owner).toContain("canAddBranch: role === 'owner'");
    expect(appLayout).not.toContain('QuickActionsDock');
    expect(bottomNav).toContain('fixed inset-x-0 bottom-0 z-50');
    expect(bottomNav).toContain('pb-[env(safe-area-inset-bottom,0px)]');
    expect(erpLayout).toContain('pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px)+1rem)]');
    expect(subscriptionBanner).toContain('min-h-10 items-center justify-between');
    expect(subscriptionBanner).not.toContain('flex flex-col gap-3');
  });
});
