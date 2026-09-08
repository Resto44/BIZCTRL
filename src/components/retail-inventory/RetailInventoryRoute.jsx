import React from 'react';
import { useTenant } from '@/lib/TenantContext';
import { isSupermarketProductPortal } from '@/lib/productImportAccess';
import RetailPOSPortalGuard from '@/components/retail-pos/RetailPOSPortalGuard';
import RetailInventory from '@/pages/retail/inventory/RetailInventory';
export default function RetailInventoryRoute({ page = 'overview', scanOnOpen = false, fallback = null }) {
  const { activeRestaurant, loadingRestaurants } = useTenant();
  if (loadingRestaurants) return <div className="h-64 animate-pulse rounded-3xl bg-muted" />;
  if (fallback && !isSupermarketProductPortal(activeRestaurant)) return fallback;
  return <RetailPOSPortalGuard><RetailInventory page={page} scanOnOpen={scanOnOpen} /></RetailPOSPortalGuard>;
}
