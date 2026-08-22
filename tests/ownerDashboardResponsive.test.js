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

  it('keeps Quick Shortcuts fixed above Bottom Navigation while reserving dashboard access space', async () => {
    const [quickActions, owner, appLayout, bottomNav, erpLayout, indexCss, serviceWorker] = await Promise.all([
      source('../src/components/dashboard/QuickActionsDock.jsx'),
      source('../src/pages/OwnerDashboard.jsx'),
      source('../src/components/layout/AppLayout.jsx'),
      source('../src/components/layout/BottomNav.jsx'),
      source('../src/components/layout/ERPLayout.jsx'),
      source('../src/index.css'),
      source('../public/sw.js'),
    ]);
    expect(quickActions).toContain('pointer-events-none fixed inset-x-0');
    expect(quickActions).toContain('bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))]');
    expect(quickActions).toContain('z-40');
    expect(quickActions).toContain('overflow-x-auto overscroll-x-contain');
    expect(quickActions).toContain('lg:overflow-x-visible');
    expect(quickActions).not.toMatch(/sticky|absolute|bottom-0/);
    expect(owner).toContain("import QuickActionsDock from '@/components/dashboard/QuickActionsDock';");
    expect(owner).toContain('<QuickActionsDock />');
    expect(owner).toContain('pb-[calc(var(--quick-shortcuts-height)+1rem)]');
    expect(appLayout).not.toContain('QuickActionsDock');
    expect(bottomNav).toContain('fixed inset-x-0 bottom-0 z-50');
    expect(bottomNav).toContain('pb-[env(safe-area-inset-bottom,0px)]');
    expect(erpLayout).toContain('pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px)+1rem)]');
    expect(indexCss).toContain('--quick-shortcuts-height: 88px;');
    expect(serviceWorker).toContain("const CACHE_VERSION = 'v10';");
  });
});
