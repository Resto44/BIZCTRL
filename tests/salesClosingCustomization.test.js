import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Sales Closing Customization runtime contract', () => {
  it('registers one guarded canonical closing route, a customization route, and visible owner navigation entries', async () => {
    const app = await source('../src/App.jsx');
    const settings = await source('../src/pages/SettingsPage.jsx');
    const dashboard = await source('../src/pages/OwnerDashboard.jsx');
    const sales = await source('../src/pages/Sales.jsx');

    expect(app).toContain("const SalesClosingCustomization = lazy(() => import('@/pages/SalesClosingCustomization'));");
    expect(app).toContain('path="/sales"');
    expect(app).toContain('path="/sales-closing-customization"');
    expect(app).toContain('path="/sales-sources" element={<Navigate to="/sales-closing-customization" replace />}');
    expect(app).toContain('permission="manageSettings"');
    expect(settings).toContain("path: '/sales-closing-customization'");
    expect(settings).toContain("label: 'Sales Closing Customization'");
    expect(dashboard).toContain("navigate('/sales-closing-customization')");
    expect(sales).toContain("import UnifiedSalesClosing from '@/components/sales/UnifiedSalesClosing';");
    expect(sales).toContain('aria-label="Sales Closing"');
    expect(sales).not.toContain('<Dialog open={showForm}');
    expect(sales).not.toContain('Enterprise Sales Closing Workspace');
  });

  it('keeps configuration tenant-scoped and reloads persisted Supabase state', async () => {
    const context = await source('../src/lib/SalesClosingCustomizationContext.jsx');
    const migration = await source('../src/supabase/20260824_sales_closing_customization.sql');

    expect(context).toContain("from('sales_closing_config')");
    expect(context).toContain("from('sales_closing_fields')");
    expect(context).toContain("from('payment_methods')");
    expect(context).toContain("filter: `restaurant_id=eq.${restaurantId}`");
    expect(context).toContain("onConflict: 'restaurant_id'");
    expect(context).toContain('await Promise.all([configQuery.refetch(), fieldsQuery.refetch(), paymentMethodsQuery.refetch(), sourceQuery.refetch()]);');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.payment_methods');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.sales_closing_fields');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.sales_closing_config');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('erp_can_manage_workspace_customization(restaurant_id)');
  });

  it('protects historical closing data while allowing future configuration changes', async () => {
    const migration = await source('../src/supabase/20260824_sales_closing_customization.sql');
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(migration).toContain('erp_prevent_used_sales_source_delete');
    expect(migration).toContain("RAISE EXCEPTION 'SALES_SOURCE_IN_USE'");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS sales_closing_custom_fields jsonb');
    expect(workspace).toContain('sales_closing_custom_fields: customClosingFields');
    expect(workspace).toContain('field_id: field.id');
    expect(workspace).toContain('customSources.length > 0');
  });

  it('renders dynamic fields, active sources, payment methods, responsive visibility, and required-field validation in new closings', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');
    const page = await source('../src/pages/SalesClosingCustomization.jsx');

    expect(workspace).toContain('useSalesClosingCustomization()');
    expect(workspace).toContain('configuredPaymentMethods.filter((method) => method.is_active !== false)');
    expect(workspace).toContain("field.visible_mobile === false ? 'hidden sm:block'");
    expect(workspace).toContain("field.visible_desktop === false ? 'sm:hidden'");
    expect(workspace).toContain('nextErrors[`custom_${field.id}`]');
    expect(workspace).toContain('Owner-configured fields apply to this new closing.');
    expect(workspace).toContain('Quick Closing');
    expect(workspace).toContain('Advanced Closing');
    expect(workspace).toContain("closing_state: requestedClosingState");
    expect(workspace).toContain('Save Draft');
    expect(workspace).toContain('Finalize Closing');
    expect(workspace).toContain('closing_audit:');
    expect(page).toContain('Manage Sales Sources');
    expect(page).toContain('Manage Payment Methods');
    expect(page).toContain('Preview Sales Closing');
    expect(page).toContain('Sales Closing configuration saved successfully.');
    expect(page).toContain('pb-28');
  });
});


describe('Sales Closing in-workspace runtime customization contract', () => {
  it('reuses the shared source and field dialogs from both canonical entry points', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');
    const page = await source('../src/pages/SalesClosingCustomization.jsx');
    const dialogs = await source('../src/components/sales/SalesClosingCustomizationDialogs.jsx');

    expect(workspace).toContain("from '@/components/sales/SalesClosingCustomizationDialogs'");
    expect(page).toContain("from '@/components/sales/SalesClosingCustomizationDialogs'");
    expect(dialogs).toContain('Description (optional)');
    expect(dialogs).toContain('Help text (optional)');
  });

  it('adds sources and fields in place, updates the canonical cache, and links to the existing customization route', async () => {
    const context = await source('../src/lib/SalesClosingCustomizationContext.jsx');
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(context).toContain('saveSalesSource');
    expect(context).toContain('saveClosingField');
    expect(context).toContain("queryClient.setQueriesData({ queryKey: ['sales_sources_active', restaurantId] }");
    expect(workspace).toContain('+ Add Sales Source');
    expect(workspace).toContain('+ Add Closing Field');
    expect(workspace).toContain('Customize Sales Closing');
    expect(workspace).toContain("navigate('/sales-closing-customization')");
    expect(workspace).toContain('Sales source saved and is ready to use.');
    expect(workspace).toContain('Closing field saved and is ready to use.');
  });

  it('persists and renders optional field help text without changing historical closing snapshots', async () => {
    const migration = await source('../src/supabase/20260825_sales_closing_field_help_text.sql');
    const context = await source('../src/lib/SalesClosingCustomizationContext.jsx');
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS help_text text');
    expect(context).toContain('label_ar, help_text, field_type');
    expect(workspace).toContain('field.help_text');
    expect(workspace).toContain('sales_sources_json: JSON.stringify');
    expect(workspace).toContain('field_id: field.id');
  });
});
