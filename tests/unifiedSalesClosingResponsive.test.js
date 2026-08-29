import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import translations from '../src/lib/i18n';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('Unified Sales Closing workflow contract', () => {
  it('uses one exception-first mobile workflow with required actions and expandable ERP detail', async () => {
    const [workspace, reconciliationPanel] = await Promise.all([
      source('../src/components/sales/UnifiedSalesClosing.jsx'),
      source('../src/components/sales/CashReconciliationPanel.jsx'),
    ]);

    expect(workspace).toContain('Close Today');
    expect(workspace).toContain('data-testid="closing-readiness-summary"');
    expect(workspace).toContain('data-testid="closing-cash-action"');
    expect(workspace).toContain('data-testid="closing-full-details"');
    expect(workspace).toContain("data-testid=\"quick-closing-auto-summary\"");
    expect(workspace).toContain('Verified automatically');
    expect(workspace).not.toContain('CLOSING_WORKFLOW_STEP_IDS');
    expect(workspace).not.toContain('closing-workflow-stepper');
    expect(workspace).toContain('touch-pan-y overflow-y-auto overscroll-contain');
    expect(workspace).toContain('<CashReconciliationPanel');
    expect(reconciliationPanel).toContain('grid grid-cols-[minmax(0,1.35fr)_minmax(7.5rem,0.65fr)]');
    expect(workspace).toContain('pb-[calc(env(safe-area-inset-bottom)+7rem)]');
    expect(workspace).toContain('env(safe-area-inset-bottom)+0.75rem');
    expect(workspace).not.toContain('100vw');
  });

  it('starts every session in the same quick-close surface and does not mask the authenticated operator behind a pending employee query', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('const [showFullDetails, setShowFullDetails] = useState(false);');
    expect(workspace).not.toContain('Quick Closing');
    expect(workspace).not.toContain('Advanced Closing');
    expect(workspace).toContain("cashierDisplayName || (empLoading ? 'Loading…' : empError ? 'Unable to load cashier' : 'No cashier')");
  });

  it('keeps legacy settlement rollups out of automatic sales while retaining supported query scope safeguards', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('queryKey: [\'quick_closing_automatic_sources\'');
    expect(workspace).not.toContain("from('daily_cash_settlements')");
    expect(workspace).toContain("scoped('payments'");
    expect(workspace).toContain("from('pos_reconciliation')");
    expect(workspace).toContain(".eq('restaurant_id', activeRestaurant.id)");
    expect(workspace).toContain(".eq('branch_id', selectedBranchId)");
    expect(workspace).toContain(".eq('date', form.date)");
    expect(workspace).toContain('Record sales at POS first.');
    expect(workspace).toContain('Exceptional Cash Adjustment');
  });

  it('calculates total sales, cash reconciliation, purchases, expenses and operating result automatically', async () => {
    const [workspace, reconciliationPanel] = await Promise.all([
      source('../src/components/sales/UnifiedSalesClosing.jsx'),
      source('../src/components/sales/CashReconciliationPanel.jsx'),
    ]);

    expect(workspace).toContain('cashSales + networkTotal + creditTotal + otherPaymentTotal');
    expect(workspace).toContain('const reconciliation = cashReconciliationSnapshot({');
    expect(workspace).toContain('const cashDifference = reconciliation.difference;');
    expect(workspace).toContain('const totalDailyExpenses = approvedPurchasesTotal + operatingExpensesTotal;');
    expect(workspace).toContain('const operatingResult = totalSales - totalDailyExpenses;');
    expect(workspace).toContain("supabase.rpc('erp_sales_closing_cash_context'");
    expect(reconciliationPanel).toContain('Actual Cash');
    expect(reconciliationPanel).toContain('No settlement required');
  });

  it('loads global and multi-branch Sales Sources through the selected branch server scope while mapping only Today amounts into canonical totals', async () => {
    const [sourceHook, workspace, context] = await Promise.all([
      source('../src/hooks/useSalesSources.js'),
      source('../src/components/sales/UnifiedSalesClosing.jsx'),
      source('../src/lib/SalesClosingCustomizationContext.jsx'),
    ]);

    expect(sourceHook).toContain('useSalesClosingCustomization()');
    expect(sourceHook).toContain('useBranchScope()');
    expect(sourceHook).toContain('requestedScopeMatchesActive');
    expect(sourceHook).not.toContain('.filter((source) => branchMatchesSource(');
    expect(context).toContain("['sales_sources_active', restaurantId, selectedBranchId, selectedBranchKey, isAllBranches]");
    expect(context).toContain("supabase.rpc('erp_sales_closing_branch_sources'");
    expect(context).toContain('p_branch_id: selectedBranchId');
    expect(workspace).toContain('paymentBucketForCode(source.default_payment_method)');
    expect(workspace).toContain('const customSourcePaymentTotals = useMemo(() =>');
    expect(workspace).toContain('const cashSales = baseCashSales + customSourcePaymentTotals.cash;');
    expect(workspace).toContain('const cardTotal = baseNetworkTotal + customSourcePaymentTotals.card;');
    expect(workspace).toContain('const bankTransferTotal = customSourcePaymentTotals.bank_transfer;');
    expect(workspace).toContain('const onlineTotal = customSourcePaymentTotals.online;');
    expect(workspace).toContain('const walletTotal = customSourcePaymentTotals.wallet;');
    expect(workspace).toContain('const creditTotal = baseCreditTotal + customSourcePaymentTotals.credit;');
    expect(workspace).toContain('buildSalesSourceClosingSnapshots(customSourceSummaries');
    expect(workspace).toContain("payment_bucket: snapshot.allows_driver_entries === true ? 'other' : paymentBucketForCode(snapshot.default_payment_method)");
    expect(workspace).toContain('salesSourceTodayTotal(customSourceSummaries)');
    expect(workspace).toContain("supabase.rpc('erp_sales_closing_cash_context'");
    expect(workspace).toContain('const reconciliation = cashReconciliationSnapshot({');
    expect(workspace).toContain('const expectedCash = reconciliation.expectedCash;');
  });

  it('invalidates every branch-scoped source cache after an Owner source mutation rather than merging it into another branch', async () => {
    const context = await source('../src/lib/SalesClosingCustomizationContext.jsx');
    const customization = await source('../src/pages/SalesClosingCustomization.jsx');

    expect(context).toContain("['sales_sources_active', restaurantId, selectedBranchId, selectedBranchKey, isAllBranches]");
    expect(context).toContain('const sourcePatchesRef = useRef(new Map());');
    expect(context).toContain('sourcePatchesRef.current.set(savedSource.id, savedSource);');
    expect(context).toContain("queryClient.invalidateQueries({ queryKey: ['sales_sources_active', restaurantId], refetchType: 'none' });");
    expect(context).not.toContain("queryClient.setQueriesData({ queryKey: ['sales_sources_active', restaurantId] }, merge);");
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

  it('consumes saved calculation and reconciliation settings without restoring the removed duplicate summary bar', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('const automaticTotalsEnabled = false;');
    expect(workspace).toContain('do not carry the Closing\'s full shift/cashier');
    expect(workspace).toContain('const requiresCashReconciliation = closingConfig?.validation_rules?.require_cash_reconciliation !== false;');
    expect(workspace).toContain('const automaticClosingEnabled = Boolean(automaticTotalsEnabled');
    expect(workspace).toContain('const useAutomaticSales = Boolean(automaticTotalsEnabled');
    expect(workspace).toContain('!requiresCashReconciliation || actualCount !== null');
    expect(workspace).toContain('Variance will be recorded separately');
    expect(workspace).toContain('requiresCashReconciliation && actualCount === null');
    expect(workspace).not.toContain('summaryVisibilityClass');
    expect(workspace).toContain('data-testid="closing-readiness-summary"');
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
    const [workspace, numericInput] = await Promise.all([
      source('../src/components/sales/UnifiedSalesClosing.jsx'),
      source('../src/components/sales/ClosingNumericInput.jsx'),
    ]);

    expect(numericInput).toContain('inputMode="decimal"');
    expect(numericInput).toContain('dir="ltr"');
    expect(workspace).toContain("import ClosingNumericInput from '@/components/sales/ClosingNumericInput';");
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
    expect(workspace).toContain("supabase.rpc('erp_sales_closing_cash_context'");
    expect(workspace).toContain('Fixed and variable expenses are supplied only by the canonical server cash');
    expect(workspace).not.toContain(".from('expenses')");
    expect(workspace).toContain("nextErrors.actualCash = 'Actual Cash is required.'");
    expect(workspace).toContain('focusField(firstError)');
    expect(workspace).toContain('Closing already completed for this branch and shift.');
    expect(sales).toContain("import { closingSaveErrorMessage, recordClosingOwnerPayment, saveClosingSession } from '@/lib/closing/ClosingRepository';");
    expect(sales).toContain('const saved = await saveClosingSession({ payload, closingId: editing?.id || null });');
    expect(sales).toContain('await runClosingFinalizationSideEffects(payload, saved, editing, proofUrl, ocr);');
  });

  it('clears automatic totals when the closing scope changes and blocks a save when ERP source reads fail', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('const automaticClosingScope = [');
    expect(workspace).toContain('previous.scope !== automaticClosingScope');
    expect(workspace).toContain('const snapshotMatchesScope = automaticClosingSnapshot.scope === automaticClosingScope');
    expect(workspace).toContain('const queryError = [paymentResults, posResults, creditResults]');
    expect(workspace).not.toContain("supabase.from('daily_cash_settlements')");
    expect(workspace).toContain('if (queryError) throw queryError;');
    expect(workspace).toContain('automaticClosingUnavailable');
    expect(workspace).toContain('Retry ERP data');
    expect(workspace).toContain('cashLedgerLoading || autoSourceLoading');
    expect(workspace).toContain('cashLedgerUnavailable || !allValid');
    expect(workspace).toContain("supabase.rpc('erp_sales_closing_cash_context'");
  });

  it('runs only non-accounting downstream side effects after the one committed finalized transition', async () => {
    const sales = await source('../src/pages/Sales.jsx');

    expect(sales).toContain('if (!savedClosing?._finalizedTransition || savedClosing?._idempotent) return;');
    const guard = sales.indexOf('if (!savedClosing?._finalizedTransition || savedClosing?._idempotent) return;');
    expect(sales.indexOf('await createSalesInvoice')).toBeGreaterThan(guard);
    expect(sales).toContain('Wallet-first settlement is part of the canonical finalization transaction.');
    expect(sales).not.toContain('autoWalletTx(savedClosing, savedClosing.id, previousClosing)');
    expect(sales).not.toContain('autoSettle(savedClosing, savedClosing.id, proofUrl || null, ocr || null, previousClosing)');
    expect(sales.indexOf('invalidateCustomerReceivableQueries(qc)')).toBeGreaterThan(guard);
    expect(sales).not.toContain('autoSaveCreditDebts');
  });

  it('keeps finalized invoice totals aligned with the canonical Other payment total', async () => {
    const migration = await source('../src/supabase/20260824_sales_invoice_other_sales_alignment.sql');

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS other_sales NUMERIC NOT NULL DEFAULT 0');
    expect(migration).toContain('v_other_sales   := COALESCE(NEW.custom_sources_total, 0);');
    expect(migration).toContain('v_sales_total   := v_cash_sales + v_network_sales + v_credit_sales + v_other_sales;');
    expect(migration).toContain('cash_sales, network_sales, credit_sales, other_sales, sales_total');
    expect(migration).toContain('other_sales         = EXCLUDED.other_sales');
  });

  it('keeps exception-first details inside the same closing session and makes New Closing idempotent by its business key', async () => {
    const [workspace, sales, migration] = await Promise.all([
      source('../src/components/sales/UnifiedSalesClosing.jsx'),
      source('../src/pages/Sales.jsx'),
      source('../src/supabase/20260827_sales_closing_draft_lifecycle.sql'),
    ]);

    expect(workspace).toContain('const [showFullDetails, setShowFullDetails] = useState(false);');
    expect(workspace).toContain('aria-expanded={showFullDetails}');
    expect(workspace).not.toContain('goToNextWorkflowStep');
    expect(workspace).toContain('onSessionContextChange?.({');
    expect(workspace).toContain('isOpeningNewClosing = false');
    expect(workspace).not.toContain("key={editing?.id || 'new-closing'}");

    expect(sales).toContain('const matchesSalesClosingSession = (record, session) => {');
    expect(sales).toContain('const findExistingClosingSession = useCallback(async (session) => {');
    expect(sales).toContain('const openNewClosing = useCallback(async () => {');
    expect(sales).toContain('Resumed the daily Closing.');
    expect(sales).toContain('dailyClosingDefaults({');
    expect(sales).toContain("existing?.closing_state === 'finalized'");
    expect(sales).toContain('No record is created until you save it.');
    expect(sales).toContain("key={editing?.id || `new-closing-${newClosingInstance}-${selectedBranchId || 'none'}-${selectedBranchKey || 'none'}`}");
    expect(sales).toContain('matchesSalesClosingSession(record, session)');
    expect(sales).toContain('disabled={isOpeningNewClosing}');

    expect(migration).toContain('CREATE UNIQUE INDEX daily_sales_unique_closing_session_idx');
    expect(migration).toContain("COALESCE(branch_id::text, 'legacy:' || lower(btrim(branch)))");
    expect(migration).toContain("COALESCE(cashier_id::text, 'legacy:' || lower(btrim(cashier_name)))");
    expect(migration).toContain("WHERE closing_state IN ('draft', 'ready')");
  });

  it('resumes only the matching active Draft while all existing Closings save through the canonical transaction', async () => {
    const sales = await source('../src/pages/Sales.jsx');

    expect(sales).toContain('const findExistingClosingSession = useCallback(async (session) => {');
    expect(sales).toContain("if (existing && ['draft', 'ready'].includes(existing.closing_state || 'draft')) {");
    expect(sales).toContain('Draft already exists for this business day, branch, shift, and cashier. Resumed the daily Closing.');
    expect(sales).toContain('const nextSession = existing?.closing_state === \'finalized\'');
    expect(sales).toContain('setEditing(existing);');
    expect(sales).toContain("import { closingSaveErrorMessage, recordClosingOwnerPayment, saveClosingSession } from '@/lib/closing/ClosingRepository';");
    expect(sales).toContain('const saved = await saveClosingSession({ payload, closingId: editing?.id || null });');
    expect(sales).not.toContain('handleRequestCorrection');
    expect(sales).not.toContain('authorized correction');
  });

  it('renders Save Draft and Finalize for both drafts and finalized Closing edits', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('Save Draft');
    expect(workspace).toContain('Finalize Closing');
    expect(workspace).toContain("setRequestedClosingState('draft')");
    expect(workspace).toContain("setRequestedClosingState('finalized')");
    expect(workspace).not.toContain('isProtectedClosing');
    expect(workspace).not.toContain('Request Correction');
    expect(workspace).not.toContain('Historical financial values are protected.');
    expect(workspace).not.toContain('pointer-events-none select-none opacity-80');
    expect(workspace).not.toContain("setRequestedClosingState('locked')");
  });

  it('keeps one authoritative server-side draft boundary while removing the correction lock guard', async () => {
    const [draftMigration, unlockMigration] = await Promise.all([
      source('../src/supabase/20260827_sales_closing_draft_lifecycle.sql'),
      source('../src/supabase/20260827_remove_sales_closing_lock_correction.sql'),
    ]);

    expect(draftMigration).toContain('CREATE OR REPLACE FUNCTION public.erp_prevent_duplicate_daily_closing()');
    expect(draftMigration).toContain("WHERE existing_closing.closing_state IN ('draft', 'ready')");
    expect(unlockMigration).toContain('DROP TRIGGER IF EXISTS erp_guard_sales_closing_history ON public.daily_sales;');
    expect(unlockMigration).toContain('CREATE TABLE IF NOT EXISTS public.sales_closing_finalized_versions');
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
    expect(workspace).toContain('id={`quick-closing-source-${source.id}`}');
    expect(workspace).toContain('value={todayInput}');
    expect(workspace).toContain('historyLoading={sourceHistoryLoading}');
  });

  it('implements exception-first closing with compact verified totals, network detail and closing fields', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('Verified automatically');
    expect(workspace).toContain('readinessPercent');
    expect(workspace).toContain('View full details');
    expect(workspace).toContain('Network total');
    expect(workspace).toContain('const networkCounterTotal = baseNetworkTotal;');
    expect(workspace).toContain('const networkDriversTotal = driverSourcePaymentTotals.card;');
    expect(workspace).toContain('networkTotal - networkCounterTotal - networkDriversTotal');
    expect(workspace).toContain('Closing fields');
    expect(workspace).toContain('ClosingFieldControlRow');
    expect(workspace).toContain('Finalize Closing');
  });

  it('uses only the current daily amount in all today-total and persistence calculations', async () => {
    const workspace = await source('../src/components/sales/UnifiedSalesClosing.jsx');

    expect(workspace).toContain('customSourceSummaries.reduce((totals, { source, today, driverEntries }) =>');
    expect(workspace).toContain('if (source.allows_driver_entries === true) {');
    expect(workspace).toContain('const driverTotals = driverSourcePaymentBreakdown(driverEntries);');
    expect(workspace).toContain('totals.cash += driverTotals.cash;');
    expect(workspace).toContain('totals.card += driverTotals.network;');
    expect(workspace).toContain('driverSourceTodayTotal(driverEntries)');
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
    expect(workspace).toContain("import ClosingNumericInput from '@/components/sales/ClosingNumericInput';");
    expect(workspace).toContain('export const NumInput = ClosingNumericInput;');
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
    expect(workspace).toContain('data-i18n-skip="true"');
  });
});
