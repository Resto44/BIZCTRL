import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../src/supabase/20260823_platform_owner_owner_membership_deletion_fix.sql', import.meta.url);

describe('Platform Owner deletion of an organization owner', () => {
  it('removes an owner membership rather than writing a suspended owner row that violates erp_membership_owner_scope', async () => {
    const migration = await readFile(migrationPath, 'utf8');

    expect(migration).toContain("DELETE FROM public.erp_memberships\n  WHERE user_id = p_user_id\n    AND role = 'owner';");
    expect(migration).toContain('v_removed_owner_membership := FOUND;');
    expect(migration).toContain('IF NOT v_removed_owner_membership THEN');
    expect(migration).toContain("SET status = 'suspended'");
    expect(migration).toContain("'owner_membership_removed', v_removed_owner_membership");
  });

  it('preserves the protected Platform Owner account boundary and completed Auth/session cleanup', async () => {
    const migration = await readFile(migrationPath, 'utf8');

    expect(migration).toContain("MESSAGE = 'PLATFORM_OWNER_ACCOUNT_PROTECTED'");
    expect(migration).toContain('DELETE FROM auth.sessions WHERE user_id = p_user_id;');
    expect(migration).toContain('UPDATE auth.users');
    expect(migration).toContain('DELETE FROM public.branch_assignments WHERE user_id = p_user_id;');
    expect(migration).toContain("'financial_records_preserved', true");
  });
});
