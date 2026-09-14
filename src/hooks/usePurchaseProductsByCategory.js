import { restaurantMaterialFilter } from '@/lib/restaurantProducts';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useTenant } from '@/lib/TenantContext';

/**
 * Fetch products filtered by product_category_id, supplier_id, and subcategory_id using server-side filtering.
 * Used in Purchase Invoice flow: Supplier → Product Category → Subcategory → Product
 * 
 * FIX: Fallback to category-level products if subcategory is selected but products 
 * are not yet mapped to it (subcategory_id is NULL on Product record).
 */
export function usePurchaseProductsByCategory(productCategoryId, supplierId, subcategoryId) {
  const { activeRestaurantId, activeRestaurant } = useTenant();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['purchase_products_filtered', productCategoryId, supplierId, subcategoryId, activeRestaurantId, activeRestaurant?.business_type, activeRestaurant?.business_mode],
    queryFn: async () => {
      // If no category or supplier, return empty
      if (!activeRestaurantId || (!productCategoryId && !supplierId)) return [];

      const filter = {
        ...restaurantMaterialFilter(activeRestaurant),
        ...(activeRestaurantId && { restaurant_id: activeRestaurantId }),
        ...(supplierId && { supplier_id: supplierId }),
      };

      // 1. Try fetching with specific subcategory if provided
      if (subcategoryId) {
        const subFilter = { ...filter, subcategory_id: subcategoryId };
        const subProducts = await base44.entities.Product.filter(subFilter, 'name', 1000);
        
        // If products found for subcategory, return them
        if (subProducts && subProducts.length > 0) {
          return subProducts;
        }
        
        // 2. If no products for subcategory, fallback to parent category
        // but ONLY if the products actually belong to this parent category.
        // This prevents the "disappearing products" bug when subcategory_id is NULL.
        if (productCategoryId) {
          const catFilter = { ...filter, category_id: productCategoryId };
          return base44.entities.Product.filter(catFilter, 'name', 1000);
        }
      }

      // 3. Standard category-only filtering
      if (productCategoryId) {
        filter.category_id = productCategoryId;
      }

      return base44.entities.Product.filter(filter, 'name', 1000);
    },
    enabled: !!activeRestaurantId && !!(productCategoryId || supplierId),
    staleTime: 30000,
  });

  return { products, isLoading };
}
