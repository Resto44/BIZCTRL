import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const migration = new URL('../supabase/migrations/20261109220000_fix_driver_membership_contract_role.sql', import.meta.url);
const invitation = new URL('../supabase/migrations/20261109150000_driver_role_and_invitation_restore.sql', import.meta.url);

describe('driver invitation activation contract', () => {
  it('aligns the membership trigger with the already-authorized Driver portal role', async () => {
    const [sql, original] = await Promise.all([readFile(migration, 'utf8'), readFile(invitation, 'utf8')]);
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.erp_enforce_membership_contract()');
    expect(sql).toContain("NOT IN ('owner', 'manager', 'employee', 'supplier', 'driver')");
    expect(original).toContain("'driver'");
    expect(original).toContain("WHEN 'driver' then");
  });

  it('retains tenant branch scoping and bounded permissions for drivers', async () => {
    const sql = await readFile(migration, 'utf8');
    expect(sql).toContain("NEW.data_scope := 'assigned_branch'");
    expect(sql).toContain("NEW.selected_branch_ids := '{}'::uuid[]");
    expect(sql).toContain("NEW.status = 'approved' AND (NEW.restaurant_id IS NULL OR NEW.branch_id IS NULL)");
    expect(sql).toContain("public.erp_sanitize_permissions(NEW.role, NEW.permissions)");
    expect(sql).toContain("NEW.permissions := '{}'::jsonb");
  });

  it('makes no changes to identity, financial records, RLS policies or role grants', async () => {
    const sql = await readFile(migration, 'utf8');
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|GRANT|REVOKE)\s+(?:INTO|FROM|TABLE|POLICY|ON)\b/i);
    expect(sql).not.toContain('DISABLE TRIGGER');
    expect(sql).not.toContain('BYPASSRLS');
  });
});
