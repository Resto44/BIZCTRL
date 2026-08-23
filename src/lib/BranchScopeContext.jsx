import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';

export const ALL_BRANCHES = 'all';

const BranchScopeContext = createContext({
  selectedBranchId: ALL_BRANCHES,
  selectedBranchKey: null,
  selectedBranchLabel: 'All Branches',
  selectedBranch: null,
  isAllBranches: true,
  branchFilter: null,
  branchKeyFilter: null,
  setSelectedBranchId: () => {},
});

const storageKey = (userId, restaurantId) => `bizctrl.selected-branch.${userId || 'anonymous'}.${restaurantId || 'none'}`;

function normalizeBranchId(value) {
  if (!value || value === ALL_BRANCHES) return ALL_BRANCHES;
  return String(value);
}

export function BranchScopeProvider({ children }) {
  const { user } = useAuth();
  const {
    activeRestaurant,
    branches,
    isBranchScoped,
    managerBranchObject,
  } = useTenant();
  const queryClient = useQueryClient();
  const restaurantId = activeRestaurant?.id ? String(activeRestaurant.id) : null;
  const availableBranches = useMemo(
    () => (branches || []).filter((branch) => branch?.id && branch?.restaurant_id === activeRestaurant?.id),
    [activeRestaurant?.id, branches],
  );
  const managerBranchId = isBranchScoped && managerBranchObject?.id ? String(managerBranchObject.id) : null;
  const key = storageKey(user?.id, restaurantId);
  const [requestedBranchId, setRequestedBranchId] = useState(ALL_BRANCHES);

  // Restore only a branch that is part of the authenticated restaurant. This makes
  // local storage a convenience cache, not an authorization source.
  useEffect(() => {
    if (!restaurantId) {
      setRequestedBranchId(ALL_BRANCHES);
      return;
    }
    if (managerBranchId) {
      setRequestedBranchId(managerBranchId);
      return;
    }
    const saved = normalizeBranchId(localStorage.getItem(key));
    const isAllowed = saved === ALL_BRANCHES || availableBranches.some((branch) => String(branch.id) === saved);
    setRequestedBranchId(isAllowed ? saved : ALL_BRANCHES);
  }, [key, managerBranchId, restaurantId, availableBranches]);

  const selectedBranchId = useMemo(() => {
    if (!restaurantId) return ALL_BRANCHES;
    if (managerBranchId) return managerBranchId;
    return availableBranches.some((branch) => String(branch.id) === requestedBranchId)
      ? requestedBranchId
      : ALL_BRANCHES;
  }, [availableBranches, managerBranchId, requestedBranchId, restaurantId]);

  const selectedBranch = useMemo(
    () => availableBranches.find((branch) => String(branch.id) === selectedBranchId) || null,
    [availableBranches, selectedBranchId],
  );
  const selectedBranchKey = selectedBranch?.branch_key || selectedBranch?.key || null;
  const selectedBranchLabel = selectedBranch?.name || selectedBranch?.label || selectedBranchKey || 'All Branches';
  const isAllBranches = selectedBranchId === ALL_BRANCHES;

  const setSelectedBranchId = useCallback((nextValue) => {
    const nextId = normalizeBranchId(nextValue);
    if (managerBranchId && nextId !== managerBranchId) return;
    const isAllowed = nextId === ALL_BRANCHES || availableBranches.some((branch) => String(branch.id) === nextId);
    const safeId = isAllowed ? nextId : ALL_BRANCHES;
    setRequestedBranchId(safeId);
    if (restaurantId) localStorage.setItem(storageKey(user?.id, restaurantId), safeId);
    // The branch UUID appears in all branch-aware query keys. This explicit
    // invalidation also refreshes older tenant-scoped consumers immediately.
    queryClient.invalidateQueries({ queryKey: ['branch-scope', restaurantId] });
  }, [availableBranches, managerBranchId, queryClient, restaurantId, user?.id]);

  const value = useMemo(() => {
    const tenantFilter = restaurantId ? { restaurant_id: restaurantId } : null;
    const branchFilter = !tenantFilter
      ? null
      : isAllBranches
        ? tenantFilter
        : { ...tenantFilter, branch_id: selectedBranchId };
    return {
      selectedBranchId,
      selectedBranchKey,
      selectedBranchLabel: isAllBranches ? 'All Branches' : selectedBranchLabel,
      selectedBranch,
      isAllBranches,
      // Canonical table filter: tenant UUID plus optional branch UUID.
      branchFilter,
      // Some legacy tables retain branch_key; callers must still pair it with tenant scope.
      branchKeyFilter: !tenantFilter
        ? null
        : isAllBranches
          ? tenantFilter
          : { ...tenantFilter, branch_key: selectedBranchKey },
      setSelectedBranchId,
    };
  }, [isAllBranches, restaurantId, selectedBranch, selectedBranchId, selectedBranchKey, selectedBranchLabel, setSelectedBranchId]);

  return <BranchScopeContext.Provider value={value}>{children}</BranchScopeContext.Provider>;
}

export function useBranchScope() {
  return useContext(BranchScopeContext);
}
