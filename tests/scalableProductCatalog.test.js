import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../src/supabase/20260902_scalable_product_master_catalog.sql', import.meta.url), 'utf8');
const catalogUi = readFileSync(new URL('../src/components/products/EnterpriseProductCatalog.jsx', import.meta.url), 'utf8');
const importUi = readFileSync(new URL('../src/components/products/ProductBulkImportDialog.jsx', import.meta.url), 'utf8');
const repository = readFileSync(new URL('../src/lib/productCatalogRepository.js', import.meta.url), 'utf8');

describe('scalable Product Master Catalog contract', () => {
  it('uses a tenant master plus a normalized branch assortment instead of copying products', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.branch_product_assortments');
    expect(migration).toContain('CONSTRAINT uq_branch_product_assortment UNIQUE (restaurant_id, branch_id, product_id)');
    expect(migration).toContain('tenant/product mismatch');
    expect(migration).toContain('tenant/branch mismatch');
    expect(migration).toContain('inventory quantity stays in the inventory ledger');
  });

  it('protects new tables with RLS, scoped policies, and authenticated-only RPC grants', () => {
    expect(migration).toContain('ALTER TABLE public.branch_product_assortments ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE public.product_import_jobs ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain("erp_can_write_module_scope_text(restaurant_id::text, branch_id::text, 'updateInventory')");
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.erp_bulk_upsert_master_products');
    expect(migration).toContain('TO authenticated');
  });

  it('provides indexed server pagination and bounded import batches for 100k catalogs', () => {
    expect(migration).toContain('idx_products_master_name_trgm');
    expect(migration).toContain('count(*) OVER ()');
    expect(migration).toContain('LIMIT v_page_size');
    expect(migration).toContain('Import chunks may contain at most 1000 rows');
    expect(repository).toContain('PRODUCT_IMPORT_CHUNK_SIZE');
    expect(repository).toContain("supabase.rpc('erp_search_master_products'");
  });

  it('exposes responsive branch selection, Excel preview, validation and error reporting', () => {
    expect(catalogUi).toContain('Organization Master Catalog');
    expect(catalogUi).toContain('Add to {selectedBranch.name');
    expect(catalogUi).toContain('md:hidden');
    expect(catalogUi).toContain('overflow-x-auto');
    expect(importUi).toContain('Enterprise Product Import');
    expect(importUi).toContain('Download Excel Template');
    expect(importUi).toContain('Validated preview');
    expect(importUi).toContain('Error report');
  });
});
