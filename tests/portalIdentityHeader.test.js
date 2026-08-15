import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import translations from '../src/lib/i18n.js';
import localizedPhrases from '../src/lib/localizedPhrases.js';

const tenantContextPath = new URL('../src/lib/TenantContext.jsx', import.meta.url);
const headerPath = new URL('../src/components/layout/ERPHeader.jsx', import.meta.url);
const identityHeaderPath = new URL('../src/components/layout/PortalIdentityHeader.jsx', import.meta.url);
const migrationPath = new URL('../src/supabase/20260815_authenticated_portal_identity.sql', import.meta.url);
const businessModePath = new URL('../src/lib/BusinessModeContext.jsx', import.meta.url);

const identityMocks = vi.hoisted(() => ({
  tenant: { portalIdentity: { restaurant_id: 'org-a', portal_name: 'restaurant', owner_name: 'Amin Owner' }, loadingPortalIdentity: false },
  business: { modeIcon: '🍽️', modeLabel: 'Restaurant' },
  language: { translateLiteral: (value) => value, t: (key) => key },
}));

vi.mock('@/lib/TenantContext', () => ({ useTenant: () => identityMocks.tenant }));
vi.mock('@/lib/BusinessModeContext', () => ({ useBusinessMode: () => identityMocks.business }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => identityMocks.language }));

const { default: PortalIdentityHeader } = await import('../src/components/layout/PortalIdentityHeader.jsx');

describe('authenticated portal identity contract', () => {
  it('resolves the selected tenant through a server-validated authenticated RPC', async () => {
    const [tenantContext, migration] = await Promise.all([
      readFile(tenantContextPath, 'utf8'),
      readFile(migrationPath, 'utf8'),
    ]);
    expect(tenantContext).toContain("supabase.rpc('erp_get_authenticated_portal_identity'");
    expect(tenantContext).toContain('p_restaurant_id: activeRestaurant.id');
    expect(migration).toContain('v_user_id uuid := auth.uid();');
    expect(migration).toContain("MESSAGE = 'TENANT_SCOPE_DENIED'");
    expect(migration).toContain("lower(m.role) = 'owner'");
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.erp_get_authenticated_portal_identity(uuid) TO authenticated;');
  });

  it('renders one global localized portal and organization-owner identity block', async () => {
    const [header, identityHeader] = await Promise.all([
      readFile(headerPath, 'utf8'),
      readFile(identityHeaderPath, 'utf8'),
    ]);
    expect(header).toContain('<PortalIdentityHeader />');
    expect(identityHeader).toContain('translateLiteral(modeLabel || portalIdentity.portal_name)');
    expect(identityHeader).toContain("t('owner')");
    expect(identityHeader).toContain('portalIdentity.owner_name');
    expect(identityHeader).toContain('truncate');
    expect(identityHeader).not.toContain('Restaurant     Owner');
  });

  it('covers the canonical Restaurant, Pharmacy, and Retail identity labels in English, Persian, and Arabic', async () => {
    const businessModeSource = await readFile(businessModePath, 'utf8');
    for (const [mode, englishLabel] of [['restaurant', 'Restaurant'], ['pharmacy', 'Pharmacy'], ['retail', 'Retail']]) {
      expect(businessModeSource).toContain(`${mode}:`);
      expect(localizedPhrases[englishLabel]?.fa).toBeTruthy();
      expect(localizedPhrases[englishLabel]?.ar).toBeTruthy();
    }
    expect(translations.en.owner).toBe('Owner');
    expect(translations.fa.owner).toBeTruthy();
    expect(translations.ar.owner).toBeTruthy();
  });

  it('keys identity state by viewer and restaurant and clears cached tenant state on session change', async () => {
    const tenantContext = await readFile(tenantContextPath, 'utf8');
    expect(tenantContext).toContain("queryKey: ['portal-identity', user?.id, activeRestaurant?.id]");
    expect(tenantContext).toContain('queryClient.removeQueries();');
    expect(tenantContext).toContain("localStorage.removeItem(`rc_restaurant_${prevEmailRef.current}`)");
  });

  it.each([
    ['Restaurant', '🍽️', 'Owner', 'Amin Owner'],
    ['Pharmacy', '💊', 'مالک', 'ایمان خان'],
    ['Retail', '🛍️', 'المالك', 'إيمان خان'],
  ])('renders localized %s portal and owner identity', (modeLabel, modeIcon, ownerLabel, ownerName) => {
    identityMocks.tenant = { portalIdentity: { restaurant_id: `org-${modeLabel}`, portal_name: modeLabel.toLowerCase(), owner_name: ownerName }, loadingPortalIdentity: false };
    identityMocks.business = { modeIcon, modeLabel };
    identityMocks.language = { translateLiteral: (value) => value, t: () => ownerLabel };
    const markup = renderToStaticMarkup(React.createElement(PortalIdentityHeader));
    expect(markup).toContain(modeLabel);
    expect(markup).toContain(ownerLabel);
    expect(markup).toContain(ownerName);
    expect(markup).toContain(modeIcon);
  });

  it('replaces, rather than retains, displayed owner identity when the active tenant changes', () => {
    identityMocks.business = { modeIcon: '🍽️', modeLabel: 'Restaurant' };
    identityMocks.language = { translateLiteral: (value) => value, t: () => 'Owner' };
    identityMocks.tenant = { portalIdentity: { restaurant_id: 'org-a', portal_name: 'restaurant', owner_name: 'Owner A' }, loadingPortalIdentity: false };
    const firstMarkup = renderToStaticMarkup(React.createElement(PortalIdentityHeader));
    identityMocks.tenant = { portalIdentity: { restaurant_id: 'org-b', portal_name: 'pharmacy', owner_name: 'Owner B' }, loadingPortalIdentity: false };
    identityMocks.business = { modeIcon: '💊', modeLabel: 'Pharmacy' };
    const secondMarkup = renderToStaticMarkup(React.createElement(PortalIdentityHeader));
    expect(firstMarkup).toContain('Owner A');
    expect(secondMarkup).toContain('Owner B');
    expect(secondMarkup).not.toContain('Owner A');
  });
});
