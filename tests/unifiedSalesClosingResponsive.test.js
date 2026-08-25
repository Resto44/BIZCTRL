import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import translations from '../src/lib/i18n';

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

  it('keeps globally available and multi-branch Sales Sources visible under a selected branch while mapping only Today amounts into canonical totals', async () => {
    const [sourceHook, workspace, context] = await Promise.all([
      source('../src/hooks/useSalesSources.js'),
      source('../src/components/sales/UnifiedSalesClosing.jsx'),
      source('../src/lib/SalesClosingCustomizationContext.jsx'),
    ]);

    expect(sourceHook).toContain('useSalesClosingCustomization()');
    expect(sourceHook).toContain('source?.is_global || (!source?.branch_id && !asRecordArray(source?.branch_ids).length)');
    expect(sourceHook).toContain('canonicalIds.includes(String(branchId))');
    expect(sourceHook).toContain('String(source.branch_id) === String(branchId)');
    expect(context).toContain("const sourceQueryKey = useMemo(() => ['sales_sources_active', restaurantId]");
    expect(workspace).toContain('paymentBucketForCode(source.default_payment_method)');
    expect(workspace).toContain('const customSourcePaymentTotals = useMemo(() =>');
    expect(workspace).toContain('const cashSales = baseCashSales + customSourcePaymentTotals.cash;');
    expect(workspace).toContain('const networkTotal = baseNetworkTotal + customSourcePaymentTotals.network;');
    expect(workspace).toContain('const creditTotal = baseCreditTotal + customSourcePaymentTotals.credit;');
    expect(workspace).toContain('const otherPaymentTotal = baseOtherPaymentTotal + customSourcePaymentTotals.other;');
    expect(workspace).toContain('buildSalesSourceClosingSnapshots(customSourceSummaries');
    expect(workspace).toContain('payment_bucket: paymentBucketForCode(snapshot.default_payment_method)');
    expect(workspace).toContain('salesSourceTodayTotal(customSourceSummaries)');
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
    expect(sales).toContain(".eq('date', session.date)");
    expect(sales).toContain(".eq('shift', session.shift)");
    expect(sales).toContain('return updateMut.mutateAsync({ id: existing.id, data, prev: existing, proofUrl, ocr });');
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

  it('keeps Quick and Advanced as in-place presentation modes of the same closing session and makes New Closing idempotent by its business key', async () => {
    const [workspace, sales, migration] = await Promise.all([
      source('../src/components/sales/UnifiedSalesClosing.jsx'),
      source('../src/pages/Sales.jsx'),
      source('../src/supabase/20260825_daily_sales_closing_session_idempotency.sql'),
    ]);

    expect(workspace).toContain("const [closingView, setClosingView] = useState('quick');");
    expect(workspace).toContain('aria-pressed={isQuickClosing}');
    expect(workspace).toContain('aria-pressed={!isQuickClosing}');
    expect(workspace).toContain('onSessionContextChange?.({');
    expect(workspace).toContain('isOpeningNewClosing = false');
    expect(workspace).not.toContain("key={editing?.id || 'new-closing'}");

    expect(sales).toContain('const matchesSalesClosingSession = (record, session) => {');
    expect(sales).toContain('const findExistingClosingSession = useCallback(async (session) => {');
    expect(sales).toContain('const openNewClosing = useCallback(async () => {');
    expect(sales).toContain('Resumed the existing draft closing');
    expect(sales).toContain('No record is created until you save it.');
    expect(sales).toContain('key={editing?.id || `new-closing-${newClosingInstance}`}');
    expect(sales).toContain('matchesSalesClosingSession(record, session)');
    expect(sales).toContain('disabled={isOpeningNewClosing}');

    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS daily_sales_unique_closing_session_idx');
    expect(migration).toContain("COALESCE(branch_id::text, 'legacy:' || lower(btrim(branch)))");
    expect(migration).toContain("COALESCE(cashier_id::text, 'legacy:' || lower(btrim(cashier_name)))");
    expect(migration).toContain('Prevents duplicate Sales Closing sessions by restaurant, branch, date, shift, and cashier');
  });

  it('resumes the matching Draft and opens every existing closing through the normal editable workflow', async () => {
    const sales = await source('../src/pages/Sales.jsx');

    expect(sales).toContain('const findExistingClosingSession = useCallback(async (session) => {');
    expect(sales).toContain('if (existing) {');
    expect(sales).toContain('Draft already exists for this branch, date, shift, and cashier. Resumed the existing draft closing.');
    expect(sales).toContain('Existing closing opened for normal editing. Save Draft or Finalize Closing when ready.');
    expect(sales).toContain('setEditing(existing);');
    expect(sales).toContain('return updateMut.mutateAsync({ id: existing.id, data, prev: existing, proofUrl, ocr });');
    expect(sales).not.toContain('business period is already locked');
    expect(sales).not.toContain('authorized correction');
  });

  it('renders editable Save Draft and Finalize controls for Draft, Finalized, and legacy locked records', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('Save Draft');
    expect(workspace).toContain('Finalize Closing');
    expect(workspace).toContain("setRequestedClosingState('draft')");
    expect(workspace).toContain("setRequestedClosingState('finalized')");
    expect(workspace).not.toContain('isProtectedClosing');
    expect(workspace).not.toContain('Request Correction');
    expect(workspace).not.toContain('pointer-events-none select-none opacity-80');
    expect(workspace).not.toContain("setRequestedClosingState('locked')");
  });

  it('removes lock enforcement and correction-only RPC access at the database boundary while retaining the session uniqueness index', async () => {
    const [migration, sessionMigration] = await Promise.all([
      source('../src/supabase/20260825_remove_sales_closing_locks.sql'),
      source('../src/supabase/20260825_daily_sales_closing_session_idempotency.sql'),
    ]);

    expect(migration).toContain('DROP TRIGGER IF EXISTS erp_guard_daily_sales_closing_lifecycle ON public.daily_sales');
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.request_daily_sales_closing_correction(uuid)');
    expect(migration).toContain('cashier_id');
    expect(migration).not.toContain('DAILY_SALES_CLOSING_LOCKED');
    expect(sessionMigration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS daily_sales_unique_closing_session_idx');
    expect(sessionMigration).toContain("COALESCE(cashier_id::text, 'legacy:' || lower(btrim(cashier_name)))");
  });

  it('enforces the same Draft boundary in database triggers so server-side invoice and cash effects wait for Finalize', async () => {
    const migration = await source('../src/supabase/20260824_draft_finalization_side_effect_guards.sql');

    expect(migration).toContain("WHEN (COALESCE(NEW.closing_state, 'finalized') = 'finalized')");
    expect(migration).toContain('EXECUTE FUNCTION public.fn_daily_sales_generate_invoice_number();');
    expect(migration).toContain('EXECUTE FUNCTION public.fn_daily_sales_sync_invoice();');
    expect(migration).toContain('EXECUTE FUNCTION public.trg_auto_cash_movement_and_recalculate();');
    expect(migration).toContain("WHEN (COALESCE(NEW.closing_state, 'finalized') = 'finalized')");
  });
});


