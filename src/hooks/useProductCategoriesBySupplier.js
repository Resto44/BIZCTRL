import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import {fetchScopedPurchaseProducts,fetchAlternateSupplierProductIds} from '@/lib/purchaseInvoiceBrands';
import {restaurantMaterialFilter} from '@/lib/restaurantProducts';
import { useTenant } from '@/lib/TenantContext';

/**
 * Fetch product categories that contain products from a specific supplier.
 * Used in Purchase Invoice flow: Supplier → Product Category → Subcategory → Product
 */
export function useProductCategoriesBySupplier(supplierId) {
  const { activeRestaurantId,activeRestaurant } = useTenant();

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['product_categories_by_supplier', supplierId, activeRestaurantId],
    queryFn: async () => {
      if (!supplierId || !activeRestaurantId) return [];

      const ids=await fetchAlternateSupplierProductIds(supabase,activeRestaurantId,supplierId);
      const data=await fetchScopedPurchaseProducts(supabase,{restaurant_id:activeRestaurantId,supplier_id:supplierId,...restaurantMaterialFilter(activeRestaurant)},ids);
      const categoryIds=[...new Set(data.map(p=>p.category_id).filter(Boolean))];

      if (categoryIds.length === 0) return [];

      // Fetch the category details
      const { data: categoryData, error: catError } = await supabase
        .from('product_categories')
        .select('*')
        .in('id', categoryIds)
        .eq('restaurant_id', activeRestaurantId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (catError) {
        console.error('Error fetching category details:', catError);
        return [];
      }

      return categoryData || [];
    },
    enabled: !!(supplierId && activeRestaurantId),
    staleTime: 30000,
  });

  return { categories, isLoading };
}
