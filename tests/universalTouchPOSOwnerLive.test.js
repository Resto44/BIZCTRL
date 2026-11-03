import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  COMMERCE_POS_PORTALS, businessPOSControlPath, businessTouchPosPath,
  isCommercePOSPortal, isRestaurantPOSPortal, isSupermarketProductPortal,
} from '../src/lib/productImportAccess.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Universal touch POS and Owner live cashiers', () => {
  it('supports all requested business portals with the right stock or kitchen engine', () => {
    for (const mode of ['restaurant', 'cafe']) {
      expect(isRestaurantPOSPortal({ business_type: mode })).toBe(true);
      expect(businessTouchPosPath({ business_type: mode })).toBe('/restaurant/pos');
      expect(businessPOSControlPath({ business_type: mode })).toBe('/owner-command-center');
      expect(isCommercePOSPortal({ business_type: mode })).toBe(false);
    }
    expect(COMMERCE_POS_PORTALS).toEqual([
      'retail','supermarket','warehouse','wholesale','factory','pharmacy','clinic','services','other',
    ]);
    for (const mode of COMMERCE_POS_PORTALS) {
      expect(isCommercePOSPortal({business_type:mode})).toBe(true);
      expect(businessTouchPosPath({business_type:mode})).toBe('/retail/cashier');
      expect(businessPOSControlPath({business_type:mode})).toBe('/retail/pos-control');
    }
    expect(isSupermarketProductPortal({business_type:'warehouse'})).toBe(false);
    expect(isSupermarketProductPortal({business_type:'services'})).toBe(false);
    expect(isSupermarketProductPortal({business_type:'retail'})).toBe(true);
    expect(businessTouchPosPath({ business_type:'unknown' })).toBe(null);
  });

  it('routes every POS portal through the existing authorized cashier and touch engines', () => {
    const app = read('../src/App.jsx');
    const router = read('../src/components/pos-touch/UniversalTouchPOSRoute.jsx');
    const guard = read('../src/components/retail-pos/RetailPOSPortalGuard.jsx');
    const restaurant = read('../src/pages/restaurant/RestaurantPOS.jsx');
    const cashier = read('../src/pages/retail/pos/RetailCashier.jsx');
    const sidebar = read('../src/components/layout/ERPSidebar.jsx');
    const bottom = read('../src/components/layout/BottomNav.jsx');
    expect(app).toContain('path="/pos" element={<RoleGuard permission="uploadSales"><UniversalTouchPOSRoute /></RoleGuard>}');
    expect(app).toContain('path="/pos/stock" element={<RoleGuard permission="viewInventory">');
    expect(router).toContain('businessTouchPosPath(activeRestaurant)');
    expect(guard).toContain('isCommercePOSPortal(activeRestaurant)');
    expect(restaurant).toContain('TouchWorkspace kind="restaurant"');
    expect(cashier).toContain('TouchWorkspace kind="retail"');
    expect(sidebar).toContain("key: 'universal-touch-pos'");
    expect(bottom).toContain("availablePaths.has('/pos')");
    expect(bottom).toContain("item.path !== '/retail/cashier' || commerce");
  });

  it('only records commerce sales with existing atomic stock and posted payment controls', () => {
    const cashier = read('../src/hooks/useRetailCashier.js');
    const stock = read('../src/hooks/useRetailInventory.js');
    const migrations = read('../supabase/migrations/20260908145513_retail_cashier_checkout.sql');
    expect(cashier).toContain("p_request_id: request.id");
    expect(cashier).toContain("command: 'new_sale'");
    expect(stock).toContain('isCommercePOSPortal(activeRestaurant)');
    expect(migrations).toContain("retail_checkout_private.command");
    expect(migrations).toContain('reserved');
    expect(migrations).toContain('erp_retail_pos_record_transaction');
  });

  it('shows Owner live sales by actual cashier shifts, never sums arbitrary cashier labels', () => {
    const owner = read('../src/pages/OwnerDashboard.jsx');
    const card = read('../src/components/dashboard/OwnerUniversalPOS.jsx');
    const food = read('../src/components/dashboard/OwnerRestaurantPOS.jsx');
    const sql = read('../supabase/migrations/20261103121500_universal_touch_pos_scope_owner_cashier_monitor.sql');
    expect(owner).toContain('<OwnerUniversalPOS restaurant={activeRestaurant}');
    expect(card).toContain("supabase.rpc('erp_commerce_pos_owner_cashiers'");
    expect(food).toContain("supabase.rpc('erp_restaurant_pos_owner_cashiers'");
    expect(card).toContain('refetchInterval: 10000');
    expect(card).toContain('control.lastEventAt');
    expect(card).toContain('cashiers.data?.cashiers');
    expect(food).toContain('cashierQuery.data.cashiers');
    expect(sql).toContain("sale.shift_id");
    expect(sql).toContain("membership.role='owner'");
    expect(sql).toContain("membership.status='approved'");
    expect(sql).toContain('erp_subscription_has_erp_access');
    expect(sql).toContain("sale.status IN ('posted','approved')");
    expect(sql).toContain("sale.transaction_type IN ('refund','void')");
    expect(sql).toContain("shift.cashier_name");
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.erp_commerce_pos_owner_cashiers');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.erp_restaurant_pos_owner_cashiers');
  });

  it('broadens only POS portal admission without weakening existing role, branch or inventory validations', () => {
    const sql = read('../supabase/migrations/20261103121500_universal_touch_pos_scope_owner_cashier_monitor.sql');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.erp_retail_pos_portal_allowed');
    expect(sql).toContain("'warehouse','wholesale','factory','pharmacy','clinic','services','other'");
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\s+TABLE\b/i);
    expect(sql).not.toContain('ALTER TABLE public.retail_pos_transactions');
    expect(sql).not.toContain('GRANT INSERT');
    const guard = read('../src/components/retail-pos/RetailPOSPortalGuard.jsx');
    expect(guard).toContain('Navigate');
  });
});
