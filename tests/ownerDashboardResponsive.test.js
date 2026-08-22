import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Owner Dashboard mobile responsiveness contract', () => {
  it('does not use 100vw in the Owner Dashboard or shared responsive shell', async () => {
    const files = await Promise.all([
      source('../src/pages/OwnerDashboard.jsx'),
      source('../src/components/layout/AppLayout.jsx'),
      source('../src/components/layout/ERPLayout.jsx'),
      source('../src/components/layout/ERPHeader.jsx'),
      source('../src/components/layout/BottomNav.jsx'),
      source('../src/components/dashboard/QuickActionsDock.jsx'),
    ]);
    expect(files.join('\n')).not.toMatch(/100vw/);
  });

  it('uses shrinkable viewport-bounded containers for the shared shell and Owner Dashboard', async () => {
    const [owner, appLayout, erpLayout] = await Promise.all([
      source('../src/pages/OwnerDashboard.jsx'),
      source('../src/components/layout/AppLayout.jsx'),
      source('../src/components/layout/ERPLayout.jsx'),
    ]);
    expect(owner).toContain('w-full min-w-0 max-w-full');
    expect(owner).toContain('flex-col gap-3 pt-2 sm:flex-row');
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

  it('keeps Quick Shortcuts in dashboard flow and preserves bottom-navigation safe-area clearance', async () => {
    const [quickActions, owner, appLayout, bottomNav, erpLayout] = await Promise.all([
      source('../src/components/dashboard/QuickActionsDock.jsx'),
      source('../src/pages/OwnerDashboard.jsx'),
      source('../src/components/layout/AppLayout.jsx'),
      source('../src/components/layout/BottomNav.jsx'),
      source('../src/components/layout/ERPLayout.jsx'),
    ]);
    expect(quickActions).toContain('grid min-w-0 grid-cols-2');
    expect(quickActions).toContain('sm:grid-cols-3 sm:gap-3 xl:grid-cols-6');
    expect(quickActions).not.toMatch(/className="fixed|position:\s*fixed|z-\[9999\]/);
    expect(owner).toContain("import QuickActionsDock from '@/components/dashboard/QuickActionsDock';");
    expect(owner).toContain('<QuickActionsDock />');
    expect(appLayout).not.toContain('QuickActionsDock');
    expect(bottomNav).toContain('pb-[env(safe-area-inset-bottom,0px)]');
    expect(erpLayout).toContain('pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px)+1rem)]');
  });
});
