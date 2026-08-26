import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useRole } from '@/lib/RoleContext';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import {
  DEFAULT_SALES_CLOSING_CONFIG,
  normalizeSalesClosingConfig,
  normalizeSalesClosingField,
  sortSalesClosingFields,
} from '@/lib/salesClosingCustomization';

const SalesClosingCustomizationContext = createContext({
  config: DEFAULT_SALES_CLOSING_CONFIG,
  fields: [],
  sources: [],
  paymentMethods: [],
  isLoading: false,
  isSaving: false,
  error: null,
  canCustomize: false,
  saveConfig: async () => {},
  saveSalesSource: async () => {},
  deleteSalesSource: async () => {},
  saveClosingField: async () => {},
  deleteClosingField: async () => {},
  isSavingSalesSource: false,
  isDeletingSalesSource: false,
  isSavingClosingField: false,
  isDeletingClosingField: false,
  reload: async () => {},
});

const asArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

export function SalesClosingCustomizationProvider({ children }) {
  const queryClient = useQueryClient();
  const { activeRestaurant } = useTenant();
  const { selectedBranchId, selectedBranchKey, isAllBranches } = useBranchScope();
  const { role, can } = useRole();
  const restaurantId = activeRestaurant?.id || null;
  const configKey = useMemo(() => ['sales-closing-config', restaurantId], [restaurantId]);
  const fieldsKey = useMemo(() => ['sales-closing-fields', restaurantId], [restaurantId]);
  const paymentMethodsKey = useMemo(() => ['sales-closing-payment-methods', restaurantId], [restaurantId]);

  const configQuery = useQuery({
    queryKey: configKey,
    enabled: Boolean(restaurantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_closing_config')
        .select('restaurant_id, settings, updated_at')
        .eq('restaurant_id', restaurantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const fieldsQuery = useQuery({
    queryKey: fieldsKey,
    enabled: Boolean(restaurantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_closing_fields')
        .select('id, field_key, label_en, label_ar, help_text, field_type, options, sort_order, is_active, is_required, visible_mobile, visible_desktop, is_system, updated_at')
        .eq('restaurant_id', restaurantId)
        .order('sort_order');
      if (error) throw error;
      return asArray(data);
    },
  });

  // Source rows are accounting inputs. Their cache must never be shared across
  // branch switches, and their backend read is explicitly scoped below.
  const sourceQueryKey = useMemo(
    () => ['sales_sources_active', restaurantId, selectedBranchId, selectedBranchKey, isAllBranches],
    [restaurantId, selectedBranchId, selectedBranchKey, isAllBranches],
  );
  const sourcePatchesRef = useRef(new Map());
  const sourceQuery = useQuery({
    queryKey: sourceQueryKey,
    enabled: Boolean(restaurantId && (isAllBranches || selectedBranchId)),
    staleTime: 30_000,
    queryFn: async () => {
      // There is intentionally no restaurant-wide source read followed by a
      // browser filter. The branch RPC verifies access and applies its branch
      // predicate before returning any accounting source row.
      if (!isAllBranches && selectedBranchId) {
        const { data, error } = await supabase.rpc('erp_sales_closing_branch_sources', {
          p_restaurant_id: restaurantId,
          p_branch_id: selectedBranchId,
          p_include_inactive: true,
        });
        if (error) throw error;
        return asArray(data);
      }
      // An explicit all-branches workspace may see only globally available
      // source definitions, never a union of branch-specific source rows.
      const { data, error } = await supabase
        .from('sales_sources')
        .select('id, name_en, name_ar, name_fa, description, category, sort_order, is_active, is_system, is_global, branch_id, branch_ids, default_payment_method, icon, color, included_in_revenue, included_in_cash_register, included_in_dashboard_kpi, included_in_profit_calc, requires_customer, requires_pos_device, requires_reference, requires_wallet, system_key, created_by, created_date, updated_date, archived_at, archived_by')
        .eq('restaurant_id', restaurantId)
        .eq('is_global', true)
        .order('sort_order');
      if (error) throw error;
      return asArray(data);
    },
  });

  const paymentMethodsQuery = useQuery({
    queryKey: paymentMethodsKey,
    enabled: Boolean(restaurantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('id, code, name_en, name_ar, sort_order, is_active, is_system, updated_at')
        .eq('restaurant_id', restaurantId)
        .order('sort_order');
      if (error) throw error;
      return asArray(data);
    },
  });

  useEffect(() => {
    if (!restaurantId) return undefined;
    const channel = supabase
      .channel(`sales-closing-customization-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_closing_config', filter: `restaurant_id=eq.${restaurantId}` }, () => queryClient.invalidateQueries({ queryKey: configKey }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_closing_fields', filter: `restaurant_id=eq.${restaurantId}` }, () => queryClient.invalidateQueries({ queryKey: fieldsKey }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_methods', filter: `restaurant_id=eq.${restaurantId}` }, () => queryClient.invalidateQueries({ queryKey: paymentMethodsKey }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_sources', filter: `restaurant_id=eq.${restaurantId}` }, () => queryClient.invalidateQueries({ queryKey: sourceQueryKey }))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [configKey, fieldsKey, paymentMethodsKey, queryClient, restaurantId, sourceQueryKey]);

  const saveMutation = useMutation({
    mutationFn: async (nextConfig) => {
      if (!restaurantId) throw new Error('Select an active restaurant before saving Sales Closing configuration.');
      const settings = normalizeSalesClosingConfig(nextConfig);
      const { data, error } = await supabase
        .from('sales_closing_config')
        .upsert({ restaurant_id: restaurantId, settings }, { onConflict: 'restaurant_id' })
        .select('restaurant_id, settings, updated_at')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(configKey, data),
  });

  const sortSources = useCallback((items) => asArray(items).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), []);
  const mergeSourceCache = useCallback((savedSource) => {
    if (!savedSource?.id) return;
    // A source can become available to a different branch. Never optimistically
    // merge it into the currently selected branch cache; re-read every affected
    // branch through the server-scoped RPC instead.
    sourcePatchesRef.current.set(savedSource.id, savedSource);
    queryClient.invalidateQueries({ queryKey: ['sales_sources_active', restaurantId], refetchType: 'none' });
  }, [queryClient, restaurantId]);

  useEffect(() => {
    const nextSources = sortSources(sourceQuery.data);
    for (const [sourceId, patch] of sourcePatchesRef.current.entries()) {
      const serverSource = nextSources.find((source) => source.id === sourceId);
      if (serverSource && Object.entries(patch).every(([key, value]) => serverSource[key] === value)) sourcePatchesRef.current.delete(sourceId);
    }
  }, [sourceQuery.data, sortSources]);

  const saveSourceMutation = useMutation({
    mutationFn: async (source) => {
      if (!restaurantId) throw new Error('Select an active restaurant before saving a sales source.');
      const branchIds = Array.from(new Set(asArray(source.branch_ids).map(String).filter(Boolean)));
      const isGlobal = source.is_global !== false;
      const payload = {
        ...source,
        restaurant_id: restaurantId,
        is_global: isGlobal,
        branch_ids: isGlobal ? [] : branchIds,
        // Keep legacy branch_id unchanged when present. New branch availability is
        // carried by branch_ids so historical branch-key snapshots remain valid.
        branch_id: isGlobal ? null : source.branch_id || null,
        category: String(source.category || 'other'),
        archived_at: source.is_active === false ? source.archived_at || new Date().toISOString() : null,
        archived_by: source.is_active === false ? source.archived_by || null : null,
      };
      if (source.id) {
        const { data, error } = await supabase.from('sales_sources').update(payload).eq('id', source.id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from('sales_sources').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (savedSource, source) => {
      mergeSourceCache({ ...savedSource, ...source, id: savedSource?.id || source.id });
      queryClient.invalidateQueries({ queryKey: sourceQueryKey, refetchType: 'none' });
    },
  });

  const deleteSourceMutation = useMutation({
    mutationFn: async (source) => {
      const { error } = await supabase.from('sales_sources').delete().eq('id', source.id);
      if (error) throw error;
    },
    onSuccess: (_, source) => {
      sourcePatchesRef.current.set(source.id, false);
      queryClient.invalidateQueries({ queryKey: ['sales_sources_active', restaurantId], refetchType: 'none' });
    },
  });

  const saveFieldMutation = useMutation({
    mutationFn: async (field) => {
      if (!restaurantId) throw new Error('Select an active restaurant before saving a field.');
      const { id: fieldId, ...fieldPayload } = field;
      const payload = { ...fieldPayload, restaurant_id: restaurantId };
      if (fieldId) {
        const { data, error } = await supabase.from('sales_closing_fields').update(payload).eq('id', fieldId).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from('sales_closing_fields').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (savedField) => {
      queryClient.setQueryData(fieldsKey, (items) => sortSalesClosingFields([...asArray(items).filter((item) => item.id !== savedField.id), savedField]));
      queryClient.invalidateQueries({ queryKey: fieldsKey, refetchType: 'none' });
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: async (field) => {
      const { error } = await supabase.from('sales_closing_fields').delete().eq('id', field.id);
      if (error) throw error;
    },
    onSuccess: (_, field) => {
      queryClient.setQueryData(fieldsKey, (items) => asArray(items).filter((item) => item.id !== field.id));
      queryClient.invalidateQueries({ queryKey: fieldsKey, refetchType: 'none' });
    },
  });

  const config = useMemo(() => normalizeSalesClosingConfig(configQuery.data?.settings), [configQuery.data]);
  const sources = useMemo(() => sortSources(sourceQuery.data), [sourceQuery.data, sortSources]);
  const fields = useMemo(() => sortSalesClosingFields(asArray(fieldsQuery.data).map(normalizeSalesClosingField)), [fieldsQuery.data]);
  const paymentMethods = useMemo(() => asArray(paymentMethodsQuery.data).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [paymentMethodsQuery.data]);
  const canCustomize = role === 'owner' || can?.manageDashboardCustomization === true;
  const reload = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: configKey }),
      queryClient.invalidateQueries({ queryKey: fieldsKey }),
      queryClient.invalidateQueries({ queryKey: paymentMethodsKey }),
      queryClient.invalidateQueries({ queryKey: sourceQueryKey }),
    ]);
    await Promise.all([configQuery.refetch(), fieldsQuery.refetch(), paymentMethodsQuery.refetch(), sourceQuery.refetch()]);
  }, [configKey, configQuery, fieldsKey, fieldsQuery, paymentMethodsKey, paymentMethodsQuery, queryClient, sourceQuery, sourceQueryKey]);

  const value = useMemo(() => ({
    config,
    sources,
    fields,
    paymentMethods,
    isLoading: configQuery.isLoading || sourceQuery.isLoading || fieldsQuery.isLoading || paymentMethodsQuery.isLoading,
    isSaving: saveMutation.isPending,
    error: configQuery.error || sourceQuery.error || fieldsQuery.error || paymentMethodsQuery.error || saveMutation.error || null,
    canCustomize,
    saveConfig: (nextConfig) => saveMutation.mutateAsync(nextConfig),
    saveSalesSource: (source) => saveSourceMutation.mutateAsync(source),
    deleteSalesSource: (source) => deleteSourceMutation.mutateAsync(source),
    saveClosingField: (field) => saveFieldMutation.mutateAsync(field),
    deleteClosingField: (field) => deleteFieldMutation.mutateAsync(field),
    isSavingSalesSource: saveSourceMutation.isPending,
    isDeletingSalesSource: deleteSourceMutation.isPending,
    isSavingClosingField: saveFieldMutation.isPending,
    isDeletingClosingField: deleteFieldMutation.isPending,
    reload,
  }), [canCustomize, config, configQuery.error, configQuery.isLoading, deleteFieldMutation.isPending, deleteFieldMutation.mutateAsync, deleteSourceMutation.isPending, deleteSourceMutation.mutateAsync, fields, fieldsQuery.error, fieldsQuery.isLoading, paymentMethods, paymentMethodsQuery.error, paymentMethodsQuery.isLoading, reload, saveFieldMutation.isPending, saveFieldMutation.mutateAsync, saveMutation.error, saveMutation.isPending, saveMutation.mutateAsync, saveSourceMutation.isPending, saveSourceMutation.mutateAsync, sourceQuery.error, sourceQuery.isLoading, sources]);

  return <SalesClosingCustomizationContext.Provider value={value}>{children}</SalesClosingCustomizationContext.Provider>;
}

export function useSalesClosingCustomization() {
  return useContext(SalesClosingCustomizationContext);
}
