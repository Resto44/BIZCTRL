import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  getProductCustomFields,
  mergeWorkspaceCustomization,
  normalizeWorkspaceCustomization,
} from '../src/lib/workspaceCustomization.js';

const customizationPage = new URL('../src/pages/CustomizeWorkspace.jsx', import.meta.url);
const masterForm = new URL('../src/components/products/ProductMasterForm.jsx', import.meta.url);
const productsPage = new URL('../src/pages/Products.jsx', import.meta.url);
const migration = new URL('../src/supabase/20260823_product_custom_fields_runtime.sql', import.meta.url);

describe('Product Custom Fields runtime', () => {
  const supplierCode = { id: 'supplier_code', label: 'Supplier Code', type: 'text', active: true, visible: true, required: false, order: 0 };

  it('normalizes tenant-scoped field definitions and hides inactive or invisible fields from the product form', () => {
    const config = normalizeWorkspaceCustomization({
      fields: { products: [supplierCode, { id: 'legacy', label: 'Legacy', type: 'text', active: false }, { id: 'internal', label: 'Internal', type: 'text', visible: false }] },
    });
    expect(config.fields.products).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'supplier_code', active: true, visible: true })]));
    expect(getProductCustomFields(config).map((field) => field.id)).toEqual(['supplier_code']);
  });

  it('retains standard-field visibility and custom-field configuration in one tenant-specific workspace patch', () => {
    const next = mergeWorkspaceCustomization({}, {
      forms: { products: { hidden_fields: ['sku'] } },
      fields: { products: [supplierCode] },
    });
    expect(next.forms.products.hidden_fields).toEqual(['sku']);
    expect(next.fields.products).toEqual([expect.objectContaining({ id: 'supplier_code' })]);
  });

  it('provides a modal editor with per-field persistence, validation, safe deletion, and mobile-safe scrolling', async () => {
    const page = await readFile(customizationPage, 'utf8');
    expect(page).toContain('Add product custom field');
    expect(page).toContain('DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg"');
    expect(page).toContain('Field name');
    expect(page).toContain('Display order');
    expect(page).toContain("['select', 'multiselect'].includes(editor.field.type)");
    expect(page).toContain('Dropdown fields require at least one option.');
    expect(page).toContain('Field name must be unique within this organization.');
    expect(page).toContain('Existing product values are retained and are not deleted.');
    expect(page).toContain("await savePatch({ fields: { products: normalizedFields } })");
    expect(page).toContain("await savePatch({ forms: { products: nextSettings } })");
    expect(page).toContain("console.error('Product custom field save failed'");
  });

  it('renders dropdown fields and persists custom_attributes through every active product form route', async () => {
    const [form, products] = await Promise.all([readFile(masterForm, 'utf8'), readFile(productsPage, 'utf8')]);
    expect(form).toContain("if (field.type === 'select')");
    expect(form).toContain('custom_attributes: customAttributes');
    expect(form).toContain("field.type === 'boolean' && customAttributes[field.id] === undefined");
    expect(form).toContain('setCustomAttribute(field.id, value)');
    expect(products).toContain("import ProductMasterForm from '@/components/products/ProductMasterForm'");
    expect(products).toContain('<ProductMasterForm onSubmit={handleSave}');
  });

  it('validates definitions and product values server-side through the existing tenant-scoped organization settings and products columns', async () => {
    const sql = await readFile(migration, 'utf8');
    expect(sql).toContain('erp_validate_product_custom_fields');
    expect(sql).toContain('erp_update_workspace_customization');
    expect(sql).toContain('erp_can_manage_workspace_customization');
    expect(sql).toContain('PRODUCT_CUSTOM_FIELD_DUPLICATE');
    expect(sql).toContain('PRODUCT_CUSTOM_FIELD_OPTIONS_REQUIRED');
    expect(sql).toContain('PRODUCT_CUSTOM_ATTRIBUTE_REQUIRED');
    expect(sql).toContain('CREATE TRIGGER products_validate_custom_attributes');
    expect(sql).toContain('NEW.restaurant_id');
    expect(sql).not.toContain('CREATE TABLE public.product_custom_fields');
  });
});
