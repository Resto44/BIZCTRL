import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { useRetailInventoryScope } from '@/lib/RetailInventoryScopeContext';
import { EMPTY_INVENTORY, inventoryRPC } from '@/lib/retailInventory';
import { subscribeRetailInventoryRealtime } from '@/lib/retailInventoryRealtime';
import { isSupermarketProductPortal } from '@/lib/productImportAccess';

export function useRetailInventory() {
  const { activeRestaurant, branches, isBranchScoped } = useTenant();
  const scope = useBranchScope();
  const warehouse = useRetailInventoryScope();
  const restaurantId = activeRestaurant?.id;
  const branchId = scope.isAllBranches ? null : scope.selectedBranchId;
  const enabled = Boolean(restaurantId && isSupermarketProductPortal(activeRestaurant));
  const qc = useQueryClient();
  const [realtime, setRealtime] = useState({ status: 'CONNECTING' });
  const params = { p_restaurant_id: restaurantId, p_branch_id: branchId, p_warehouse_id: warehouse.warehouseId };
  const query = useQuery({
    queryKey: ['retail-inventory', restaurantId, 'snapshot', branchId, warehouse.warehouseId],
    queryFn: () => inventoryRPC('snapshot', params), enabled, staleTime: 10000, refetchInterval: 60000,
    retry: (count, error) => !['42501', '42883', 'PGRST202'].includes(error?.code) && count < 1,
  });
  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeRetailInventoryRealtime({ client: supabase, queryClient: qc, restaurantId, onChange: setRealtime });
  }, [enabled, qc, restaurantId]);
  const refresh = useCallback(() => Promise.all([
    qc.invalidateQueries({ queryKey: ['retail-inventory', restaurantId] }),
    qc.invalidateQueries({ queryKey: ['retail-pos-control', restaurantId] }),
    ...['inventory', 'products', 'master-products', 'purchase-orders', 'purchases', 'product-catalog-counts', 'erp-master-catalog', 'erp-master-catalog-counts'].map((key) => qc.invalidateQueries({ queryKey: [key] })),
  ]), [qc, restaurantId]);
  const mutation = useMutation({
    mutationFn: ({ command, payload, requestKey }) => inventoryRPC('command', { p_restaurant_id: restaurantId, p_command: command, p_payload: payload, p_request_key: requestKey || null }),
    onSuccess: refresh,
  });
  return { ...scope, ...warehouse, branches: branches || [], restaurantId, branchId, isBranchScoped, enabled, params,
    snapshot: query.data || EMPTY_INVENTORY, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error,
    realtime, refresh, run: mutation.mutateAsync, busy: mutation.isPending };
}
export function useInventoryList(ctx, type, filters = {}, enabled = true) {
  return useQuery({ queryKey: ['retail-inventory', ctx.restaurantId, type, ctx.branchId, ctx.warehouseId, filters],
    queryFn: () => inventoryRPC(type, { ...ctx.params, ...filters }), enabled: ctx.enabled && enabled, staleTime: 10000, retry: 1 });
}
