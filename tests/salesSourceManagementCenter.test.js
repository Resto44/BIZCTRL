import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Sales Source Management Center contract', () => {
  it('extends the existing ERP source and debt architecture without creating duplicate transaction tables', async () => {
    const migration = await source('../src/supabase/20260825_sales_source_management_center.sql');

    expect(migration).toContain('ALTER TABLE public.sales_sources');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS category TEXT');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS branch_ids UUID[]');
    expect(migration).toContain('ALTER TABLE public.debt_records');
    expect(migration).toContain('ALTER TABLE public.debt_payments');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.sales_sources(id) ON DELETE RESTRICT');
    expect(migration).not.toContain('CREATE TABLE public.sales_source_transactions');
    expect(migration).not.toContain('CREATE TABLE public.sales_source_history');
    expect(migration).not.toContain('CREATE TABLE public.sales_source_debts');
  });

  it('protects historical source IDs and permits archive/deactivation instead of deletion', async () => {
    const migration = await source('../src/supabase/20260825_sales_source_management_center.sql');
    const page = await source('../src/pages/SalesSourceManagement.jsx');

    expect(migration).toContain('prevent_sales_source_delete_if_in_use');
    expect(migration).toContain("RAISE EXCEPTION 'SALES_SOURCE_IN_USE'");
    expect(migration).toContain("jsonb_build_object('source_id', OLD.id::text)");
    expect(page).toContain("deleteError?.message === 'SALES_SOURCE_IN_USE'");
    expect(page).toContain("salesSourceManagement.archiveInstead");
    expect(page).toContain("is_active: source.is_active === false");
  });

  it('uses one branch-aware master-source cache and supports global, multi-branch, and legacy branch assignments', async () => {
    const hook = await source('../src/hooks/useSalesSources.js');
    const migration = await source('../src/supabase/20260825_sales_source_management_center.sql');

    expect(hook).toContain('useSalesClosingCustomization()');
    expect(hook).toContain('source?.is_global || (!source?.branch_id && !asRecordArray(source?.branch_ids).length)');
    expect(hook).toContain('canonicalIds.includes(String(branchId))');
    expect(hook).toContain('String(source.branch_id) === String(branchId)');
    expect(hook).toContain('String(source.branch_id) === String(branchKey)');
    expect(migration).toContain('sales_sources_scope_select');
    expect(migration).toContain("membership.branch_id = ANY(COALESCE(sales_sources.branch_ids, ARRAY[]::UUID[]))");
  });

  it('derives paginated history and dashboard metrics only from finalized daily-sales snapshots and existing debt records', async () => {
    const [migration, hook] = await Promise.all([
      source('../src/supabase/20260825_sales_source_management_center.sql'),
      source('../src/hooks/useSalesSourceManagement.js'),
    ]);

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_sales_source_history');
    expect(migration).toContain("COALESCE(closing.closing_state, 'finalized') <> 'draft'");
    expect(migration).toContain('jsonb_array_elements(');
    expect(migration).toContain("jsonb_typeof(COALESCE(closing.sales_sources_json, '[]'::JSONB)) = 'array'");
    expect(migration).toContain('LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)');
    expect(migration).toContain('OFFSET GREATEST(COALESCE(p_offset, 0), 0)');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_sales_source_dashboard');
    expect(migration).toContain('FROM public.debt_records AS record');
    expect(hook).toContain("supabase.rpc('get_sales_source_history'");
    expect(hook).toContain("supabase.rpc('get_sales_source_dashboard'");
    expect(hook).toContain('p_limit: SALES_SOURCE_HISTORY_PAGE_SIZE');
    expect(hook).toContain('p_offset: page * SALES_SOURCE_HISTORY_PAGE_SIZE');
  });

  it('guards legacy scalar source snapshots so one malformed historical record cannot break source history or dashboard reads', async () => {
    const guardMigration = await source('../src/supabase/20260825_sales_source_history_scalar_guard.sql');

    expect(guardMigration).toContain('CREATE OR REPLACE FUNCTION public.get_sales_source_history');
    expect(guardMigration).toContain("jsonb_typeof(COALESCE(closing.sales_sources_json, '[]'::JSONB)) = 'array'");
    expect(guardMigration).toContain("ELSE '[]'::JSONB");
  });

  it('provides management, dashboard, history, analytics, reconciliation, branch, search, filter, sort, and export experiences in one page', async () => {
    const page = await source('../src/pages/SalesSourceManagement.jsx');

    expect(page).toContain("<TabsTrigger value=\"overview\">");
    expect(page).toContain("<TabsTrigger value=\"sources\">");
    expect(page).toContain("<TabsTrigger value=\"history\">");
    expect(page).toContain("<TabsTrigger value=\"analytics\">");
    expect(page).toContain("<TabsTrigger value=\"reconciliation\">");
    expect(page).toContain('setSelectedBranchId');
    expect(page).toContain('setRangePreset');
    expect(page).toContain('setQuery');
    expect(page).toContain('setStatus');
    expect(page).toContain('setSort');
    expect(page).toContain('downloadCSV');
    expect(page).toContain('downloadPDF');
    expect(page).toContain('ResponsiveContainer');
    expect(page).toContain('hasNextPage');
  });

  it('keeps configuration owner-only while allowing sales-authorized staff to view the central module', async () => {
    const [app, page] = await Promise.all([
      source('../src/App.jsx'),
      source('../src/pages/SalesSourceManagement.jsx'),
    ]);

    expect(app).toContain('path="/sales-sources" element={<RoleGuard permission="viewSales"><SalesSourceManagement /></RoleGuard>}');
    expect(app).toContain('path="/sales-closing-customization" element={<RoleGuard permission="manageSettings"><SalesClosingCustomization /></RoleGuard>}');
    expect(page).toContain('const canManage = canCustomize;');
    expect(page).toContain('{canManage && <Button');
    expect(page).toContain('canManage={canManage}');
  });

  it('keeps Customer Credit receivables in the server-side Closing transaction and preserves source-inclusive sales exports', async () => {
    const [sales, migration, exports] = await Promise.all([
      source('../src/pages/Sales.jsx'),
      source('../src/supabase/20260828_customer_credit_receivable_source_of_truth.sql'),
      source('../src/lib/exportUtils.js'),
    ]);

    expect(sales).not.toContain('autoSaveCreditDebts');
    expect(migration).toContain("'Credit sale from Sales Closing'");
    expect(migration).toContain('sales_closing_id, source_id');
    expect(migration).toContain("NULLIF(v_entry ->> 'source_id', '')::uuid");
    expect(exports).toContain('function salesSourceDailyTotal(record)');
    expect(exports).toContain("const sourceLabel = t('salesClosing.sources.title') || 'Sales Sources';");
    expect(exports).toContain('const sources = salesSourceDailyTotal(s);');
    expect(exports).toContain('const total = sCash + sNet + credit + sources;');
  });
});
