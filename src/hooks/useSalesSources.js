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

export function useSalesSources({ branchKey } = {}) {
  const { activeRestaurant, managerBranch } = useTenant();
  const activeRestaurantId = activeRestaurant?.id ? String(activeRestaurant.id) : null;

  // Determine effective branch key: explicit prop > manager branch
  const effectiveBranch = branchKey || managerBranch || null;

  const { data: allSourcesData, isLoading, error, refetch } = useQuery({
    queryKey: ['sales_sources_active', activeRestaurantId],
    queryFn: async () => {
      const all = await base44.entities.SalesSource.list('sort_order', 200);
      // Return: system sources (created_by IS NULL) + current restaurant/tenant sources + current user created sources
      // RLS will filter what the user can actually see based on their role and permissions
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
      if (!effectiveBranch) return true;
      return s.branch_id === effectiveBranch;
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
