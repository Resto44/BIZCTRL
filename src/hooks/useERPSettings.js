import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { audit } from '@/lib/auditLogger';
import { DEFAULT_ERP_SETTINGS, ERP_SETTINGS_KEY, mergeERPSettings, parseERPSettings } from '@/lib/erpSettings';

const serialize = (value) => JSON.stringify(value);

export default function useERPSettings() {
  const { user } = useAuth();
  const { activeRestaurant } = useTenant();
  const queryClient = useQueryClient();
  const restaurantId = activeRestaurant?.id || null;
  const queryKey = useMemo(() => ['erp-settings-center', restaurantId], [restaurantId]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!restaurantId) return { record: null, settings: parseERPSettings(null) };
      const rows = await base44.entities.AppSettings.filter({
        key: ERP_SETTINGS_KEY,
        restaurant_id: restaurantId,
      }, '-updated_date', 1);
      const record = rows?.[0] || null;
      return { record, settings: parseERPSettings(record?.value) };
    },
    enabled: Boolean(restaurantId),
    staleTime: 60_000,
  });

  const [draft, setDraft] = useState(() => parseERPSettings(null));
  const [persisted, setPersisted] = useState(() => parseERPSettings(null));

  useEffect(() => {
    const next = query.data?.settings || parseERPSettings(null);
    setDraft(next);
    setPersisted(next);
  }, [query.dataUpdatedAt, restaurantId]);

  const mutation = useMutation({
    mutationFn: async (nextSettings) => {
      if (!restaurantId || !user?.email) throw new Error('Select an organization before saving settings.');
      const payload = {
        key: ERP_SETTINGS_KEY,
        value: serialize(nextSettings),
        org_id: user.email,
        restaurant_id: restaurantId,
        created_by: user.email,
      };
      const existing = query.data?.record;
      const record = existing?.id
        ? await base44.entities.AppSettings.update(existing.id, payload)
        : await base44.entities.AppSettings.create(payload);
      return { record, settings: nextSettings };
    },
    onSuccess: ({ record, settings }) => {
      setPersisted(settings);
      setDraft(settings);
      queryClient.setQueryData(queryKey, { record, settings });
      audit.settingsChange(`ERP Settings Center updated for ${activeRestaurant?.name || restaurantId}`);
    },
  });

  const updateSection = useCallback((section, patch) => {
    setDraft((current) => ({
      ...current,
      [section]: mergeERPSettings(current[section] || {}, patch),
    }));
  }, []);

  const resetSection = useCallback((section) => {
    setDraft((current) => ({
      ...current,
      [section]: mergeERPSettings(DEFAULT_ERP_SETTINGS[section] || {}, {}),
    }));
  }, []);

  const discard = useCallback(() => setDraft(persisted), [persisted]);
  const save = useCallback(() => mutation.mutateAsync(draft), [draft, mutation]);
  const isDirty = useMemo(() => serialize(draft) !== serialize(persisted), [draft, persisted]);

  return {
    settings: draft,
    persistedSettings: persisted,
    updateSection,
    resetSection,
    discard,
    save,
    isDirty,
    isLoading: query.isLoading,
    loadError: query.error,
    isSaving: mutation.isPending,
    saveError: mutation.error,
    lastSavedAt: query.data?.record?.updated_date || query.data?.record?.created_date || null,
  };
}

