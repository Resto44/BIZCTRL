import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/api/supabaseClient', () => ({
  supabase: { from: vi.fn() },
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
  useTenant: () => ({ activeRestaurant: null }),
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
});
