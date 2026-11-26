import { restaurantMaterialFilter } from '@/lib/restaurantProducts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useTenant } from '@/lib/TenantContext';
import { fetchScopedPurchaseProducts, fetchAlternateSupplierProductIds } from '@/lib/purchaseInvoiceBrands';

export function usePurchaseProductsByCategory(productCategoryId, supplierId, subcategoryId) {
  const { activeRestaurantId, activeRestaurant } = useTenant();
  const { data: products = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['purchase_products_filtered', productCategoryId, supplierId, subcategoryId, activeRestaurantId, activeRestaurant?.business_type, activeRestaurant?.business_mode],
    queryFn: async () => fetchScopedPurchaseProducts(supabase, {
      restaurant_id: activeRestaurantId,
      ...restaurantMaterialFilter(activeRestaurant),
      ...(productCategoryId && { category_id: productCategoryId }),
      ...(subcategoryId && { subcategory_id: subcategoryId }),
      ...(supplierId && { supplier_id: supplierId }),
    }, await fetchAlternateSupplierProductIds(supabase,activeRestaurantId,supplierId)),
    enabled: !!activeRestaurantId && !!(productCategoryId || supplierId),
    staleTime: 0,
    retry: 1,
  });
  return { products: isError ? [] : products, isLoading, isError, refetch };
}