describe('Sales source daily and historical balance contract', () => {
  it('derives all prior source balances in one stable-ID aggregate that excludes drafts and the current closing date', async () => {
    const [workspace, migration] = await Promise.all([
      source('../src/components/sales/UnifiedSalesClosing.jsx'),
      source('../src/supabase/20260825_sales_source_previous_balances.sql'),
    ]);

    expect(workspace).toContain("queryKey: ['sales-source-previous-balances', activeRestaurant?.id, selectedBranchId, form.branch, form.date, initial?.id]");
    expect(workspace).toContain("supabase.rpc('get_sales_source_previous_balances'");
    expect(workspace).toContain('p_restaurant_id: activeRestaurant.id');
    expect(workspace).toContain('p_branch_id: selectedBranchId || null');
    expect(workspace).toContain('p_branch_key: form.branch || null');
    expect(workspace).toContain('p_before_date: form.date');
    expect(workspace).toContain('p_current_closing_id: initial?.id || null');
    expect(workspace).toContain('row.previous_amount');
    expect(workspace).toContain('historicalSourceAmounts[source.id] ?? 0');
    expect(workspace).toContain('total: previous + today');

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_sales_source_previous_balances');
    expect(migration).toContain('closing.restaurant_id = p_restaurant_id');
    expect(migration).toContain("closing.date < p_before_date");
    expect(migration).toContain("COALESCE(closing.closing_state, 'finalized') <> 'draft'");
    expect(migration).toContain('closing.branch_id = p_branch_id');
    expect(migration).toContain("entry.entry ->> 'source_id'");
    expect(migration).toContain('GROUP BY source_id');
    expect(migration).toContain('jsonb_typeof(p_snapshot) = \'string\'');
  });

  it('renders Today as the only editable source amount and keeps Previous and Total derived and read-only', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain("today: t('salesClosing.sources.today')");
    expect(workspace).toContain("previous: t('salesClosing.sources.previous')");
    expect(workspace).toContain("total: t('salesClosing.sources.total')");
    expect(workspace).toContain('label={copy.today}');
    expect(workspace).toContain('isHistoryLoading={sourceHistoryLoading}');
  });

  it('uses only the current daily amount in all today-total and persistence calculations', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('customSourceSummaries.reduce((totals, { source, today }) =>');
    expect(workspace).toContain('totals[paymentBucketForCode(source.default_payment_method)] += today;');
    expect(workspace).toContain('buildSalesSourceClosingSnapshots(customSourceSummaries');
    expect(workspace).toContain('Today values. Historical Previous values remain display/audit context.');
    expect(workspace).toContain('`amount` / `today_amount` are the only');
    expect(workspace).toContain('never added to current-period accounting.');
  });

  it('does not double-count saved cash-classified source amounts when a closing is reopened for review or finalization', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('const salesSourceAmountForBucket = (record, bucket) => parseSalesSourceEntries(record)');
    expect(workspace).toContain('entry?.payment_bucket || paymentBucketForCode(entry?.default_payment_method)');
    expect(workspace).toContain("salesSourceAmountForBucket(initial, 'cash')");
    expect(workspace).toContain('const baseCash = initial?.id');
    expect(workspace).toContain('Remove their saved daily snapshot before the live source');
    expect(workspace).toContain('const cashSales = baseCashSales + customSourcePaymentTotals.cash;');
  });

  it('keeps each Today input mounted and focused while its raw amount string changes', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('key={source.id}');
    expect(workspace).not.toContain('key={`${source.id}-${previous}-${today}-${lang}`}');
    expect(workspace).toContain("todayInput={customSourceAmounts[source.id] ?? ''}");
    expect(workspace).toContain('value={todayInput}');
    expect(workspace).toContain("onChange={onChange}");
    expect(workspace).toContain('const [customSourceAmounts, setCustomSourceAmounts] = useState(() => {');
    expect(workspace).toContain("inputMode=\"decimal\"");
  });
});


