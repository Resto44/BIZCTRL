import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const tenantMocks = vi.hoisted(() => ({
  setActiveRestaurant: vi.fn(),
  activeRestaurant: { id: 'store-a', name: 'Test store' },
  restaurants: [
    { id: 'store-a', name: 'Test store' },
    { id: 'store-b', name: 'Second store' },
  ],
}));

const supabaseMocks = vi.hoisted(() => {
  const queryBuilder = {
    count: 0,
    error: null,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  };
  return { from: vi.fn(() => queryBuilder) };
});

vi.mock('@/api/supabaseClient', () => ({
  supabase: { from: supabaseMocks.from },
}));

vi.mock('@/lib/RoleContext', () => ({
  ROLES: {
    OWNER: 'owner', MANAGER: 'manager', GENERAL_MANAGER: 'general_manager',
    EMPLOYEE: 'employee', SPONSOR: 'sponsor', CUSTOMER: 'customer', SUPPLIER: 'supplier',
  },
  useRole: () => ({
    role: 'owner',
    can: {
      viewDashboard: true, viewSales: true, viewPurchases: true, viewInventory: true,
      viewSuppliers: true, viewNetworkAccounts: true, viewReports: true, viewEmployees: true,
      manageUsers: true, manageCustomers: true, manageDrivers: true, viewDebts: true,
      viewTreasury: true, viewPayroll: true, manageSettings: true, viewAlerts: true,
      manageDashboardCustomization: true, manageBranches: true, viewBilling: true,
    },
  }),
}));

vi.mock('@/lib/TenantContext', () => ({
  useTenant: () => tenantMocks,
}));

vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({ t: (key) => key }),
}));

vi.mock('@/lib/BusinessModeContext', () => ({
  useBusinessMode: () => ({ isRetail: false }),
}));

vi.mock('@/lib/WorkspaceCustomizationContext', () => ({
  useWorkspaceCustomization: () => ({ configuration: {} }),
}));

const { default: BottomNav } = await import('../src/components/layout/BottomNav.jsx');

describe('mobile More and Control workspace', () => {
  it('opens safely and exposes permanent quick actions plus grouped ERP modules', async () => {
    tenantMocks.setActiveRestaurant.mockClear();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let renderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/owner-command-center']}>
            <BottomNav />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    const moreButton = renderer.root.findAllByType('button').find((button) =>
      button.findAllByType('span').some((span) => span.children.includes('more')),
    );
    await act(async () => moreButton.props.onClick());

    expect(renderer.root.findAllByProps({ 'aria-label': 'Search ERP modules' })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ 'aria-labelledby': 'more-control-title' })).toHaveLength(1);
    const links = renderer.root.findAllByType('a');
    expect(links.some((link) => link.props.href === '/sales')).toBe(true);
    expect(links.some((link) => link.props.href === '/purchases?create=1')).toBe(true);
    expect(links.some((link) => link.props.href === '/cash-register')).toBe(true);
    expect(links.some((link) => link.props.href === '/reports')).toBe(true);

    const renderedText = JSON.stringify(renderer.toJSON());
    expect(renderedText).toContain('More & Control');
    expect(renderedText).toContain('All ERP Modules');
    expect(renderedText).toContain('System Status');
    expect(renderedText).not.toContain('approval_center');
  });

  it('opens the store selector and switches the active ERP workspace', async () => {
    tenantMocks.setActiveRestaurant.mockClear();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let renderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/owner-command-center']}>
            <BottomNav />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });

    const moreButton = renderer.root.findAllByType('button').find((button) =>
      button.findAllByType('span').some((span) => span.children.includes('more')),
    );
    await act(async () => moreButton.props.onClick());

    const selector = renderer.root.findByProps({ 'aria-label': 'Select business store' });
    expect(selector.props['aria-expanded']).toBe(false);

    await act(async () => selector.props.onClick());
    expect(renderer.root.findAllByProps({ role: 'listbox' })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ role: 'option' })).toHaveLength(2);

    const secondStore = renderer.root.findAllByProps({ role: 'option' })[1];
    await act(async () => secondStore.props.onClick());

    expect(tenantMocks.setActiveRestaurant).toHaveBeenCalledOnce();
    expect(tenantMocks.setActiveRestaurant).toHaveBeenCalledWith('store-b');
    expect(renderer.root.findAllByProps({ role: 'listbox' })).toHaveLength(0);

    const links = renderer.root.findAllByType('a');
    expect(links.some((link) => link.props.href === '/sales')).toBe(true);
    expect(links.some((link) => link.props.href === '/purchases?create=1')).toBe(true);
  });
});
