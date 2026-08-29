import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

const onboardingPath = new URL('../src/pages/Onboarding.jsx', import.meta.url);
const dashboardPath = new URL('../src/pages/OwnerDashboard.jsx', import.meta.url);
const tenantContextPath = new URL('../src/lib/TenantContext.jsx', import.meta.url);
const headerPath = new URL('../src/components/layout/PortalIdentityHeader.jsx', import.meta.url);
const enumMigrationPath = new URL('../src/supabase/20260815_add_pharmacy_business_mode.sql', import.meta.url);
const resolutionMigrationPath = new URL('../src/supabase/20260815_pharmacy_owner_portal_resolution.sql', import.meta.url);

const identityMocks = vi.hoisted(() => ({
  tenant: { portalIdentity: null, loadingPortalIdentity: false },
  business: { modeIcon: '💊', modeLabel: 'Pharmacy' },
  language: { translateLiteral: (value) => value, t: () => 'Owner' },
}));

vi.mock('@/lib/TenantContext', () => ({ useTenant: () => identityMocks.tenant }));
vi.mock('@/lib/BusinessModeContext', () => ({ useBusinessMode: () => identityMocks.business }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => identityMocks.language }));

const { default: PortalIdentityHeader } = await import('../src/components/layout/PortalIdentityHeader.jsx');

describe('Pharmacy Owner portal resilience', () => {
  it('persists Pharmacy as its canonical business mode rather than collapsing it into Retail', async () => {
    const onboarding = await readFile(onboardingPath, 'utf8');
    expect(onboarding).toContain("businessType === 'pharmacy'");
    expect(onboarding).toContain("? 'pharmacy'");
    expect(onboarding).toContain("['retail', 'wholesale', 'warehouse']");
    expect(onboarding).not.toContain("['retail', 'wholesale', 'warehouse', 'pharmacy']");
  });

  it('adds the enum value before the Pharmacy repair migration and syncs only missing canonical owner memberships', async () => {
    const [enumMigration, resolutionMigration] = await Promise.all([
      readFile(enumMigrationPath, 'utf8'),
      readFile(resolutionMigrationPath, 'utf8'),
    ]);
    expect(enumMigration).toContain("ADD VALUE IF NOT EXISTS 'pharmacy'");
    expect(resolutionMigration).not.toContain('ADD VALUE');
    expect(resolutionMigration).toContain("business_mode = 'pharmacy'::public.business_mode_type");
    expect(resolutionMigration).toContain("lower(coalesce(restaurant.business_type::text, '')) = 'pharmacy'");
    expect(resolutionMigration).toContain('erp_sync_owner_membership_from_restaurant');
    expect(resolutionMigration).toContain('NOT EXISTS');
    expect(resolutionMigration).toContain("lower(membership.role) = 'owner'");
  });

  it('uses the guarded dashboard shell before rendering Pharmacy-sensitive data queries', async () => {
    const dashboard = await readFile(dashboardPath, 'utf8');
    const shellIndex = dashboard.indexOf('export default function OwnerDashboard()');
    const contentIndex = dashboard.indexOf('function OwnerDashboardContent()');
    expect(shellIndex).toBeGreaterThan(-1);
    expect(contentIndex).toBeGreaterThan(-1);
    expect(dashboard).toContain('isLoadingAuth || loadingRestaurants || (activeRestaurant && loadingPortalIdentity)');
    expect(dashboard).toContain("if (!user || authError?.type === 'auth_required')");
    expect(dashboard).toContain('Your session has expired. Please sign in again.');
    expect(dashboard).toContain('if (!activeRestaurant || portalIdentityError)');
    expect(dashboard).toContain('await refetchRestaurants(); await refetchPortalIdentity();');
    expect(dashboard).toContain('return <WidgetErrorBoundary><OwnerDashboardContent /></WidgetErrorBoundary>;');
  });

  it('keeps every owner dashboard data path tenant-scoped and safely disabled until a canonical organization exists', async () => {
    const dashboard = await readFile(dashboardPath, 'utf8');
    expect(dashboard).toContain('const enabled = !!(activeRestaurant?.id);');
    expect(dashboard).toContain('const fetchBranchScopedRows = useCallback(async (table, {');
    expect(dashboard).toContain(".eq('restaurant_id', activeRestaurant.id)");
    expect(dashboard).toContain("queryKey: ['sales_report_period', activeRestaurant?.id, selectedBranchId, period.currentStart, period.currentEnd]");
    expect(dashboard).toContain("queryKey: ['expenses_report_period', activeRestaurant?.id, selectedBranchId, period.currentStart, period.currentEnd]");
    expect(dashboard).toContain("createQuery().eq('branch_id', selectedBranchId)");
    expect(dashboard).toContain(".eq('restaurant_id', activeRestaurant.id)");
    expect(dashboard).toContain('<WidgetErrorBoundary>');
    expect(dashboard).toContain('data-testid="owner-mega-dashboard"');
    expect(dashboard).toContain('buildActiveAlertCandidates({');
    expect(dashboard).toContain('reconcileActiveAlerts({');
  });

  it('renders a safe placeholder when the canonical portal identity has no owner name', () => {
    identityMocks.tenant = {
      portalIdentity: { restaurant_id: 'pharmacy-org', portal_name: 'pharmacy', owner_name: null },
      loadingPortalIdentity: false,
    };
    const markup = renderToStaticMarkup(React.createElement(PortalIdentityHeader));
    expect(markup).toContain('Pharmacy');
    expect(markup).toContain('—');
    expect(markup).not.toContain('null');
    expect(markup).not.toContain('undefined');
  });

  it('withholds the header safely while Pharmacy identity is missing or refreshing', () => {
    identityMocks.tenant = { portalIdentity: null, loadingPortalIdentity: false };
    expect(renderToStaticMarkup(React.createElement(PortalIdentityHeader))).toBe('');
    identityMocks.tenant = { portalIdentity: { restaurant_id: 'pharmacy-org' }, loadingPortalIdentity: true };
    expect(renderToStaticMarkup(React.createElement(PortalIdentityHeader))).toBe('');
  });

  it('clears query and active-restaurant state when the authenticated user changes', async () => {
    const tenantContext = await readFile(tenantContextPath, 'utf8');
    expect(tenantContext).toContain('queryClient.removeQueries();');
    expect(tenantContext).toContain('setActiveRestaurantIdRaw(localStorage.getItem(`rc_restaurant_${email || \'default\'}`) || null);');
    expect(tenantContext).toContain("queryKey: ['portal-identity', user?.id, activeRestaurant?.id]");
  });
});
