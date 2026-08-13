import { useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';

const ACTIVE_STATUS = 'active';

export function useActiveAlerts() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { activeRestaurant, isManager, managerBranch, managerBranchObject } = useTenant();

  const restaurantId = activeRestaurant?.id || null;
  const managerBranchId = managerBranchObject?.id || null;
  const queryKey = useMemo(
    () => ['active-alerts', restaurantId, isManager ? (managerBranchId || managerBranch || '__none__') : 'all'],
    [isManager, managerBranch, managerBranchId, restaurantId],
  );
  const hasScope = Boolean(restaurantId && (!isManager || managerBranchId));

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      let request = supabase
        .from('active_alerts')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('status', ACTIVE_STATUS)
        .order('detected_at', { ascending: false })
        .limit(500);
      if (isManager) request = request.eq('branch_id', managerBranchId);
      const { data, error } = await request;
      if (error) throw error;
      return data || [];
    },
    enabled: hasScope,
    staleTime: 30000,
  });

  useEffect(() => {
    if (!restaurantId) return undefined;
    const channel = supabase
      .channel(`active-alerts-${restaurantId}-${isManager ? (managerBranchId || 'none') : 'owner'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_alerts', filter: `restaurant_id=eq.${restaurantId}` },
        () => queryClient.invalidateQueries({ queryKey: ['active-alerts', restaurantId] }),
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [isManager, managerBranchId, queryClient, restaurantId]);

  const resolveMutation = useMutation({
    mutationFn: async (alertId) => {
      const { data, error } = await supabase
        .from('active_alerts')
        .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: user?.id || null })
        .eq('id', alertId)
        .eq('status', ACTIVE_STATUS)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, alertId) => {
      queryClient.setQueriesData({ queryKey: ['active-alerts', restaurantId] }, (current) =>
        Array.isArray(current) ? current.filter((alert) => alert.id !== alertId) : current,
      );
      queryClient.invalidateQueries({ queryKey: ['active-alerts', restaurantId] });
    },
  });

  const resolveAlert = useCallback((alertId) => resolveMutation.mutateAsync(alertId), [resolveMutation]);
  const resolveAll = useCallback(
    async (alerts) => Promise.all((alerts || []).map((alert) => resolveAlert(alert.id))),
    [resolveAlert],
  );

  return {
    alerts: query.data || [],
    alertCount: (query.data || []).length,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasScope,
    resolveAlert,
    resolveAll,
    isResolving: resolveMutation.isPending,
    refetch: query.refetch,
  };
}
