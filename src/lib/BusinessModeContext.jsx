/**
 * BusinessModeContext — Multi-Business Mode Engine
 *
 * This context is the single source of truth for the active business mode.
 * It reads the business_mode from the currently active restaurant/tenant
 * and provides it to the entire component tree.
 *
 * Architecture Rules:
 *   - All mode-specific behavior MUST be driven by this context.
 *   - No component may hard-code restaurant or retail behavior.
 *   - Inventory Service reads this context to determine consumption logic.
 *   - Dashboard reads this context to load the correct widget set.
 *   - Navigation reads this context to show/hide mode-specific routes.
 *
 * Business Modes:
 *   'restaurant' — ERP sales, inventory, purchasing, finance, and people operations
 *   'cafe'       — ERP sales, inventory, purchasing, finance, and people operations
 *   'retail'     — Barcode, SKU, Variants, Batch/Lot, Expiry, Serial Numbers
 *   'warehouse'  — Inventory, transfers, batch tracking, no POS
 *   'factory'    — Raw-material and finished-goods inventory operations
 *   'pharmacy'   — Expiry tracking, serial numbers, prescriptions
 *   'clinic'     — Appointments, services, medical inventory
 *   'wholesale'  — Bulk orders, price tiers, large POs
 *   'services'   — Service billing, time tracking, job orders
 *   'other'      — Generic ERP mode
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useTenant } from '@/lib/TenantContext';

// ── Constants ─────────────────────────────────────────────────────────────────
export const BUSINESS_MODES = {
  RESTAURANT: 'restaurant',
  CAFE:       'cafe',
  RETAIL:     'retail',
  WAREHOUSE:  'warehouse',
  FACTORY:    'factory',
  PHARMACY:   'pharmacy',
  CLINIC:     'clinic',
  WHOLESALE:  'wholesale',
  SERVICES:   'services',
  OTHER:      'other',
};

// Business types that use restaurant-style inventory (menu and recipe workflows)
export const RESTAURANT_LIKE_MODES = ['restaurant', 'cafe'];

// Business types that use retail-style inventory (non-restaurant)
export const RETAIL_LIKE_MODES = ['retail', 'warehouse', 'wholesale', 'pharmacy', 'clinic', 'factory', 'services', 'other'];

// ── Mode Metadata ─────────────────────────────────────────────────────────────
export const BUSINESS_MODE_META = {
  restaurant: { label: 'Restaurant',  icon: '🍽️', color: 'orange' },
  cafe:       { label: 'Café',        icon: '☕', color: 'amber' },
  retail:     { label: 'Retail',      icon: '🛍️', color: 'blue' },
  warehouse:  { label: 'Warehouse',   icon: '🏭', color: 'slate' },
  factory:    { label: 'Factory',     icon: '⚙️', color: 'gray' },
  pharmacy:   { label: 'Pharmacy',    icon: '💊', color: 'green' },
  clinic:     { label: 'Clinic',      icon: '🏥', color: 'teal' },
  wholesale:  { label: 'Wholesale',   icon: '📦', color: 'purple' },
  services:   { label: 'Services',    icon: '🔧', color: 'yellow' },
  other:      { label: 'Business',    icon: '🏢', color: 'pink' },
};

// ── Module Registry ───────────────────────────────────────────────────────────
// Each module declares which modes it is available in.
// 'all' = shared, available in all modes.
export const MODULE_REGISTRY = {
  // ── Shared Modules (always available) ──────────────────────────────────────
  authentication:        { modes: 'all', label: 'Authentication' },
  dashboard:             { modes: 'all', label: 'Owner Dashboard' },
  branch_management:     { modes: 'all', label: 'Branch Management' },
  employee_management:   { modes: 'all', label: 'Employee Management' },
  customer_management:   { modes: 'all', label: 'Customer Management' },
  supplier_management:   { modes: 'all', label: 'Supplier Management' },
  product_management:    { modes: 'all', label: 'Product Management' },
  inventory:             { modes: 'all', label: 'Inventory' },
  purchase:              { modes: 'all', label: 'Purchase' },
  sales:                 { modes: 'all', label: 'Sales' },
  treasury:              { modes: 'all', label: 'Treasury' },
  cash_register:         { modes: 'all', label: 'Cash Register' },
  network_settlement:    { modes: 'all', label: 'Network Settlement' },
  expenses:              { modes: 'all', label: 'Expenses' },
  accounting:            { modes: 'all', label: 'Accounting' },
  reports:               { modes: 'all', label: 'Reports' },
  notifications:         { modes: 'all', label: 'Notifications' },
  ai_analytics:          { modes: 'all', label: 'AI Analytics' },
  multi_branch:          { modes: 'all', label: 'Multi-Branch' },
  multi_currency:        { modes: 'all', label: 'Multi-Currency' },
  multi_language:        { modes: 'all', label: 'Multi-Language' },
  approval_center:       { modes: 'all', label: 'Approval Center' },
  supplier_portal:       { modes: 'all', label: 'Supplier Portal' },

  // ── Retail / Warehouse / Wholesale Mode Modules ─────────────────────────────
  barcode:               { modes: ['retail', 'warehouse', 'wholesale', 'pharmacy'], label: 'Barcode' },
  sku_management:        { modes: ['retail', 'warehouse', 'wholesale', 'pharmacy'], label: 'SKU Management' },
  product_variants:      { modes: ['retail', 'wholesale'], label: 'Product Variants' },
  batch_lot_tracking:    { modes: ['retail', 'warehouse', 'wholesale', 'pharmacy', 'factory'], label: 'Batch / Lot Tracking' },
  expiry_tracking:       { modes: ['retail', 'pharmacy', 'clinic', 'wholesale'], label: 'Expiry Tracking' },
  serial_numbers:        { modes: ['retail', 'pharmacy', 'clinic'], label: 'Serial Numbers' },
  direct_inventory:      { modes: ['retail', 'warehouse', 'wholesale', 'factory', 'pharmacy', 'clinic', 'services', 'other'], label: 'Direct Inventory' },
};

// ── Context ───────────────────────────────────────────────────────────────────
const BusinessModeContext = createContext({
  activeMode: BUSINESS_MODES.RESTAURANT,
  isRestaurant: true,
  isRetail: false,
  isRestaurantLike: true,
  isRetailLike: false,
  isModuleEnabled: () => true,
  getModulesForMode: () => [],
  setMode: async () => {},
  modeLabel: 'Restaurant',
  modeIcon: '🍽️',
  modeColor: 'orange',
});

// ── Provider ──────────────────────────────────────────────────────────────────
export function BusinessModeProvider({ children }) {
  const { activeRestaurant, updateRestaurant } = useTenant();

  const activeMode = useMemo(() => {
    return activeRestaurant?.business_mode || BUSINESS_MODES.RESTAURANT;
  }, [activeRestaurant?.business_mode]);

  const setMode = async (mode) => {
    if (!activeRestaurant?.id) return;
    await updateRestaurant(activeRestaurant.id, { business_mode: mode });
  };

  const isRestaurant     = activeMode === BUSINESS_MODES.RESTAURANT;
  const isRetail         = activeMode === BUSINESS_MODES.RETAIL;
  const isRestaurantLike = RESTAURANT_LIKE_MODES.includes(activeMode);
  const isRetailLike     = RETAIL_LIKE_MODES.includes(activeMode);

  /**
   * Check if a specific module is enabled for the current business mode.
   * @param {string} moduleKey - Key from MODULE_REGISTRY
   * @returns {boolean}
   */
  const isModuleEnabled = (moduleKey) => {
    const mod = MODULE_REGISTRY[moduleKey];
    if (!mod) return false;
    if (mod.modes === 'all') return true;
    if (Array.isArray(mod.modes)) return mod.modes.includes(activeMode);
    return mod.modes === activeMode;
  };

  /**
   * Get all modules available for the current mode.
   * @returns {Array<{key: string, label: string}>}
   */
  const getModulesForMode = () => {
    return Object.entries(MODULE_REGISTRY)
      .filter(([, mod]) => {
        if (mod.modes === 'all') return true;
        if (Array.isArray(mod.modes)) return mod.modes.includes(activeMode);
        return mod.modes === activeMode;
      })
      .map(([key, mod]) => ({ key, label: mod.label }));
  };

  const meta = BUSINESS_MODE_META[activeMode] || BUSINESS_MODE_META.other;
  const modeLabel = meta.label;
  const modeIcon  = meta.icon;
  const modeColor = meta.color;

  const value = useMemo(() => ({
    activeMode,
    isRestaurant,
    isRetail,
    isRestaurantLike,
    isRetailLike,
    isModuleEnabled,
    getModulesForMode,
    setMode,
    modeLabel,
    modeIcon,
    modeColor,
  }), [activeMode, isRestaurant, isRetail, isRestaurantLike, isRetailLike, setMode]);

  return (
    <BusinessModeContext.Provider value={value}>
      {children}
    </BusinessModeContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useBusinessMode() {
  return useContext(BusinessModeContext);
}

// ── HOC: withModeGuard ────────────────────────────────────────────────────────
/**
 * Higher-order component that renders a fallback if the current mode
 * does not match the required mode.
 */
export function withModeGuard(Component, requiredMode, FallbackComponent = null) {
  return function ModeGuardedComponent(props) {
    const { activeMode } = useBusinessMode();
    if (activeMode !== requiredMode) {
      return FallbackComponent ? <FallbackComponent /> : null;
    }
    return <Component {...props} />;
  };
}

// ── ModeGuard Component ───────────────────────────────────────────────────────
/**
 * Conditionally renders children based on business mode.
 *
 * Usage:
 *   <ModeGuard mode="restaurant">
 *     <DeliveryOrders />
 *   </ModeGuard>
 *
 *   <ModeGuard mode={['retail', 'warehouse']}>
 *     <BarcodeScanner />
 *   </ModeGuard>
 *
 *   <ModeGuard mode="all">
 *     <SharedComponent />
 *   </ModeGuard>
 *
 *   <ModeGuard mode="restaurant-like">
 *     <MenuPage />
 *   </ModeGuard>
 */
export function ModeGuard({ mode, children, fallback = null }) {
  const { activeMode, isRestaurantLike, isRetailLike } = useBusinessMode();
  if (mode === 'all') return children;
  if (mode === 'restaurant-like') return isRestaurantLike ? children : fallback;
  if (mode === 'retail-like') return isRetailLike ? children : fallback;
  if (Array.isArray(mode)) return mode.includes(activeMode) ? children : fallback;
  if (activeMode !== mode) return fallback;
  return children;
}

export default BusinessModeContext;
