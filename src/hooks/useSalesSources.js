/**
 * useSalesSources — React Query hook for active Sales Sources.
 *
 * Returns sorted, active sales sources from the sales_sources table.
 * Provides helpers to get source by system_key for backward compatibility.
 * Respects tenant isolation (created_by) and branch-specific filtering.
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
    queryKey: ['sales_sources_active', activeRestaurantId, effectiveBranchId || 'all'],
    queryFn: async () => {
      const filters = { restaurant_id: activeRestaurantId };
      if (effectiveBranchId) filters.branch_id = effectiveBranchId;
      const all = await base44.entities.SalesSource.filter(filters, 'sort_order', 200);
      // RLS remains authoritative. The UUID filter limits the returned tenant data
      // before any display-only normalization is applied.
      return asRecordArray(all);
    },
    staleTime: 60000,
    enabled: !!activeRestaurantId,
  });

  const allSources = asRecordArray(allSourcesData);

  // Filter: active only, and respect branch scoping
  const sources = allSources
    .filter(s => s.is_active)
    .filter(s => {
      if (s.is_global) return true;
      if (!effectiveBranchId) return true;
      return !s.branch_id || String(s.branch_id) === String(effectiveBranchId);
    })
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // System sources by key (for backward compat)
  const cashSource    = sources.find(s => s.system_key === 'cash');
  const creditSource  = sources.find(s => s.system_key === 'credit');
  const networkSource = sources.find(s => s.system_key === 'network');
  const otherSource   = sources.find(s => s.system_key === 'other');

  // Non-system custom sources (e.g. Delivery, Talabat, etc.)
  const customSources = sources.filter(s => !s.is_system);

  // Sources that should appear in Dashboard KPI
  const kpiSources = sources.filter(s => s.included_in_dashboard_kpi);

  // Sources that count toward revenue
  const revenueSources = sources.filter(s => s.included_in_revenue);

  // Sources that appear in cash register
  const cashRegisterSources = sources.filter(s => s.included_in_cash_register);

  // Sources that count toward profit
  const profitSources = sources.filter(s => s.included_in_profit_calc);

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
