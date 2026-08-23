import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../src/supabase/20260823_platform_owner_user_mutation_trigger_fix.sql', import.meta.url);

describe('Platform Owner user deletion authorization trigger', () => {
  it('keeps the approval-workflow guard while admitting only transaction-scoped, server-authorized Platform Owner mutations', async () => {
    const migration = await readFile(migrationPath, 'utf8');

    expect(migration).toContain("current_setting('app.platform_owner_user_mutation', true)");
    expect(migration).toContain('PERFORM public.platform_owner_assert();');
    expect(migration).toContain("RAISE EXCEPTION 'Authorization fields can only be changed through the owner approval workflow'");
    expect(migration).toContain('actor.role = \'owner\'');
    expect(migration).toContain("actor.status = 'approved'");
  });

  it('marks each server-authorized Platform Owner user mutation before it updates protected profile fields', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    const marker = "PERFORM set_config('app.platform_owner_user_mutation', 'enabled', true);";

    expect(migration.split(marker)).toHaveLength(4);
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.platform_owner_set_user_status');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.platform_owner_archive_user');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.platform_owner_anonymize_user');
  });

  it('retains the completed deletion protections for confirmation, sessions, Auth anonymization, and Platform Owner account protection', async () => {
    const migration = await readFile(migrationPath, 'utf8');

    expect(migration).toContain("btrim(coalesce(p_confirmation, '')) <> 'DELETE USER'");
    expect(migration).toContain("MESSAGE = 'PLATFORM_OWNER_ACCOUNT_PROTECTED'");
    expect(migration).toContain('DELETE FROM auth.sessions WHERE user_id = p_user_id;');
    expect(migration).toContain('UPDATE auth.users');
    expect(migration).toContain("banned_until = 'infinity'::timestamptz");
  });
});
