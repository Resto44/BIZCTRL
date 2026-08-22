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
    expect(layout).toContain('mobile');
    expect(layout).toContain('onNavigate={() => setMobileMenuOpen(false)}');
    expect(sidebar).toContain('mobile = false');
    expect(sidebar).toContain('flex h-dvh');
    expect(sidebar).toContain('overflow-y-auto scrollbar-thin py-2');
    expect(sidebar).toContain('onClick={onNavigate}');
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
