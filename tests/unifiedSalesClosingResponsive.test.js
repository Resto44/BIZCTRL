import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Unified Sales Closing workflow contract', () => {
  it('uses one compact, continuous mobile-first closing workflow instead of the former nine-step form', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('Daily Sales Closing');
    expect(workspace).toContain("data-testid=\"quick-closing-auto-summary\"");
    expect(workspace).toContain('Daily Closing Summary');
    expect(workspace).toContain('touch-pan-y overflow-y-auto overscroll-contain');
    expect(workspace).toContain('grid grid-cols-1 gap-3 lg:grid-cols-2');
    expect(workspace).toContain('pb-[calc(env(safe-area-inset-bottom)+6.5rem)]');
    expect(workspace).toContain('env(safe-area-inset-bottom)+0.75rem');
    expect(workspace).not.toContain('100vw');
  });

  it('defaults every role to the streamlined Quick Closing view and does not mask the authenticated operator behind a pending employee query', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain("const [closingView, setClosingView] = useState('quick');");
    expect(workspace).toContain("cashierDisplayName || (empLoading ? 'Loading…' : empError ? 'Unable to load cashier' : 'No cashier')");
  });

  it('loads existing sales, POS and cash-register data automatically in restaurant, branch and date scope', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('queryKey: [\'quick_closing_automatic_sources\'');
    expect(workspace).toContain("from('daily_cash_settlements')");
    expect(workspace).toContain("scoped('payments'");
    expect(workspace).toContain("from('pos_reconciliation')");
    expect(workspace).toContain(".eq('restaurant_id', activeRestaurant.id)");
    expect(workspace).toContain(".eq('branch_id', selectedBranchId)");
    expect(workspace).toContain(".eq('date', form.date)");
    expect(workspace).toContain('Record sales at POS first.');
    expect(workspace).toContain('Exceptional Cash Adjustment');
  });

  it('calculates total sales, cash reconciliation, purchases, expenses and operating result automatically', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('cashSales + networkTotal + creditTotal + otherPaymentTotal');
    expect(workspace).toContain('actualCount - expectedCash');
    expect(workspace).toContain('totalSales - approvedPurchasesTotal - expensesTotal');
    expect(workspace).toContain('expected_closing_cash');
    expect(workspace).toContain('Actual Cash');
    expect(workspace).toContain('Cash balanced.');
  });

  it('keeps global sales sources visible under a selected branch and maps configured source methods into canonical totals', async () => {
    const sourceHook = await source('../src/hooks/useSalesSources.js');
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(sourceHook).toContain("queryKey: ['sales_sources_active', activeRestaurantId, effectiveBranchId || 'all']");
    expect(sourceHook).toContain("base44.entities.SalesSource.filter({ restaurant_id: activeRestaurantId }, 'sort_order', 200)");
    expect(sourceHook).toContain('if (s.is_global || !s.branch_id) return true;');
    expect(workspace).toContain('paymentBucketForCode(source.default_payment_method)');
    expect(workspace).toContain('const customSourcePaymentTotals = useMemo(() =>');
    expect(workspace).toContain('const cashSales = baseCashSales + customSourcePaymentTotals.cash;');
    expect(workspace).toContain('const networkTotal = baseNetworkTotal + customSourcePaymentTotals.network;');
    expect(workspace).toContain('const creditTotal = baseCreditTotal + customSourcePaymentTotals.credit;');
    expect(workspace).toContain('const otherPaymentTotal = baseOtherPaymentTotal + customSourcePaymentTotals.other;');
    expect(workspace).toContain('default_payment_method: src.default_payment_method || \'other\'');
    expect(workspace).toContain('payment_bucket: paymentBucketForCode(src.default_payment_method)');
    expect(workspace).toContain('const expectedCashBase = useAutomaticSales && automaticClosingSnapshot.expectedCash !== null');
    expect(workspace).toContain('const expectedCash = expectedCashBase + customSourcePaymentTotals.cash;');
  });

  it('keeps a successful Owner source mutation visible in every active branch cache until explicit reload', async () => {
    const context = await source('../src/lib/SalesClosingCustomizationContext.jsx');
    const customization = await source('../src/pages/SalesClosingCustomization.jsx');

    expect(context).toContain("const sourceQueryKey = useMemo(() => ['sales_sources_active', restaurantId]");
    expect(context).toContain('const sourcePatchesRef = useRef(new Map());');
    expect(context).toContain('previous.map((item) => item.id === savedSource.id ? { ...item, ...savedSource } : item)');
    expect(context).toContain('sourcePatchesRef.current.set(savedSource.id, savedSource);');
    expect(context).toContain("queryClient.setQueriesData({ queryKey: ['sales_sources_active', restaurantId] }, merge);");
    expect(context).toContain("queryClient.invalidateQueries({ queryKey: sourceQueryKey, refetchType: 'none' });");
    expect(context).toContain('saveSalesSource: (source) => saveSourceMutation.mutateAsync(source)');
    expect(context).toContain('deleteSalesSource: (source) => deleteSourceMutation.mutateAsync(source)');
    expect(context).toContain('const { id: fieldId, ...fieldPayload } = field;');
    expect(context).toContain("if (fieldId) {");
    expect(customization).toContain('onSave={saveSource}');
    expect(customization).toContain('onSave={(field) => saveField(field)}');
    expect(customization).toContain("if (resource === 'source') {");
    expect(customization).toContain('await saveSalesSource({ ...current, sort_order: other.sort_order });');
    expect(customization).toContain('await saveSalesSource({ ...other, sort_order: current.sort_order });');
    expect(customization).toContain('onClick={reload}');
  });

  it('consumes saved calculation, reconciliation, and responsive-summary settings in the canonical workflow', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('const automaticTotalsEnabled = closingConfig?.calculations?.automatic_totals !== false;');
    expect(workspace).toContain('const requiresCashReconciliation = closingConfig?.validation_rules?.require_cash_reconciliation !== false;');
    expect(workspace).toContain('const summaryVisibilityClass = !showMobileSummary && !showDesktopSummary');
    expect(workspace).toContain('const automaticClosingEnabled = Boolean(automaticTotalsEnabled');
    expect(workspace).toContain('const useAutomaticSales = Boolean(automaticTotalsEnabled');
    expect(workspace).toContain('!requiresCashReconciliation || (actualCount !== null');
    expect(workspace).toContain('requiresCashReconciliation && actualCount === null');
    expect(workspace).toContain('className={summaryVisibilityClass}');
  });

  it('renders configured identity fields in their saved order while retaining the canonical controls', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('const IDENTITY_FIELD_DEFAULTS = [');
    expect(workspace).toContain('const configuredIdentityFields = useMemo(() => IDENTITY_FIELD_DEFAULTS');
    expect(workspace).toContain("configuredIdentityFields.map((field) => {");
    expect(workspace).toContain("if (fieldKey === 'branch')");
    expect(workspace).toContain("if (fieldKey === 'date')");
    expect(workspace).toContain("if (fieldKey === 'shift')");
  });

  it('uses accessible numeric inputs, stable currency presentation and a non-obstructive sticky action area', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('inputMode="decimal"');
    expect(workspace).toContain('dir="ltr"');
    expect(workspace).toContain('tabular-nums');
    expect(workspace).toContain('whitespace-nowrap');
    expect(workspace).toContain('className="border-t border-border bg-background/95');
    expect(workspace).toContain('Save Draft');
    expect(workspace).toContain('Finalize Closing');
  });

  it('preserves scoped purchase and expense loading, inline validation, and duplicate-closing protection', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');
    const sales = await source('../src/pages/Sales.jsx');

    expect(workspace).toContain("queryKey: ['approved_purchases_for_date'");
    expect(workspace).toContain("queryKey: ['closing_expenses_for_date'");
    expect(workspace).toContain(".from('expenses')");
    expect(workspace).toContain("nextErrors.actualCash = 'Actual Cash is required.'");
    expect(workspace).toContain('focusField(firstError)');
    expect(workspace).toContain('Closing already completed for this branch and shift.');
    expect(sales).toContain(".eq('restaurant_id', data.restaurant_id)");
    expect(sales).toContain(".eq('date', data.date)");
    expect(sales).toContain(".eq('shift', data.shift)");
    expect(sales).toContain('_alreadyExists: true');
  });

  it('clears automatic totals when the closing scope changes and blocks a save when ERP source reads fail', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('const automaticClosingScope = [');
    expect(workspace).toContain('previous.scope !== automaticClosingScope');
    expect(workspace).toContain('const snapshotMatchesScope = automaticClosingSnapshot.scope === automaticClosingScope');
    expect(workspace).toContain('const queryError = [settlementResults, paymentResults, posResults, creditResults]');
    expect(workspace).toContain('if (queryError) throw queryError;');
    expect(workspace).toContain('automaticClosingUnavailable');
    expect(workspace).toContain('Retry ERP data load');
    expect(workspace).toContain('disabled={isSubmitting || purchasesLoading || expensesLoading || autoSourceLoading || automaticClosingUnavailable || !allValid}');
  });

  it('persists Drafts without producing invoice, wallet, settlement, debt, or notification side effects before Finalize', async () => {
    const sales = await source('../src/pages/Sales.jsx');

    expect(sales).toContain("const shouldRunFinalizationSideEffects = (saleData) => saleData?.closing_state === 'finalized';");
    expect((sales.match(/if \(shouldRunFinalizationSideEffects\(data\)\)/g) || []).length).toBe(2);
    expect(sales).toContain('Draft saved without finalized financial side-effects.');

    const createGuard = sales.indexOf('if (shouldRunFinalizationSideEffects(data))');
    const createInvoice = sales.indexOf('await createSalesInvoice');
    const createWallet = sales.indexOf('await autoWalletTx(data, saleId)');
    const createSettlement = sales.indexOf('await autoSettle(data, saleId');
    const createDebt = sales.indexOf('await autoSaveCreditDebts(data, saleId)');
    expect(createGuard).toBeGreaterThan(-1);
    expect(createInvoice).toBeGreaterThan(createGuard);
    expect(createWallet).toBeGreaterThan(createGuard);
    expect(createSettlement).toBeGreaterThan(createGuard);
    expect(createDebt).toBeGreaterThan(createGuard);

    const updateGuard = sales.indexOf('if (shouldRunFinalizationSideEffects(data))', createGuard + 1);
    const updateWallet = sales.indexOf('await autoWalletTx(data, id, prev)');
    const updateSettlement = sales.indexOf('await autoSettle(data, id');
    const updateDebt = sales.indexOf('await autoSaveCreditDebts(data, id)');
    expect(updateGuard).toBeGreaterThan(createGuard);
    expect(updateWallet).toBeGreaterThan(updateGuard);
    expect(updateSettlement).toBeGreaterThan(updateGuard);
    expect(updateDebt).toBeGreaterThan(updateGuard);
  });

  it('keeps finalized invoice totals aligned with the canonical Other payment total', async () => {
    const migration = await source('../src/supabase/20260824_sales_invoice_other_sales_alignment.sql');

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS other_sales NUMERIC NOT NULL DEFAULT 0');
    expect(migration).toContain('v_other_sales   := COALESCE(NEW.custom_sources_total, 0);');
    expect(migration).toContain('v_sales_total   := v_cash_sales + v_network_sales + v_credit_sales + v_other_sales;');
    expect(migration).toContain('cash_sales, network_sales, credit_sales, other_sales, sales_total');
    expect(migration).toContain('other_sales         = EXCLUDED.other_sales');
  });

  it('enforces the same Draft boundary in database triggers so server-side invoice and cash effects wait for Finalize', async () => {
    const migration = await source('../src/supabase/20260824_draft_finalization_side_effect_guards.sql');

    expect(migration).toContain("WHEN (COALESCE(NEW.closing_state, 'finalized') = 'finalized')");
    expect(migration).toContain('EXECUTE FUNCTION public.fn_daily_sales_generate_invoice_number();');
    expect(migration).toContain('EXECUTE FUNCTION public.fn_daily_sales_sync_invoice();');
    expect(migration).toContain('EXECUTE FUNCTION public.trg_auto_cash_movement_and_recalculate();');
    expect(migration).toContain("AND OLD.closing_state = 'finalized'");
    expect(migration).toContain("AND NEW.closing_state = 'draft' THEN");
    expect(migration).toContain('DAILY_SALES_CLOSING_FINALIZATION_REVERT_DENIED');
    expect(migration).toContain("NULLIF(OLD.restaurant_id, '')::uuid");
    expect(migration).toContain("NULLIF(NEW.restaurant_id, '')::uuid");
  });
});
