import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  failMenu: false,
  can: {
    viewDashboard: true,
    viewReports: true,
    viewSales: true,
    viewPurchases: true,
    viewExpenses: true,
    viewInventory: true,
    viewSuppliers: true,
    viewTreasury: true,
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
  useTenant: () => ({ activeRestaurant: { id: 'restaurant-1', name: 'Restaurant' } }),
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
  it('opens without throwing and keeps the two quick-entry actions available', async () => {
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
    expect(renderer.root.findAllByProps({ 'aria-label': 'Search modules and actions' })).toHaveLength(1);
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
    expect(consoleError).toHaveBeenCalledWith(
      '[mobile-erp-menu] render failed; showing safe navigation',
      expect.any(Error),
      expect.any(Object),
    );
    consoleError.mockRestore();
    fixture.failMenu = false;
  });
});
