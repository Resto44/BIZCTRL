/*
 * useSalesSources — canonical active Sales Sources query for Sales Closing,
 * dashboards, history, and management views.
 *
 * The SalesClosingCustomizationProvider is the single restaurant-scoped source
 * cache. Reusing it here prevents parallel Sales Source queries and ensures a
 * management edit is visible to every consuming ERP workflow immediately.
 */
import { useMemo } from 'react';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { useSalesClosingCustomization } from '@/lib/SalesClosingCustomizationContext';

const asRecordArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

const branchMatchesSource = (source, branchId, branchKey) => {
  if (source?.is_global || (!source?.branch_id && !asRecordArray(source?.branch_ids).length)) return true;
  if (!branchId && !branchKey) return true;

  const canonicalIds = asRecordArray(source?.branch_ids).map(String);
  return canonicalIds.includes(String(branchId))
    || (source?.branch_id && String(source.branch_id) === String(branchId))
    || (source?.branch_id && branchKey && String(source.branch_id) === String(branchKey));
};

export function useSalesSources({ branchId, branchKey, includeInactive = false } = {}) {
  const { managerBranchObject } = useTenant();
  const { selectedBranchId, selectedBranchKey, isAllBranches } = useBranchScope();
  const {
    sources: allSourcesData,
    isLoading,
    error,
    reload,
  } = useSalesClosingCustomization();

  // The canonical branch UUID and legacy key are both supported while the ERP
  // finishes its existing legacy branch-key migration.
  const effectiveBranchId = branchId || managerBranchObject?.id || (isAllBranches ? null : selectedBranchId) || null;
  const effectiveBranchKey = branchKey || managerBranchObject?.key || managerBranchObject?.branch_key || (isAllBranches ? null : selectedBranchKey) || null;

  // The provider queries the database/RPC with the canonical branch scope. If a
  // caller has not yet caught up with a branch switch, expose no sources rather
  // than filtering a prior branch response in the browser.
  const requestedScopeMatchesActive = isAllBranches
    ? !effectiveBranchId && !effectiveBranchKey
    : String(effectiveBranchId || '') === String(selectedBranchId || '')
      && String(effectiveBranchKey || '') === String(selectedBranchKey || '');
  const allSources = useMemo(() => (requestedScopeMatchesActive ? asRecordArray(allSourcesData) : [])
    .filter((source) => includeInactive || source.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [allSourcesData, includeInactive, requestedScopeMatchesActive]);

  const activeSources = useMemo(() => allSources.filter((source) => source.is_active !== false), [allSources]);
  const cashSource = activeSources.find((source) => source.system_key === 'cash');
  const creditSource = activeSources.find((source) => source.system_key === 'credit');
  const networkSource = activeSources.find((source) => source.system_key === 'network');
  const otherSource = activeSources.find((source) => source.system_key === 'other');
  const customSources = activeSources.filter((source) => !source.is_system);
  const kpiSources = activeSources.filter((source) => source.included_in_dashboard_kpi !== false);
  const revenueSources = activeSources.filter((source) => source.included_in_revenue !== false);
  const cashRegisterSources = activeSources.filter((source) => source.included_in_cash_register !== false);
  const profitSources = activeSources.filter((source) => source.included_in_profit_calc !== false);

  return {
    sources: activeSources,
    allSources,
    isLoading,
    error,
    refetch: reload,
    cashSource,
    creditSource,
    networkSource,
    otherSource,
    customSources,
    kpiSources,
    revenueSources,
    cashRegisterSources,
    profitSources,
  };
}

export { branchMatchesSource };
