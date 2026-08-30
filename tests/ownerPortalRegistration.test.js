import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const registrationPath = new URL('../src/pages/ERPRegister.jsx', import.meta.url);
const customizationPath = new URL('../src/lib/workspaceCustomization.js', import.meta.url);
const migrationPath = new URL('../supabase/migrations/20260830_owner_registration_portal_selection.sql', import.meta.url);
const compatibilityMigrationPath = new URL('../supabase/migrations/20260830_owner_registration_portal_compatibility.sql', import.meta.url);

const portalKeys = [
  'restaurant', 'cafe', 'retail', 'warehouse', 'factory',
  'pharmacy', 'clinic', 'wholesale', 'services', 'other',
];

describe('owner registration portal selection', () => {
  it('requires the owner to choose from the canonical ERP portal catalog', async () => {
    const [registration, customization] = await Promise.all([
      readFile(registrationPath, 'utf8'),
      readFile(customizationPath, 'utf8'),
    ]);

    expect(registration).toContain('Select portal');
    expect(registration).toContain('BUSINESS_TEMPLATE_KEYS.map');
    expect(registration).toContain("portal: ''");
    expect(registration).toContain('BUSINESS_TEMPLATE_KEYS.includes(clean.portal)');
    expect(registration).toContain("business_type: clean.portal");
    expect(registration).toContain("business_mode: clean.portal");
    expect(registration).toContain('Staff accounts are invitation-only');

    for (const portal of portalKeys) expect(customization).toContain(`'${portal}'`);
  });

  it('validates and persists the exact selected portal in the owner Auth trigger', async () => {
    const [migration, compatibilityMigration] = await Promise.all([
      readFile(migrationPath, 'utf8'),
      readFile(compatibilityMigrationPath, 'utf8'),
    ]);

    for (const portal of portalKeys) expect(migration).toContain(`'${portal}'`);
    expect(migration).toContain('requested_business_mode::public.business_mode_type');
    expect(migration).toContain("RAISE EXCEPTION ''Owner setup requires a valid ERP portal''");
    expect(migration).toContain("'workspace_customization'");
    expect(migration).toContain('public.erp_registration_workspace_for_portal(requested_business_mode)');
    expect(migration).toContain('business_type = p_business_mode');
    expect(migration).toContain('clean Platform Owner Auth bypass');
    expect(compatibilityMigration).toContain("nullif(NEW.raw_user_meta_data->>''business_type'', ''''), ''restaurant''");
    expect(compatibilityMigration).toContain('Any non-empty');
  });
});
