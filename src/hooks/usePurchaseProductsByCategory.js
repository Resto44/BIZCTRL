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

      // Product Master records a *primary* supplier. A product can legally be
      // purchased from another supplier, so the invoice supplier must not make
      // all existing products disappear when their primary supplier is missing.
      // Always enforce tenant/material/category scope before supplier fallback.
      const baseFilter = {
        ...restaurantMaterialFilter(activeRestaurant),
        restaurant_id: activeRestaurantId,
        ...(productCategoryId && { category_id: productCategoryId }),
      };
      const fetchCatalog = async (filter) => {
        if (subcategoryId) {
          const subProducts = await base44.entities.Product.filter(
            { ...filter, subcategory_id: subcategoryId }, 'name', 1000,
          );
          if (subProducts?.length) return subProducts;
          // Some valid master products lack subcategory_id; keep parent scope.
        }
        return base44.entities.Product.filter(filter, 'name', 1000);
      };
      if (!supplierId) return fetchCatalog(baseFilter);

      const supplierProducts = await fetchCatalog({ ...baseFilter, supplier_id: supplierId });
      if (supplierProducts?.length) return supplierProducts;
      // Tenant/category-scoped alternative suppliers are allowed; the actual
      // payable supplier remains the explicit supplier chosen on this invoice.
      return fetchCatalog(baseFilter);
    },
    enabled: !!activeRestaurantId && !!(productCategoryId || supplierId),
    staleTime: 30000,
  });

  return { products, isLoading };
}
