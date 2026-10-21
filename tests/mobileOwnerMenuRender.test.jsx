import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  failMenu: false,
  portal: 'restaurant',
  can: {
    viewDashboard: true,
    viewReports: true,
    viewSales: true,
    viewPurchases: true,
    viewExpenses: true,
    viewInventory: true,
    viewSuppliers: true,
    viewTreasury: true,
    viewSponsorTreasury: true,
    viewDebts: true,
    viewNetworkAccounts: true,
    viewPayroll: true,
    viewEmployees: true,
    viewAttendance: true,
    viewEmployeeControl: true,
    viewAlerts: true,
    manageBranches: true,
    manageSettings: true,
    viewBrandSettings: true,
    viewBilling: true,
    manageDashboardCustomization: true,
  },
}));

vi.mock('@/lib/RoleContext', () => ({
  useRole: () => ({ role: 'owner', can: fixture.can }),
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner-1' }, logout: vi.fn() }),
}));

vi.mock('@/lib/TenantContext', () => ({
  useTenant: () => ({ activeRestaurant: { id: 'restaurant-1', name: 'Restaurant', business_type: fixture.portal } }),
}));

vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({
    lang: 'en',
    t: (key) => key,
    translateLiteral: (value) => value,
  }),
}));

vi.mock('@/hooks/useERPNavigation', () => ({
  useERPNavigation: () => ({ favorites: [], recentPages: [] }),
}));

vi.mock('@/lib/WorkspaceCustomizationContext', () => ({
  useWorkspaceCustomization: () => ({ configuration: {} }),
}));

vi.mock('@/lib/workspaceCustomization', () => ({
  getCustomizedNavigationGroups: (groups) => fixture.failMenu ? null : groups,
}));

globalThis.window = globalThis.window || {};
window.self = window;
window.top = window;

const { default: ERPSidebar } = await import('../src/components/layout/ERPSidebar.jsx');

describe('mobile owner ERP menu render', () => {
  it.each(['restaurant','retail','services'])('opens Finance and exposes the partner account page for %s', async portal => {
    fixture.portal=portal; const client=new QueryClient(); let renderer;
    await act(async()=>{renderer=TestRenderer.create(<QueryClientProvider client={client}><MemoryRouter><ERPSidebar collapsed={false} mobile onToggle={()=>{}} onNavigate={()=>{}} /></MemoryRouter></QueryClientProvider>);});
    const section=renderer.root.findAllByType('button').find(button=>button.findAllByType('span').some(span=>span.children.includes('Finance & Treasury')));
    await act(async()=>section.props.onClick());
    const links=renderer.root.findAllByType('a').filter(link=>link.props.href==='/wallet-banking');
    expect(links).toHaveLength(1);
    expect(JSON.stringify(links[0].toJSON?.()||links[0].findAllByType('span').map(x=>x.children))).toContain('Wallet Banking Center');
    await act(async()=>renderer.unmount());client.clear();fixture.portal='restaurant';
  });

  it.each(['restaurant', 'retail'])('keeps the POS sales entry discoverable only for %s scope', async portal => {
    fixture.portal = portal;
    const client = new QueryClient(); let renderer;
    await act(async () => { renderer = TestRenderer.create(<QueryClientProvider client={client}><MemoryRouter><ERPSidebar collapsed={false} mobile onToggle={() => {}} onNavigate={() => {}} /></MemoryRouter></QueryClientProvider>); });
    const section = renderer.root.findAllByType('button').find(button => button.findAllByType('span').some(span => span.children.includes('Sales & Customers')));
    await act(async () => section.props.onClick());
    expect(renderer.root.findAllByType('a').some(link => link.props.href === '/restaurant/pos')).toBe(portal === 'restaurant');
    await act(async () => renderer.unmount()); client.clear(); fixture.portal = 'restaurant';
  });
  it('opens without throwing and shows four permission-controlled Quick Entry actions', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let renderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/owner-command-center']}>
            <ERPSidebar collapsed={false} mobile onToggle={() => {}} onNavigate={() => {}} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    const links = renderer.root.findAllByType('a');
    expect(links.some((link) => link.props.href === '/sales')).toBe(true);
    expect(links.some((link) => link.props.href === '/purchases?create=1')).toBe(true);
    expect(links.some((link) => link.props.href === '/sales-sources?create=1')).toBe(true);
    expect(links.some((link) => link.props.href === '/product-management')).toBe(true);
    expect(renderer.root.findAllByProps({ 'data-testid': 'mobile-quick-sales-sources' })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ 'data-testid': 'mobile-quick-add-product' })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ 'aria-label': 'Search modules and actions' })).toHaveLength(1);
    await act(async () => renderer.unmount());
    queryClient.clear();
  });

  it('does not expose restricted quick actions if ERP permissions are missing', async () => {
    const previousPermissions = fixture.can;
    fixture.can = { ...previousPermissions, viewInventory: false, viewSales: false };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let renderer;
    try {
      await act(async () => {
        renderer = TestRenderer.create(
          <QueryClientProvider client={client}>
            <MemoryRouter><ERPSidebar mobile collapsed={false} onToggle={() => {}} onNavigate={() => {}} /></MemoryRouter>
          </QueryClientProvider>,
        );
      });
      const links = renderer.root.findAllByType('a');
      expect(links.some((link) => link.props.href === '/sales-sources?create=1')).toBe(false);
      expect(links.some((link) => link.props.href === '/product-management')).toBe(false);
      expect(links.some((link) => link.props.href === '/purchases?create=1')).toBe(true);
    } finally {
      if (renderer) await act(async () => renderer.unmount());
      fixture.can = previousPermissions;
      client.clear();
    }
  });

  it('shows safe navigation instead of crashing the application when the rich menu fails', async () => {
    fixture.failMenu = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let renderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/owner-command-center']}>
            <ERPSidebar collapsed={false} mobile onToggle={() => {}} onNavigate={() => {}} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    expect(renderer.root.findAllByProps({ 'aria-label': 'Safe navigation' })).toHaveLength(1);
    const links = renderer.root.findAllByType('a');
    expect(links.some((link) => link.props.href === '/sales')).toBe(true);
    expect(links.some((link) => link.props.href === '/purchases?create=1')).toBe(true);
    expect(links.some((link) => link.props.href === '/sales-sources?create=1')).toBe(true);
    expect(links.some((link) => link.props.href === '/product-management')).toBe(true);
    expect(consoleError).toHaveBeenCalledWith(
      '[mobile-erp-menu] render failed; showing safe navigation',
      expect.any(Error),
      expect.any(Object),
    );
    consoleError.mockRestore();
    fixture.failMenu = false;
  });
});
