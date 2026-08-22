import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useRole } from '@/lib/RoleContext';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import {
  DEFAULT_WORKSPACE_CUSTOMIZATION,
  getProductCustomFields,
  getWorkspaceLabel,
  isProductFieldRequired,
  isProductFieldVisible,
  mergeWorkspaceCustomization,
  normalizeWorkspaceCustomization,
} from '@/lib/workspaceCustomization';

const WorkspaceCustomizationContext = createContext({
  configuration: DEFAULT_WORKSPACE_CUSTOMIZATION,
  isLoading: false,
  isSaving: false,
  error: null,
  canCustomize: false,
  saveConfiguration: async () => {},
  savePatch: async () => {},
  restoreDefaults: async () => {},
  label: (value) => value,
  isProductFieldVisible: () => true,
  isProductFieldRequired: () => false,
  productCustomFields: [],
});

function getWorkspacePayload(row) {
  const settings = row?.settings && typeof row.settings === 'object' && !Array.isArray(row.settings)
    ? row.settings
    : {};
  return normalizeWorkspaceCustomization(settings.workspace_customization);
}

export function WorkspaceCustomizationProvider({ children }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { setLang, setRegionalPreferences } = useLanguage();
  const { can, role } = useRole();
  const { activeRestaurant } = useTenant();
  const restaurantId = activeRestaurant?.id || null;
  const queryKey = useMemo(() => ['workspace-customization', restaurantId], [restaurantId]);

  const configurationQuery = useQuery({
    queryKey,
    enabled: Boolean(restaurantId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_settings')
        .select('organization_id, settings, updated_at')
        .eq('organization_id', restaurantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const membershipQuery = useQuery({
    queryKey: ['workspace-customization-membership', restaurantId, user?.id],
    enabled: Boolean(restaurantId && user?.id && role !== 'owner'),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('erp_memberships')
        .select('role, permissions, status')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!restaurantId) return undefined;
    const channel = supabase
      .channel(`workspace-customization-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'org_settings', filter: `organization_id=eq.${restaurantId}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [queryClient, queryKey, restaurantId]);

  const configuration = useMemo(
    () => getWorkspacePayload(configurationQuery.data),
    [configurationQuery.data],
  );

  useEffect(() => {
    if (!configurationQuery.data) return;
    setLang(configuration.regional.language);
    setRegionalPreferences(configuration.regional);
  }, [configuration, configurationQuery.data, setLang, setRegionalPreferences]);

  const saveMutation = useMutation({
    mutationFn: async (nextConfiguration) => {
      if (!restaurantId) throw new Error('Select an organization before changing workspace customization.');
      const payload = normalizeWorkspaceCustomization(nextConfiguration);
      const { data, error } = await supabase.rpc('erp_update_workspace_customization', {
        p_restaurant_id: restaurantId,
        p_customization: payload,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, {
        organization_id: restaurantId,
        settings: data?.settings || { workspace_customization: data || DEFAULT_WORKSPACE_CUSTOMIZATION },
        updated_at: data?.updated_at || new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ['dashboard-customization', restaurantId] });
    },
  });

  const saveConfiguration = useCallback(
    (nextConfiguration) => saveMutation.mutateAsync(nextConfiguration),
    [saveMutation],
  );
  const savePatch = useCallback(
    (patch) => saveMutation.mutateAsync(mergeWorkspaceCustomization(configuration, patch)),
    [configuration, saveMutation],
  );
  const restoreDefaults = useCallback(
    () => saveMutation.mutateAsync(DEFAULT_WORKSPACE_CUSTOMIZATION),
    [saveMutation],
  );

  const membershipPermissions = membershipQuery.data?.permissions || {};
  const canCustomize = role === 'owner'
    || can?.manageDashboardCustomization === true
    || membershipQuery.data?.role === 'owner'
    || membershipPermissions.manageDashboardCustomization === true;

  const value = useMemo(() => ({
    configuration,
    isLoading: configurationQuery.isLoading,
    isSaving: saveMutation.isPending,
    error: configurationQuery.error || saveMutation.error || membershipQuery.error || null,
    canCustomize,
    saveConfiguration,
    savePatch,
    restoreDefaults,
    label: (value) => getWorkspaceLabel(configuration, value),
    isProductFieldVisible: (field) => isProductFieldVisible(configuration, field),
    isProductFieldRequired: (field) => isProductFieldRequired(configuration, field),
    productCustomFields: getProductCustomFields(configuration),
  }), [canCustomize, configuration, configurationQuery.error, configurationQuery.isLoading, membershipQuery.error, restoreDefaults, saveConfiguration, saveMutation.error, saveMutation.isPending, savePatch]);

  return (
    <WorkspaceCustomizationContext.Provider value={value}>
      {children}
    </WorkspaceCustomizationContext.Provider>
  );
}

export function useWorkspaceCustomization() {
  return useContext(WorkspaceCustomizationContext);
}
