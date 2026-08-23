import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../src/supabase/20260823_platform_owner_user_deletion_completion.sql', import.meta.url);
const portalPath = new URL('../src/pages/PlatformOwnerPortal.jsx', import.meta.url);

describe('Platform Owner user deletion completion', () => {
  it('anonymizes the authenticated account and revokes all existing sessions while preserving immutable records', async () => {
    const migration = await readFile(migrationPath, 'utf8');

    expect(migration).toContain("btrim(coalesce(p_confirmation, '')) <> 'DELETE USER'");
    expect(migration).toContain("MESSAGE = 'PLATFORM_OWNER_ACCOUNT_PROTECTED'");
    expect(migration).toContain('DELETE FROM auth.sessions WHERE user_id = p_user_id;');
    expect(migration).toContain('UPDATE auth.users');
    expect(migration).toContain("banned_until = 'infinity'::timestamptz");
    expect(migration).toContain('deleted_at = now()');
    expect(migration).toContain('UPDATE auth.identities');
    expect(migration).toContain("'auth_account_anonymized', true");
    expect(migration).toContain("'financial_records_preserved', true");
    expect(migration).not.toContain('DELETE FROM auth.users');
  });

  it('removes archived profiles from the Platform Owner users registry after deletion', async () => {
    const migration = await readFile(migrationPath, 'utf8');

    expect(migration).toContain('WHERE profile.archived_at IS NULL');
    expect(migration).toContain("'status', 'deleted_and_anonymized'");
  });

  it('shows an explicit successful deletion message after the server confirms the completed operation', async () => {
    const portal = await readFile(portalPath, 'utf8');

    expect(portal).toContain("result?.status === 'deleted_and_anonymized' ? t.userDeleted : t.saveSucceeded");
    expect(portal).toContain("userDeleted: 'دسترسی کاربر حذف و اطلاعات او ناشناس شد.'");
  });
});
