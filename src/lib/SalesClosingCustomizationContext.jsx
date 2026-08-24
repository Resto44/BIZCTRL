import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useRole } from '@/lib/RoleContext';
import { useTenant } from '@/lib/TenantContext';
import {
  DEFAULT_SALES_CLOSING_CONFIG,
  normalizeSalesClosingConfig,
  normalizeSalesClosingField,
  sortSalesClosingFields,
} from '@/lib/salesClosingCustomization';

const SalesClosingCustomizationContext = createContext({
  config: DEFAULT_SALES_CLOSING_CONFIG,
  fields: [],
  paymentMethods: [],
  isLoading: false,
  isSaving: false,
  error: null,
  canCustomize: false,
  saveConfig: async () => {},
  reload: async () => {},
});

const asArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

export function SalesClosingCustomizationProvider({ children }) {
  const queryClient = useQueryClient();
  const { activeRestaurant } = useTenant();
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
        .select('id, field_key, label_en, label_ar, field_type, options, sort_order, is_active, is_required, visible_mobile, visible_desktop, is_system, updated_at')
        .eq('restaurant_id', restaurantId)
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_sources', filter: `restaurant_id=eq.${restaurantId}` }, () => queryClient.invalidateQueries({ queryKey: ['sales_sources'] }))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [configKey, fieldsKey, paymentMethodsKey, queryClient, restaurantId]);

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

  const config = useMemo(() => normalizeSalesClosingConfig(configQuery.data?.settings), [configQuery.data]);
  const fields = useMemo(() => sortSalesClosingFields(asArray(fieldsQuery.data).map(normalizeSalesClosingField)), [fieldsQuery.data]);
  const paymentMethods = useMemo(() => asArray(paymentMethodsQuery.data).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [paymentMethodsQuery.data]);
  const canCustomize = role === 'owner' || can?.manageDashboardCustomization === true;
  const reload = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: configKey }),
      queryClient.invalidateQueries({ queryKey: fieldsKey }),
      queryClient.invalidateQueries({ queryKey: paymentMethodsKey }),
      queryClient.invalidateQueries({ queryKey: ['sales_sources'] }),
    ]);
    await Promise.all([configQuery.refetch(), fieldsQuery.refetch(), paymentMethodsQuery.refetch()]);
  }, [configKey, configQuery, fieldsKey, fieldsQuery, paymentMethodsKey, paymentMethodsQuery, queryClient]);

  const value = useMemo(() => ({
    config,
    fields,
    paymentMethods,
    isLoading: configQuery.isLoading || fieldsQuery.isLoading || paymentMethodsQuery.isLoading,
    isSaving: saveMutation.isPending,
    error: configQuery.error || fieldsQuery.error || paymentMethodsQuery.error || saveMutation.error || null,
    canCustomize,
    saveConfig: (nextConfig) => saveMutation.mutateAsync(nextConfig),
    reload,
  }), [canCustomize, config, configQuery.error, configQuery.isLoading, fields, fieldsQuery.error, fieldsQuery.isLoading, paymentMethods, paymentMethodsQuery.error, paymentMethodsQuery.isLoading, reload, saveMutation.error, saveMutation.isPending, saveMutation.mutateAsync]);

  return <SalesClosingCustomizationContext.Provider value={value}>{children}</SalesClosingCustomizationContext.Provider>;
}

export function useSalesClosingCustomization() {
  return useContext(SalesClosingCustomizationContext);
}