describe('Sales Closing localization runtime contract', () => {
  it('defines complete English, Arabic, and Persian source-card and workspace translations', async () => {
    const keys = [
      'salesClosing.sources.title',
      'salesClosing.sources.today',
      'salesClosing.sources.previous',
      'salesClosing.sources.total',
      'salesClosing.sources.todayIncluded',
      'salesClosing.sources.dailyEditable',
      'salesClosing.workspace.addSource',
      'salesClosing.workspace.addField',
      'salesClosing.workspace.customize',
    ];

    keys.forEach((key) => {
      expect(translations.en[key]).toBeTruthy();
      expect(translations.ar[key]).toBeTruthy();
      expect(translations.fa[key]).toBeTruthy();
    });
    expect(translations.en['salesClosing.sources.today']).toBe('Today');
    expect(translations.ar['salesClosing.sources.today']).toBe('اليوم');
    expect(translations.fa['salesClosing.sources.today']).toBe('امروز');
  });

  it('recomputes source presentation from the active language without translating owner-created source data', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');
    const dialogs = await source('../src/components/sales/SalesClosingCustomizationDialogs.jsx');
    const languageContext = await source('../src/lib/LanguageContext.jsx');

    expect(workspace).toContain("const { currency, lang, t } = useLanguage();");
    expect(workspace).toContain("if (lang === 'en') return source.name_en || source.name_ar || source.name_fa || '';");
    expect(workspace).toContain("if (lang === 'fa') return source.name_fa || source.name_ar || source.name_en || '';");
    expect(workspace).toContain("return source.name_ar || source.name_en || source.name_fa || '';");
    expect(workspace).toContain('data-i18n-skip="true"');
    expect(workspace).toContain('key={source.id}');
    expect(dialogs).toContain("const { lang, t } = useLanguage();");
    expect(dialogs).toContain('localizedDataName(method, lang)');
    expect(languageContext).toContain("localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);");
  });

  it('removes the source card’s mixed-language hardcoding in favor of translation keys', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).not.toContain('اکنون / Today');
    expect(workspace).not.toContain('سابق / Previous');
    expect(workspace).not.toContain('مجموع / Total');
    expect(workspace).toContain("t('salesClosing.sources.todayIncluded')");
    expect(workspace).toContain("t('salesClosing.workspace.liveConfiguration')");
  });
});
