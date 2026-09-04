import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isSupermarketProductPortal, resolveProductImportPortal } from '../src/lib/productImportAccess';

const migration = readFileSync(new URL('../src/supabase/20260902_scalable_product_master_catalog.sql', import.meta.url), 'utf8');
const catalogUi = readFileSync(new URL('../src/components/products/EnterpriseProductCatalog.jsx', import.meta.url), 'utf8');
const importUi = readFileSync(new URL('../src/components/products/ProductBulkImportDialog.jsx', import.meta.url), 'utf8');
const workspaceUi = readFileSync(new URL('../src/components/products/ProductMasterWorkspace.jsx', import.meta.url), 'utf8');
const productManagementUi = readFileSync(new URL('../src/pages/ProductManagement.jsx', import.meta.url), 'utf8');
const repository = readFileSync(new URL('../src/lib/productCatalogRepository.js', import.meta.url), 'utf8');
const supermarketBoundary = readFileSync(new URL('../src/supabase/20260904_supermarket_product_import_boundary.sql', import.meta.url), 'utf8');

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

  it('shows product spreadsheet import only in the Supermarket/Retail portal', () => {
    expect(isSupermarketProductPortal({ business_type: 'retail' })).toBe(true);
    expect(isSupermarketProductPortal({ business_type: 'supermarket' })).toBe(true);
    expect(isSupermarketProductPortal({ business_type: '', business_mode: 'retail' })).toBe(true);
    expect(isSupermarketProductPortal({ business_type: 'restaurant', business_mode: 'retail' })).toBe(false);
    expect(isSupermarketProductPortal({ business_type: 'pharmacy' })).toBe(false);
    expect(isSupermarketProductPortal({ business_type: 'wholesale' })).toBe(false);
    expect(resolveProductImportPortal({ business_type: ' Restaurant ' })).toBe('restaurant');

    expect(productManagementUi).toContain('isSupermarketProductPortal(activeRestaurant)');
    expect(productManagementUi).toContain('canDeleteProducts = canImportProductSpreadsheet && role === ROLES.OWNER');
    expect(workspaceUi).toContain("...(canImportProductSpreadsheet ? [[Import, 'Import Excel', onImport]] : [])");
    expect(catalogUi).toContain('canImportProductSpreadsheet ? <ProductBulkImportDialog');
    expect(catalogUi).toContain('canDeleteProducts ? <Button');
    expect(importUi).toContain('if (!isAllowed) return null;');
  });

  it('rejects direct spreadsheet imports outside the Supermarket portal', () => {
    expect(supermarketBoundary).toContain('erp_is_supermarket_product_portal');
    expect(supermarketBoundary).toContain("IN ('retail', 'supermarket')");
    expect(supermarketBoundary).toContain('Product spreadsheet import is available only in the Supermarket portal');
    expect(supermarketBoundary).toContain('CREATE OR REPLACE FUNCTION public.erp_validate_product_import_job_scope()');
    expect(supermarketBoundary).toContain('CREATE OR REPLACE FUNCTION public.erp_bulk_upsert_master_products(');
    expect(supermarketBoundary).toContain('WHERE branch.id = p_branch_id AND branch.restaurant_id = p_restaurant_id');
  });
});
