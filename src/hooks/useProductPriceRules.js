import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { DEFAULT_PRODUCT_PRICE_RULES, PRODUCT_PRICE_RULES_KEY, parseProductPriceRules } from '@/lib/productControlCenter';

export default function useProductPriceRules() {
  const { user } = useAuth();
  const { activeRestaurant } = useTenant();
  const queryClient = useQueryClient();
  const restaurantId = activeRestaurant?.id || null;
  const queryKey = useMemo(() => ['product-price-rules', restaurantId], [restaurantId]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const rows = await base44.entities.AppSettings.filter({
        key: PRODUCT_PRICE_RULES_KEY,
        restaurant_id: restaurantId,
      }, '-updated_date', 1);
      const record = rows?.[0] || null;
      return { record, rules: parseProductPriceRules(record?.value) };
    },
    enabled: Boolean(restaurantId),
    staleTime: 60_000,
  });

  const [draft, setDraft] = useState(() => ({ ...DEFAULT_PRODUCT_PRICE_RULES }));

  useEffect(() => {
    setDraft(query.data?.rules || { ...DEFAULT_PRODUCT_PRICE_RULES });
  }, [query.dataUpdatedAt, restaurantId]);

  const mutation = useMutation({
    mutationFn: async (rules) => {
      if (!restaurantId) throw new Error('Select an organization before saving price rules.');
      const payload = {
        key: PRODUCT_PRICE_RULES_KEY,
        value: JSON.stringify(parseProductPriceRules(rules)),
        restaurant_id: restaurantId,
        org_id: user?.email || null,
        created_by: user?.email || null,
      };
      const existing = query.data?.record;
      const record = existing?.id
        ? await base44.entities.AppSettings.update(existing.id, payload)
        : await base44.entities.AppSettings.create(payload);
      return { record, rules: parseProductPriceRules(rules) };
    },
    onSuccess: (next) => {
      setDraft(next.rules);
      queryClient.setQueryData(queryKey, next);
    },
  });

  return {
    rules: draft,
    setRules: setDraft,
    saveRules: () => mutation.mutateAsync(draft),
    isLoading: query.isLoading,
    isSaving: mutation.isPending,
    error: query.error || mutation.error,
  };
}
