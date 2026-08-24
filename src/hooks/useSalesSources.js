/*
 * useSalesSources — canonical active Sales Sources query for Sales Closing.
 *
 * Fetches the restaurant-scoped source set once, then applies the selected-branch
 * visibility rule locally. This is essential because global rows have branch_id
 * NULL and must remain visible when a particular branch is selected.
 */
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';

const asRecordArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

export function useSalesSources({ branchId } = {}) {
  const { activeRestaurant, managerBranchObject } = useTenant();
  const activeRestaurantId = activeRestaurant?.id ? String(activeRestaurant.id) : null;

  // Determine effective canonical branch UUID: explicit scope > manager assignment.
  const effectiveBranchId = branchId || managerBranchObject?.id || null;

  const { data: allSourcesData, isLoading, error, refetch } = useQuery({
    // Sources are restaurant-scoped. Keeping branch out of the request key avoids
    // duplicate fetches on branch switches and lets global records remain visible.
    queryKey: ['sales_sources_active', activeRestaurantId, effectiveBranchId || 'all'],
    queryFn: async () => {
      const all = await base44.entities.SalesSource.filter({ restaurant_id: activeRestaurantId }, 'sort_order', 200);
      // RLS remains authoritative. Branch visibility is applied below so both
      // global (NULL branch_id) and branch-specific sources are evaluated together.
      return asRecordArray(all);
    },
    staleTime: 60_000,
    enabled: !!activeRestaurantId,
  });

  const allSources = asRecordArray(allSourcesData);

  const sources = allSources
    .filter((s) => s.is_active)
    .filter((s) => {
      if (s.is_global || !s.branch_id) return true;
      if (!effectiveBranchId) return true;
      return String(s.branch_id) === String(effectiveBranchId);
    })
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const cashSource = sources.find((source) => source.system_key === 'cash');
  const creditSource = sources.find((source) => source.system_key === 'credit');
  const networkSource = sources.find((source) => source.system_key === 'network');
  const otherSource = sources.find((source) => source.system_key === 'other');
  const customSources = sources.filter((source) => !source.is_system);
  const kpiSources = sources.filter((source) => source.included_in_dashboard_kpi);
  const revenueSources = sources.filter((source) => source.included_in_revenue);
  const cashRegisterSources = sources.filter((source) => source.included_in_cash_register);
  const profitSources = sources.filter((source) => source.included_in_profit_calc);

  return {
    sources,
    allSources,
    isLoading,
    error,
    refetch,
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
