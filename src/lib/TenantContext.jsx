import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useRole, ROLES } from '@/lib/RoleContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const asRecordArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

const TenantContext = createContext({
  restaurants: [], loadingRestaurants: false, activeRestaurant: null, activeRestaurantId: null,
  setActiveRestaurant: () => {}, branches: [], allBranches: [], createRestaurant: async () => {},
  updateRestaurant: async () => {}, updateRestaurantBranches: async () => {}, refetchRestaurants: () => {},
  orgId: '', orgFilter: {}, restaurantFilter: null,
  managerBranch: null, managerBranchObject: null, isManager: false,
});

export function TenantProvider({ children }) {
  const { user, isLoadingAuth } = useAuth();
  const queryClient = useQueryClient();

  // Active restaurant id stored in localStorage per user
  const [activeRestaurantId, setActiveRestaurantIdRaw] = useState(() =>
    localStorage.getItem(`rc_restaurant_${user?.email || 'default'}`) || null
  );

  // Normalize the raw role string the same way RoleContext does so that
  // 'admin' / 'restaurant_admin' users are correctly treated as OWNER.
  const normalizedRole = (() => {
    const r = (user?.role || '').toLowerCase();
    if (Object.values(ROLES).includes(r)) return r;
    if (r === 'admin' || r === 'restaurant_admin') return ROLES.OWNER;
    if (r === 'staff') return ROLES.EMPLOYEE;
    return ROLES.OWNER; // safe default
  })();
  const isOwner = normalizedRole === ROLES.OWNER;
  const isManager = normalizedRole === ROLES.MANAGER;
  const isEmployee = normalizedRole === ROLES.EMPLOYEE;
  const isKitchen = normalizedRole === ROLES.KITCHEN;
  const isCustomer = normalizedRole === ROLES.CUSTOMER;
  const isSponsor = normalizedRole === ROLES.SPONSOR;

  const { data: restaurantsData, isLoading: loadingRestaurants, refetch: refetchRestaurants } = useQuery({
    queryKey: ['restaurants', user?.id, user?.role],
    queryFn: async () => {
      if (!user?.id) return [];

      if (isOwner) {
        // Owner: find their restaurant via erp_memberships (most reliable)
        // Fall back to org_id match if needed
        const { data: membership } = await supabase
          .from('erp_memberships')
          .select('restaurant_id')
          .eq('user_id', user.id)
          .eq('role', 'owner')
          .eq('status', 'approved')
          .single();

        if (membership?.restaurant_id) {
          const { data } = await supabase
            .from('restaurants')
            .select('*')
            .eq('id', membership.restaurant_id)
            .limit(1);
          return data || [];
        }

        // Fallback: try org_id = email (legacy)
        const { data } = await supabase
          .from('restaurants')
          .select('*')
          .eq('org_id', user.email)
          .limit(10);
        return data || [];
      }

      // Non-owners: read restaurant_id directly from their profile
      // This is set atomically by the handle_new_user trigger on registration
      const restaurantId = user?.restaurant_id || user?.organization_id;
      if (restaurantId) {
        const { data } = await supabase
          .from('restaurants')
          .select('*')
          .eq('id', restaurantId)
          .limit(1);
        return data || [];
      }

      return [];
    },
    enabled: !!user?.id && !isLoadingAuth,
    staleTime: 60000,
  });
  const restaurants = asRecordArray(restaurantsData);

  // Auto-select the first valid restaurant if none is selected.
  useEffect(() => {
    const firstRestaurant = restaurants.at(0);
    if (firstRestaurant?.id && !activeRestaurantId) {
      setActiveRestaurantIdRaw(firstRestaurant.id);
    }
  }, [restaurants, activeRestaurantId]);

  const activeRestaurant = restaurants.find(r => r.id === activeRestaurantId) || restaurants.at(0) || null;

  const setActiveRestaurant = useCallback((id) => {
    setActiveRestaurantIdRaw(id);
    localStorage.setItem(`rc_restaurant_${user?.email || 'default'}`, id);
    // Invalidate all data queries when switching restaurant
    queryClient.invalidateQueries();
  }, [user?.email, queryClient]);

  // Load branches from the branches table (not from JSON column)
  const { data: branchesFromDBData } = useQuery({
    queryKey: ['branches', activeRestaurant?.id],
    queryFn: async () => {
      if (!activeRestaurant?.id) return [];
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, branch_key, location, is_active, restaurant_id')
        .eq('restaurant_id', activeRestaurant.id)
        .order('name');
      if (error) return [];
      return asRecordArray(data).map(b => ({
        ...b,
        key: b.branch_key,
        label: b.name,
      }));
    },
    enabled: !!activeRestaurant?.id,
    staleTime: 60000,
  });
  const branchesFromDB = asRecordArray(branchesFromDBData);

  // Also parse branches from active restaurant JSON column (for backward compat)
  const branchesFromJSON = React.useMemo(() => {
    if (!activeRestaurant?.branches) return [];
    try {
      const parsed = typeof activeRestaurant.branches === 'string'
        ? JSON.parse(activeRestaurant.branches)
        : activeRestaurant.branches;
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }, [activeRestaurant]);

  // Merge canonical database branches with legacy JSON metadata. Database rows remain
  // authoritative for identity and active status, while legacy metadata stays available.
  const allBranches = React.useMemo(() => {
    const legacyByKey = new Map(
      branchesFromJSON
        .filter(branch => branch?.key || branch?.branch_key)
        .map(branch => [branch.key || branch.branch_key, branch]),
    );
    const databaseKeys = new Set();
    const databaseBranches = branchesFromDB.map((branch) => {
      const key = branch.branch_key || branch.key;
      const legacy = legacyByKey.get(key) || {};
      databaseKeys.add(key);
      return {
        ...legacy,
        ...branch,
        key,
        label: branch.name || legacy.label || key,
        address: branch.location || legacy.address || '',
      };
    });

    // Existing organizations may still have legacy JSON-only branches. Keep them
    // visible until the next branch save synchronizes them into the table.
    return [
      ...databaseBranches,
      ...branchesFromJSON.filter(branch => {
        const key = branch?.key || branch?.branch_key;
        return key && !databaseKeys.has(key);
      }),
    ];
  }, [branchesFromDB, branchesFromJSON]);
  const branches = allBranches.filter(b => b.is_active !== false);

  // Keep branch selectors, dashboards, and invitation flows synchronized when a
  // branch changes in another active client.
  useEffect(() => {
    if (!activeRestaurant?.id) return undefined;

    const restaurantId = activeRestaurant.id;
    const channel = supabase
      .channel(`tenant-branches-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'branches', filter: `restaurant_id=eq.${restaurantId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['branches', restaurantId] });
          queryClient.invalidateQueries({ queryKey: ['restaurants'] });
        },
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [activeRestaurant?.id, queryClient]);

  const createRestaurant = useCallback(async (data) => {
    const { data: r, error } = await supabase
      .from('restaurants')
      .insert({ ...data, org_id: user.email, created_by: user.email })
      .select()
      .single();
    if (error) throw error;
    refetchRestaurants();
    return r;
  }, [user?.email, refetchRestaurants]);

  const updateRestaurant = useCallback(async (id, data) => {
    const { data: r, error } = await supabase
      .from('restaurants')
      .update({ ...data, updated_date: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    refetchRestaurants();
    queryClient.invalidateQueries({ queryKey: ['restaurants'] });
    return r;
  }, [refetchRestaurants, queryClient]);

  const updateRestaurantBranches = useCallback(async (branchesArr) => {
    if (!activeRestaurant?.id) {
      throw new Error('Select a business before managing branches.');
    }

    const restaurantId = activeRestaurant.id;
    const now = new Date().toISOString();
    const normalizedBranches = (branchesArr || []).map((branch) => {
      const key = String(branch?.key || branch?.branch_key || '').trim();
      const label = String(branch?.label || branch?.name || key).trim();
      if (!key || !label) {
        throw new Error('Every branch needs a name and unique branch key.');
      }
      return {
        ...branch,
        key,
        label,
        address: branch?.address ?? branch?.location ?? '',
        is_active: branch?.is_active !== false,
      };
    });

    const branchKeys = normalizedBranches.map(branch => branch.key);
    if (new Set(branchKeys).size !== branchKeys.length) {
      throw new Error('Branch keys must be unique within a business.');
    }

    const { data: existingBranches, error: existingError } = await supabase
      .from('branches')
      .select('id, branch_key')
      .eq('restaurant_id', restaurantId);
    if (existingError) throw existingError;

    const existingByKey = new Map((existingBranches || []).map(branch => [branch.branch_key, branch]));
    const desiredKeys = new Set(branchKeys);
    const toBranchPayload = (branch, includeCreatedBy = false) => ({
      restaurant_id: restaurantId,
      branch_key: branch.key,
      name: branch.label,
      location: branch.address || null,
      is_active: branch.is_active !== false,
      business_mode: branch.business_mode || activeRestaurant.business_mode || null,
      updated_date: now,
      ...(includeCreatedBy ? { created_by: user?.email || null } : {}),
    });

    const inserts = normalizedBranches.filter(branch => !existingByKey.has(branch.key));
    if (inserts.length > 0) {
      const { error } = await supabase
        .from('branches')
        .insert(inserts.map(branch => toBranchPayload(branch, true)));
      if (error) throw error;
    }

    const updates = normalizedBranches.filter(branch => existingByKey.has(branch.key));
    await Promise.all(updates.map(async (branch) => {
      const { error } = await supabase
        .from('branches')
        .update(toBranchPayload(branch))
        .eq('id', existingByKey.get(branch.key).id)
        .eq('restaurant_id', restaurantId);
      if (error) throw error;
    }));

    const deleteIds = (existingBranches || [])
      .filter(branch => !desiredKeys.has(branch.branch_key))
      .map(branch => branch.id);
    if (deleteIds.length > 0) {
      const { error } = await supabase
        .from('branches')
        .delete()
        .in('id', deleteIds);
      if (error) throw error;
    }

    // Retain the legacy restaurant JSON for existing consumers while the canonical
    // branches table drives all current reads and secure invitation RPCs.
    await updateRestaurant(restaurantId, { branches: JSON.stringify(normalizedBranches) });
    await queryClient.invalidateQueries({ queryKey: ['branches', restaurantId] });
    await queryClient.invalidateQueries({ queryKey: ['restaurants'] });
  }, [activeRestaurant, queryClient, updateRestaurant, user?.email]);

  // org_id filter for all data queries — always scope to current user's org
  const orgFilter = { org_id: user?.email || '' };
  const restaurantFilter = activeRestaurant
    ? { org_id: user?.email || '', restaurant_id: activeRestaurant.id }
    : null;

  // Branch isolation for all staff roles
  const isStaffRole = [ROLES.MANAGER, ROLES.EMPLOYEE, ROLES.KITCHEN].includes(normalizedRole);

  // Prefer the legacy branch key, but preserve the canonical branch UUID when
  // the key is absent on an assigned Branch Manager profile.
  const assignedBranch = isStaffRole ? (user?.branch || user?.branch_id || null) : null;
  const managerBranchObject = React.useMemo(() => {
    if (!isManager || !assignedBranch) return null;
    return branches.find((branch) =>
      branch.id === user?.branch_id ||
      branch.key === user?.branch ||
      branch.branch_key === user?.branch,
    ) || null;
  }, [assignedBranch, branches, isManager, user?.branch, user?.branch_id]);

  // TENANT ISOLATION
  const ownerFilter = React.useMemo(() => {
    if (isStaffRole) {
      return { branch: assignedBranch || '__none__' };
    }
    if (isCustomer) {
      return { customer_email: user?.email || '__none__' };
    }
    return { created_by: user?.email || '__none__' };
  }, [user?.email, isStaffRole, isCustomer, assignedBranch]);

  // On user CHANGE (not initial mount), clear ALL cached queries and localStorage restaurant
  // selection to prevent cross-tenant data leaks.
  const prevEmailRef = React.useRef(undefined);
  React.useEffect(() => {
    const email = user?.email;
    if (prevEmailRef.current !== undefined && prevEmailRef.current !== email) {
      queryClient.removeQueries();
      if (prevEmailRef.current) {
        localStorage.removeItem(`rc_restaurant_${prevEmailRef.current}`);
      }
    }
    prevEmailRef.current = email;
  }, [user?.email, queryClient]);

  // For managers: restrict branches list to only their assigned branch
  const effectiveBranches = React.useMemo(() => {
    if (isManager && assignedBranch) {
      return branches.filter((branch) =>
        branch.id === user?.branch_id ||
        branch.key === user?.branch ||
        branch.branch_key === user?.branch ||
        branch.id === assignedBranch,
      );
    }
    return branches;
  }, [assignedBranch, branches, isManager, user?.branch, user?.branch_id]);

  return (
    <TenantContext.Provider value={{
      restaurants,
      loadingRestaurants: loadingRestaurants || isLoadingAuth,
      activeRestaurant,
      activeRestaurantId: activeRestaurant?.id || null,
      setActiveRestaurant,
      branches: effectiveBranches,
      allBranches,
      createRestaurant,
      updateRestaurant,
      updateRestaurantBranches,
      refetchRestaurants,
      orgId: user?.email || '',
      orgFilter,
      restaurantFilter,
      ownerFilter,
      managerBranch: managerBranchObject?.key || managerBranchObject?.branch_key || assignedBranch,
      managerBranchObject,
      isManager,
      isEmployee,
      isDriver,
      isKitchen,
      isCustomer,
      isSponsor,
    }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  return ctx;
}
