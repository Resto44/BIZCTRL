import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { normalizeSalesClosingField, salesClosingFieldKey } from '../src/lib/salesClosingCustomization';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Sales Closing Customization runtime contract', () => {
  it('derives a stable valid field key from the required English label when an operator leaves the optional key blank', () => {
    expect(salesClosingFieldKey('Delivery Reference #')).toBe('delivery_reference');
    expect(normalizeSalesClosingField({ label_en: 'Delivery Reference #' }).field_key).toBe('delivery_reference');
    expect(normalizeSalesClosingField({ field_key: 'Legacy Key', label_en: 'New Label' }).field_key).toBe('legacy_key');
  });

  it('registers one guarded canonical closing route, a separate centralized Sales Source Management route, and discoverable sales navigation', async () => {
    const [app, sidebar, management, sales] = await Promise.all([
      source('../src/App.jsx'),
      source('../src/components/layout/ERPSidebar.jsx'),
      source('../src/pages/SalesSourceManagement.jsx'),
      source('../src/pages/Sales.jsx'),
    ]);

    expect(app).toContain("const SalesClosingCustomization = lazy(() => import('@/pages/SalesClosingCustomization'));");
    expect(app).toContain("const SalesSourceManagement = lazy(() => import('@/pages/SalesSourceManagement'));");
    expect(app).toContain('path="/sales"');
    expect(app).toContain('path="/sales-closing-customization"');
    expect(app).toContain('path="/sales-sources" element={<RoleGuard permission="viewSales"><SalesSourceManagement /></RoleGuard>}');
    expect(app).toContain('path="/sales-source-management" element={<RoleGuard permission="viewSales"><SalesSourceManagement /></RoleGuard>}');
    expect(sidebar).toContain("path: '/sales-sources'");
    expect(sidebar).toContain("label: 'Sales Source Management'");
    expect(management).toContain('useSalesSourceManagement');
    expect(management).toContain('<SalesSourceDialog');
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

  it('preserves exact saved history snapshots and writes future operating results without recalculating historical records', async () => {
    const [workspace, presentation, card, migration] = await Promise.all([
      source('../src/components/sales/UnifiedSalesClosing.jsx'),
      source('../src/lib/dailySalesPresentation.js'),
      source('../src/components/sales/SalesListItem.jsx'),
      source('../src/supabase/20260825_daily_sales_closing_results.sql'),
    ]);

    expect(workspace).toContain('expenses_total: operatingExpensesTotal');
    expect(workspace).toContain('const totalDailyExpenses = approvedPurchasesTotal + operatingExpensesTotal;');
    expect(workspace).toContain('operating_result: operatingResult');
    expect(presentation).toContain('cashier_name: sale.cashier_name');
    expect(presentation).toContain('shift: sale.shift');
    expect(presentation).toContain('operating_result: sale.operating_result');
    expect(card).toContain('parseSalesSourceSnapshots');
    expect(card).toContain('Cashier:');
    expect(card).toContain('Shift:');
    expect(card).toContain('Operating result');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS expenses_total NUMERIC');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS operating_result NUMERIC');
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
    expect(workspace).toContain('paymentMethods={configuredPaymentMethods}');
    expect(workspace).toContain("field.visible_mobile === false ? 'hidden sm:grid'");
    expect(workspace).toContain("field.visible_desktop === false ? 'sm:hidden'");
    expect(workspace).toContain('nextErrors[`custom_${field.id}`]');
    expect(workspace).toContain('incompleteRequiredFields');
    expect(workspace).toContain('data-testid="closing-full-details"');
    expect(workspace).not.toContain('ClosingWorkflowStepper');
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
  it('keeps source and field dialogs in Owner customization instead of the daily closing flow', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');
    const page = await source('../src/pages/SalesClosingCustomization.jsx');
    const dialogs = await source('../src/components/sales/SalesClosingCustomizationDialogs.jsx');

    expect(workspace).not.toContain("from '@/components/sales/SalesClosingCustomizationDialogs'");
    expect(page).toContain("from '@/components/sales/SalesClosingCustomizationDialogs'");
    expect(dialogs).toContain("t('salesClosing.dialog.descriptionOptional')");
    expect(dialogs).toContain("t('salesClosing.dialog.helpTextOptional')");
  });

  it('lets owners design unlimited Sales Sources with persistent icon, color, branch, payment, and accounting behavior', async () => {
    const [dialogs, appearance, context, workspace] = await Promise.all([
      source('../src/components/sales/SalesClosingCustomizationDialogs.jsx'),
      source('../src/lib/salesSourceAppearance.jsx'),
      source('../src/lib/SalesClosingCustomizationContext.jsx'),
      source('../src/components/sales/UnifiedSalesClosing.jsx'),
    ]);

    expect(dialogs).toContain('SALES_SOURCE_ICON_OPTIONS');
    expect(dialogs).toContain('SALES_SOURCE_COLOR_OPTIONS');
    expect(dialogs).toContain('branch_ids');
    expect(dialogs).toContain('default_payment_method');
    expect(dialogs).toContain('included_in_profit_calc');
    expect(dialogs).toContain('requires_pos_device');
    expect(dialogs).toContain('requires_wallet');
    expect(appearance).toContain("{ value: 'Truck', label: 'Delivery'");
    expect(appearance).toContain("{ value: 'violet', label: 'Violet'");
    expect(context).toContain("supabase.from('sales_sources').insert(payload)");
    expect(workspace).toContain('salesSourceIconFor(source.icon)');
    expect(workspace).toContain('salesSourceToneFor(source.color)');
  });

  it('centralizes source and field administration outside the quick daily closing flow', async () => {
    const context = await source('../src/lib/SalesClosingCustomizationContext.jsx');
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(context).toContain('saveSalesSource');
    expect(context).toContain('saveClosingField');
    expect(context).toContain("queryClient.invalidateQueries({ queryKey: ['sales_sources_active', restaurantId], refetchType: 'none' });");
    expect(context).not.toContain("queryClient.setQueriesData({ queryKey: ['sales_sources_active', restaurantId] }, merge);");
    expect(workspace).not.toContain('salesClosingWorkspaceCopy.addSource');
    expect(workspace).not.toContain('salesClosingWorkspaceCopy.addField');
    expect(workspace).not.toContain("navigate('/sales-closing-customization')");
    expect(workspace).toContain('Manual sales sources');
    expect(workspace).toContain('Closing fields');
  });

  it('persists and renders optional field help text without changing historical closing snapshots', async () => {
    const migration = await source('../src/supabase/20260825_sales_closing_field_help_text.sql');
    const context = await source('../src/lib/SalesClosingCustomizationContext.jsx');
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS help_text text');
    expect(context).toContain('label_ar, help_text, field_type');
    expect(workspace).toContain('field.help_text');
    expect(workspace).toContain('sales_sources_json: [');
    expect(workspace).toContain('buildSalesSourceClosingSnapshots(customSourceSummaries');
    expect(workspace).toContain('customerCreditSourceSnapshot');
    expect(workspace).toContain('field_id: field.id');
  });
});
