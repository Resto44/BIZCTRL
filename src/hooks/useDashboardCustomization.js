import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import {
  DASHBOARD_CONFIGURATION_SCHEMA_VERSION,
  getDashboardWidgetDefaults,
  normalizeDashboardWidgetConfiguration,
} from '@/lib/dashboardCustomization';

export function useDashboardCustomization({
  restaurantId,
  lang,
  t,
  selectedBranch,
  selectedBranchLabel,
  activeAlertCount,
}) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['dashboard-customization', restaurantId], [restaurantId]);

  const query = useQuery({
    queryKey,
    enabled: Boolean(restaurantId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_configurations')
        .select('restaurant_id, widget_overrides, schema_version, updated_at, updated_by')
        .eq('restaurant_id', restaurantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const defaults = useMemo(() => getDashboardWidgetDefaults({
    lang,
    t,
    selectedBranch,
    selectedBranchLabel,
    activeAlertCount,
  }), [lang, t, selectedBranch, selectedBranchLabel, activeAlertCount]);

  const overrides = useMemo(() => {
    const raw = query.data?.widget_overrides;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  }, [query.data?.widget_overrides]);

  const widgets = useMemo(
    () => normalizeDashboardWidgetConfiguration(defaults, overrides),
    [defaults, overrides],
  );

  const widgetsById = useMemo(
    () => Object.fromEntries(widgets.map((widget) => [widget.id, widget])),
    [widgets],
  );

  const saveMutation = useMutation({
    mutationFn: async (nextOverrides) => {
      if (!restaurantId) throw new Error('An active restaurant is required.');
      const { data, error } = await supabase
        .from('dashboard_configurations')
        .upsert({
          restaurant_id: restaurantId,
          widget_overrides: nextOverrides || {},
          schema_version: DASHBOARD_CONFIGURATION_SCHEMA_VERSION,
        }, { onConflict: 'restaurant_id' })
        .select('restaurant_id, widget_overrides, schema_version, updated_at, updated_by')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });

  const saveOverrides = useCallback(
    (nextOverrides) => saveMutation.mutateAsync(nextOverrides),
    [saveMutation],
  );

  return {
    widgets,
    widgetsById,
    defaults,
    overrides,
    isLoading: query.isLoading,
    error: query.error,
    saveOverrides,
    isSaving: saveMutation.isPending,
  };
}
