import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import {
  buildRetailPosPeriod,
  normalizeRetailPosSnapshot,
  RETAIL_POS_REALTIME_TABLES,
} from '@/lib/retailPosControl';

const EMPTY_SNAPSHOT = normalizeRetailPosSnapshot(null);

function nonRetryable(error) {
  return ['42501', 'PGRST202', '42883'].includes(error?.code);
}

export function useRetailPOSControl({ period = 'today', branchId = null, deviceId = null } = {}) {
  const { activeRestaurant, branches } = useTenant();
  const restaurantId = activeRestaurant?.id || null;
  const queryClient = useQueryClient();
  const range = useMemo(() => buildRetailPosPeriod(period), [period]);
  const [realtimeStatus, setRealtimeStatus] = useState('CONNECTING');
  const [lastEventAt, setLastEventAt] = useState(null);
  const refreshTimerRef = useRef(null);
  const queryKey = useMemo(
    () => ['retail-pos-control', restaurantId, range.from, range.to, branchId || 'all', deviceId || 'all'],
    [branchId, deviceId, range.from, range.to, restaurantId],
  );

  const snapshotQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('erp_retail_pos_control_snapshot', {
        p_restaurant_id: restaurantId,
        p_from: range.from,
        p_to: range.to,
        p_branch_id: branchId || null,
        p_device_id: deviceId || null,
      });
      if (error) throw error;
      return normalizeRetailPosSnapshot(data);
    },
    enabled: Boolean(restaurantId),
    staleTime: 10_000,
    refetchInterval: 60_000,
    retry: (failureCount, error) => !nonRetryable(error) && failureCount < 2,
  });

  const queueRefresh = useCallback(() => {
    setLastEventAt(new Date());
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      queryClient.invalidateQueries({ queryKey: ['retail-pos-control', restaurantId], exact: false });
    }, 600);
  }, [queryClient, restaurantId]);

  useEffect(() => {
    if (!restaurantId) return undefined;
    let channel = supabase.channel(`retail-pos-control-${restaurantId}`);
    RETAIL_POS_REALTIME_TABLES.forEach((table) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `restaurant_id=eq.${restaurantId}` },
        queueRefresh,
      );
    });
    channel.subscribe((status) => setRealtimeStatus(status));
    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
      supabase.removeChannel(channel);
      setRealtimeStatus('CLOSED');
    };
  }, [queueRefresh, restaurantId]);

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['retail-pos-control', restaurantId], exact: false }),
    [queryClient, restaurantId],
  );

  const seedDevicesMutation = useMutation({
    mutationFn: async ({ targetBranchId, count = 10 }) => {
      const { data, error } = await supabase.rpc('erp_retail_pos_seed_branch_devices', {
        p_branch_id: targetBranchId,
        p_count: count,
      });
      if (error) throw error;
      return data || [];
    },
    onSuccess: invalidate,
  });

  const commandMutation = useMutation({
    mutationFn: async ({ targetDeviceId, commandType, payload = {} }) => {
      const { data, error } = await supabase.rpc('erp_retail_pos_request_command', {
        p_device_id: targetDeviceId,
        p_command_type: commandType,
        p_payload: payload,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const approvalMutation = useMutation({
    mutationFn: async ({ requestId, decision, notes = null }) => {
      const { data, error } = await supabase.rpc('erp_retail_pos_review_approval', {
        p_request_id: requestId,
        p_decision: decision,
        p_notes: notes,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const closeShiftMutation = useMutation({
    mutationFn: async ({ shiftId, countedCash, notes = null }) => {
      const { data, error } = await supabase.rpc('erp_retail_pos_close_shift', {
        p_shift_id: shiftId,
        p_counted_cash: countedCash,
        p_notes: notes,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  return {
    restaurantId,
    activeRestaurant,
    branches,
    period: range,
    snapshot: snapshotQuery.data || EMPTY_SNAPSHOT,
    isLoading: snapshotQuery.isLoading,
    isFetching: snapshotQuery.isFetching,
    error: snapshotQuery.error,
    refetch: snapshotQuery.refetch,
    realtimeStatus,
    lastEventAt,
    seedDevices: seedDevicesMutation.mutateAsync,
    isSeedingDevices: seedDevicesMutation.isPending,
    requestCommand: commandMutation.mutateAsync,
    isSendingCommand: commandMutation.isPending,
    reviewApproval: approvalMutation.mutateAsync,
    isReviewingApproval: approvalMutation.isPending,
    closeShift: closeShiftMutation.mutateAsync,
    isClosingShift: closeShiftMutation.isPending,
  };
}
