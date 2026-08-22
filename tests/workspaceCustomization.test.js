import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_WORKSPACE_CUSTOMIZATION,
  getCustomizedNavigationGroups,
  mergeWorkspaceCustomization,
  normalizeWorkspaceCustomization,
} from '../src/lib/workspaceCustomization.js';

const migrationPath = new URL('../src/supabase/20260822_workspace_customization.sql', import.meta.url);

const nav = [
  {
    key: 'core',
    label: 'Core',
    items: [
      { path: '/owner-command-center', label: 'Dashboard' },
      { path: '/sales', label: 'Sales' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    items: [{ path: '/customize-workspace', label: 'Customize your workspace' }],
  },
];

describe('Workspace customization runtime', () => {
  it('preserves the existing default workspace when no configuration exists', () => {
    expect(normalizeWorkspaceCustomization({})).toEqual(DEFAULT_WORKSPACE_CUSTOMIZATION);
  });

  it('applies only a tenant configuration patch without mutating another configuration object', () => {
    const tenantA = mergeWorkspaceCustomization(DEFAULT_WORKSPACE_CUSTOMIZATION, {
      navigation: { hidden_paths: ['/sales'] },
      regional: { language: 'ar', decimal_places: 3 },
    });
    const tenantB = normalizeWorkspaceCustomization({});

    expect(tenantA.navigation.hidden_paths).toEqual(['/sales']);
    expect(tenantA.regional.language).toBe('ar');
    expect(tenantB.navigation.hidden_paths).toEqual([]);
    expect(tenantB.regional.language).toBe('en');
  });

  it('filters and orders navigation only as a presentation layer', () => {
    const config = mergeWorkspaceCustomization(DEFAULT_WORKSPACE_CUSTOMIZATION, {
      navigation: { hidden_paths: ['/sales'], order: ['/customize-workspace', '/owner-command-center'] },
    });
    const configured = getCustomizedNavigationGroups(nav, config);
    expect(configured.flatMap((group) => group.items).map((item) => item.path)).toEqual([
      '/owner-command-center',
      '/customize-workspace',
    ]);
  });

  it('rejects executable text and unrecognized custom field data while keeping valid Unicode field labels', () => {
    const config = normalizeWorkspaceCustomization({
      labels: { Dashboard: '<script>alert(1)</script>', Customer: 'مهمان' },
      fields: {
        products: [
          { id: 'unsafe', label: 'javascript: bad', type: 'text' },
          { id: 'customer_type', label: 'نوع مشتری', type: 'text', required: true },
        ],
      },
    });
    expect(config.labels).toEqual({ Customer: 'مهمان' });
    expect(config.fields.products).toEqual([expect.objectContaining({ id: 'customer_type', label: 'نوع مشتری', required: true })]);
  });

  it('uses one additive tenant-scoped configuration path and does not introduce billing, plan, entitlement, or Paddle tables', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    expect(migration).toContain('workspace_customization');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.erp_update_workspace_customization');
    expect(migration).toContain('public.erp_can_manage_workspace_customization');
    expect(migration).toContain('INSERT INTO public.audit_logs');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.workspace_saved_views');
    expect(migration).not.toContain('custom_subscriptions');
    expect(migration).not.toContain('custom_plans');
    expect(migration).not.toContain('custom_entitlements');
    expect(migration).not.toContain('custom_paddle');
  });
});
