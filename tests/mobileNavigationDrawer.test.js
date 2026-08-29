import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('mobile navigation drawer contract', () => {
  it('wires the 44px hamburger to a mobile drawer that renders independently of desktop sidebar visibility', async () => {
    const [header, layout, sidebar] = await Promise.all([
      source('../src/components/layout/ERPHeader.jsx'),
      source('../src/components/layout/ERPLayout.jsx'),
      source('../src/components/layout/ERPSidebar.jsx'),
    ]);

    expect(header).toContain('h-11 w-11 shrink-0 touch-manipulation lg:hidden');
    expect(header).toContain('aria-label="Open navigation drawer"');
    expect(header).toContain('onClick={() => onMobileMenuToggle?.()}');
    expect(layout).toContain('{mobileMenuOpen && (');
    expect(layout).toContain('w-[min(90vw,440px)] max-w-full min-w-0');
    expect(layout).toContain('touch-none overscroll-none bg-black/50');
    expect(layout).toContain("body.style.overflow = 'hidden'");
    expect(layout).toContain("documentElement.style.overflow = 'hidden'");
    expect(layout).toContain('onNavigate={() => setMobileMenuOpen(false)}');
    expect(sidebar).toContain('mobile = false');
    expect(sidebar).toContain('h-dvh max-h-dvh w-full min-w-0 max-w-full');
    expect(sidebar).toContain('overflow-x-hidden overflow-y-auto overscroll-contain');
    expect(sidebar).toContain('flex-1 min-h-0 min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain');
    expect(sidebar).toContain('sticky bottom-0 z-10 shrink-0');
    expect(sidebar).toContain('pb-[max(0.5rem,env(safe-area-inset-bottom))]');
    expect(sidebar).toContain('[overflow-wrap:anywhere]');
    expect(sidebar).toContain('[word-break:break-word]');
    expect(sidebar).toContain('onClick={onNavigate}');
  });

  it('renders the approved smart Owner menu without opening live data channels and keeps fixed quick-entry actions', async () => {
    const [sidebar, purchases] = await Promise.all([
      source('../src/components/layout/ERPSidebar.jsx'),
      source('../src/pages/Purchases.jsx'),
    ]);

    expect(sidebar).toContain('function MobileOwnerMenu');
    expect(sidebar).toContain('Command Center');
    expect(sidebar).toContain('Ask or search ERP');
    expect(sidebar).toContain("TODAY'S WORK");
    expect(sidebar).toContain('Executive Reports');
    expect(sidebar).toContain('Sales & Customers');
    expect(sidebar).toContain('Finance & Treasury');
    expect(sidebar).toContain('Inventory & Supply');
    expect(sidebar).toContain('Team & Administration');
    expect(sidebar).toContain('class MobileMenuErrorBoundary');
    expect(sidebar).toContain('function MobileMenuFallback');
    expect(sidebar).toContain('ERP ready');
    expect(sidebar).not.toContain('useActiveAlerts()');
    expect(sidebar).not.toContain(".from('daily_sales')");
    expect(sidebar).not.toContain(".from('supplier_invoices')");
    expect(sidebar).toContain('QUICK ENTRY');
    expect(sidebar).toContain('to="/sales"');
    expect(sidebar).toContain('to="/purchases?create=1"');
    expect(purchases).toContain("searchParams.get('create') !== '1'");
    expect(purchases).toContain('setShowForm(true)');
    expect(purchases).toContain("nextParams.delete('create')");
  });

  it('exposes existing Owner routes through canonical role and feature guards', async () => {
    const [sidebar, app, role] = await Promise.all([
      source('../src/components/layout/ERPSidebar.jsx'),
      source('../src/App.jsx'),
      source('../src/lib/RoleContext.jsx'),
    ]);

    for (const path of [
      '/cash-register',
      '/customer-management',
      '/driver-management',
      '/bi-center',
      '/network-management',
      '/billing',
      '/support',
    ]) {
      expect(sidebar).toContain(`path: '${path}'`);
    }
    expect(app).toContain('FeatureRouteGuard feature="driver_analytics"');
    expect(app).toContain('FeatureRouteGuard feature="advanced_analytics"');
    expect(app).toContain('FeatureRouteGuard feature="network_management"');
    expect(role).toContain('if (role === ROLES.OWNER)');
    expect(role).toContain('[key]: true');
  });

  it('imports every icon used by the expanded mobile module registry', async () => {
    const sidebar = await source('../src/components/layout/ERPSidebar.jsx');

    expect(sidebar).toContain('SlidersHorizontal, Truck, X');
    expect(sidebar).toContain("label: 'Driver Management',icon: Truck");
  });
});
