import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relativePath) => readFile(resolve(process.cwd(), relativePath), 'utf8');

describe('Sales Closing finalized Customer Credit snapshot regression', () => {
  it('allows only the atomic owner transaction to enrich the new immutable version', async () => {
    const migration = await source('src/supabase/20260829_fix_sales_closing_finalized_credit_snapshot.sql');

    expect(migration).toContain("current_setting('app.sales_closing_transaction', true)");
    expect(migration).toContain('current_user = v_table_owner');
    expect(migration).toContain("COALESCE(OLD.credit_entries_json, '[]'::jsonb) = '[]'::jsonb");
    expect(migration).toContain("to_jsonb(NEW) - 'credit_entries_json'");
    expect(migration).toContain("to_jsonb(OLD) - 'credit_entries_json'");
    expect(migration).toContain("RAISE EXCEPTION 'SALES_CLOSING_VERSION_IMMUTABLE'");
  });

  it('removes direct Data API mutation access to append-only finalized history', async () => {
    const migration = await source('src/supabase/20260829_fix_sales_closing_finalized_credit_snapshot.sql');

    expect(migration).toContain('ALTER TABLE public.sales_closing_finalized_versions ENABLE ROW LEVEL SECURITY;');
    expect(migration).toContain('REVOKE ALL ON TABLE public.sales_closing_finalized_versions FROM PUBLIC, anon, authenticated;');
  });
});
