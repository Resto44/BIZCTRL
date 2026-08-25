import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, subDays } from 'date-fns';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { useSalesClosingCustomization } from '@/lib/SalesClosingCustomizationContext';
import { useSalesSources } from '@/hooks/useSalesSources';

const asArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
export const SALES_SOURCE_HISTORY_PAGE_SIZE = 25;

export const salesSourceDateRange = (preset, custom = {}) => {
  const today = new Date();
  if (preset === 'today') return { from: format(today, 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
  if (preset === 'yesterday') {
    const day = subDays(today, 1);
    return { from: format(day, 'yyyy-MM-dd'), to: format(day, 'yyyy-MM-dd') };
  }
  if (preset === 'week') return { from: format(subDays(today, 6), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
  if (preset === 'month') return { from: format(startOfMonth(today), 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
  return { from: custom.from || null, to: custom.to || null };
};

const normalizedFilter = (filters = {}) => ({
  sourceId: filters.sourceId || null,
  paymentMethod: filters.paymentMethod || null,
  customerId: filters.customerId || null,
  cashier: filters.cashier || null,
  from: filters.from || null,
  to: filters.to || null,
});

export function sourceDisplayName(source, lang) {
  if (lang === 'fa') return source?.name_fa || source?.name_ar || source?.name_en || '';
  if (lang === 'ar') return source?.name_ar || source?.name_en || source?.name_fa || '';
  return source?.name_en || source?.name_ar || source?.name_fa || '';
}

/**
 * Central source analytics/history access. The source master configuration comes
 * from the existing SalesClosingCustomizationProvider. Transaction rows are
 * derived only from finalized daily_sales snapshots through the bounded RPC.
 */
export function useSalesSourceManagement({ filters, page = 0 } = {}) {
  const { activeRestaurant } = useTenant();
  const {
    selectedBranchId,
    selectedBranchKey,
    isAllBranches,
  } = useBranchScope();
  const { paymentMethods } = useSalesClosingCustomization();
  const {
    allSources,
    isLoading: sourcesLoading,
    error: sourcesError,
  } = useSalesSources({ includeInactive: true });
  const normalized = normalizedFilter(filters);
  const restaurantId = activeRestaurant?.id ? String(activeRestaurant.id) : null;
  const branchId = isAllBranches ? null : selectedBranchId || null;
  const branchKey = isAllBranches ? null : selectedBranchKey || null;

  const historyQuery = useQuery({
    queryKey: ['sales-source-management-history', restaurantId, branchId, branchKey, normalized, page],
    enabled: Boolean(restaurantId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sales_source_history', {
        p_restaurant_id: restaurantId,
        p_source_id: normalized.sourceId,
        p_branch_id: branchId,
        p_branch_key: branchKey,
        p_from: normalized.from,
        p_to: normalized.to,
        p_payment_method: normalized.paymentMethod,
        p_customer_id: normalized.customerId,
        p_cashier: normalized.cashier,
        p_limit: SALES_SOURCE_HISTORY_PAGE_SIZE,
        p_offset: page * SALES_SOURCE_HISTORY_PAGE_SIZE,
      });
      if (error) throw error;
      return asArray(data);
    },
  });

  const dashboardQuery = useQuery({
    queryKey: ['sales-source-management-dashboard', restaurantId, branchId, branchKey, normalized.from, normalized.to],
    enabled: Boolean(restaurantId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sales_source_dashboard', {
        p_restaurant_id: restaurantId,
        p_branch_id: branchId,
        p_branch_key: branchKey,
        p_from: normalized.from,
        p_to: normalized.to,
      });
      if (error) throw error;
      return asArray(data);
    },
  });

  const analyticsBySource = useMemo(
    () => new Map(asArray(dashboardQuery.data).map((row) => [String(row.source_id), row])),
    [dashboardQuery.data],
  );
  const sources = useMemo(() => allSources.map((source) => ({
    ...source,
    analytics: analyticsBySource.get(String(source.id)) || {
      today_sales: 0,
      previous_sales: 0,
      total_sales: 0,
      transaction_count: 0,
      average_transaction: 0,
      cash_amount: 0,
      digital_amount: 0,
      credit_amount: 0,
      collected_amount: 0,
      outstanding_amount: 0,
      contribution_percent: 0,
    },
  })), [allSources, analyticsBySource]);

  const history = asArray(historyQuery.data);
  const sourceById = useMemo(() => new Map(sources.map((source) => [String(source.id), source])), [sources]);
  const historyWithSource = useMemo(() => history.map((row) => ({
    ...row,
    source: sourceById.get(String(row.source_id)) || null,
  })), [history, sourceById]);
  const paymentOptions = useMemo(() => asArray(paymentMethods)
    .filter((method) => method.is_active !== false)
    .map((method) => method.code)
    .filter(Boolean), [paymentMethods]);

  return {
    sources,
    history: historyWithSource,
    paymentOptions,
    isLoading: sourcesLoading || historyQuery.isLoading || dashboardQuery.isLoading,
    isHistoryLoading: historyQuery.isLoading,
    isDashboardLoading: dashboardQuery.isLoading,
    error: sourcesError || historyQuery.error || dashboardQuery.error || null,
    hasNextPage: history.length === SALES_SOURCE_HISTORY_PAGE_SIZE,
    refetch: async () => Promise.all([historyQuery.refetch(), dashboardQuery.refetch()]),
  };
}
