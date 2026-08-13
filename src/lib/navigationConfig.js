/**
 * Navigation Configuration — Business Mode Aware
 *
 * Defines all navigation items with their mode requirements.
 * The AppHeader and BottomNav use this config to render the correct
 * navigation items based on the active business mode.
 *
 * mode: 'all'        — visible in both Restaurant and Retail modes
 * mode: 'restaurant' — visible only in Restaurant mode
 * mode: 'retail'     — visible only in Retail mode
 */

import {
  LayoutDashboard, ShoppingCart, Package, Users, Truck,
  DollarSign, CreditCard, BarChart3, Settings, Bell,
  ChefHat, UtensilsCrossed, Bike, Trash2, Factory,
  Barcode, Tags, Layers, Calendar, ShieldCheck,
  Building2, Globe, Wallet, Receipt, FileText,
  TrendingUp, Zap, Network, AlertTriangle,
  Store, BookOpen, Boxes, ScanLine, Hash,
  ClipboardList, ArrowLeftRight, Banknote, Clock, Handshake,
} from 'lucide-react';

// ── Navigation Groups ─────────────────────────────────────────────────────────

export const NAV_GROUPS = {
  CORE:       'Core',
  OPERATIONS: 'Operations',
  RESTAURANT: 'Restaurant',
  RETAIL:     'Retail',
  FINANCE:    'Finance',
  ANALYTICS:  'Analytics & Reports',
  SETTINGS:   'Settings',
};

// ── Full Navigation Registry ──────────────────────────────────────────────────
// Each item: { path, label, icon, mode, group, permission }

export const ALL_NAV_ITEMS = [

  // ── CORE (Shared) ──────────────────────────────────────────────────────────
  {
    path: '/owner-command-center',
    label: 'Dashboard',
    icon: LayoutDashboard,
    mode: 'all',
    group: NAV_GROUPS.CORE,
    permission: 'viewDashboard',
    pinned: true,
  },
  {
    path: '/branch-management',
    label: 'Branches',
    icon: Building2,
    mode: 'all',
    group: NAV_GROUPS.CORE,
    permission: 'viewBrandSettings',
  },
  {
    path: '/employees',
    label: 'Employees',
    icon: Users,
    mode: 'all',
    group: NAV_GROUPS.CORE,
    permission: 'viewEmployees',
  },
  {
    path: '/customer-management',
    label: 'Customers',
    icon: Users,
    mode: 'all',
    group: NAV_GROUPS.CORE,
    permission: 'viewDebts',
  },
  {
    path: '/suppliers',
    label: 'Suppliers',
    icon: Truck,
    mode: 'all',
    group: NAV_GROUPS.CORE,
    permission: 'viewPurchases',
  },

  // ── OPERATIONS (Shared) ────────────────────────────────────────────────────
  {
    path: '/products',
    label: 'Products',
    icon: Package,
    mode: 'all',
    group: NAV_GROUPS.OPERATIONS,
    permission: 'viewInventory',
  },
  {
    path: '/inventory',
    label: 'Inventory',
    icon: Boxes,
    mode: 'all',
    group: NAV_GROUPS.OPERATIONS,
    permission: 'viewInventory',
    pinned: true,
  },
  {
    path: '/purchases',
    label: 'Purchases',
    icon: ShoppingCart,
    mode: 'all',
    group: NAV_GROUPS.OPERATIONS,
    permission: 'viewPurchases',
  },
  {
    path: '/purchase-orders',
    label: 'Purchase Orders',
    icon: ClipboardList,
    mode: 'all',
    group: NAV_GROUPS.OPERATIONS,
    permission: 'viewPurchases',
  },
  {
    path: '/sales',
    label: 'Sales',
    icon: Receipt,
    mode: 'all',
    group: NAV_GROUPS.OPERATIONS,
    permission: 'viewSales',
    pinned: true,
  },
  {
    path: '/cash-register',
    label: 'Cash Register',
    icon: CreditCard,
    mode: 'all',
    group: NAV_GROUPS.OPERATIONS,
    permission: 'viewSales',
  },
  {
    path: '/inventory-waste',
    label: 'Waste',
    icon: Trash2,
    mode: 'all',
    group: NAV_GROUPS.OPERATIONS,
    permission: 'viewInventory',
  },
  {
    path: '/inventory-transfer',
    label: 'Transfers',
    icon: ArrowLeftRight,
    mode: 'all',
    group: NAV_GROUPS.OPERATIONS,
    permission: 'viewInventory',
  },

  // ── RESTAURANT MODE ────────────────────────────────────────────────────────
  {
    path: '/menu-products',
    label: 'Menu',
    icon: BookOpen,
    mode: 'restaurant',
    group: NAV_GROUPS.RESTAURANT,
    permission: 'viewDelivery',
    pinned: true,
  },
  {
    path: '/recipes',
    label: 'Recipes / BOM',
    icon: ChefHat,
    mode: 'restaurant',
    group: NAV_GROUPS.RESTAURANT,
    permission: 'viewInventory',
  },
  {
    path: '/recipe-food-costing',
    label: 'Food Cost',
    icon: TrendingUp,
    mode: 'restaurant',
    group: NAV_GROUPS.RESTAURANT,
    permission: 'viewReports',
  },
  {
    path: '/reservation-table-management',
    label: 'Tables',
    icon: UtensilsCrossed,
    mode: 'restaurant',
    group: NAV_GROUPS.RESTAURANT,
    permission: 'viewSales',
    pinned: true,
  },
  {
    path: '/order-management',
    label: 'Orders',
    icon: ClipboardList,
    mode: 'restaurant',
    group: NAV_GROUPS.RESTAURANT,
    permission: 'viewSales',
  },
  {
    path: '/delivery',
    label: 'Delivery',
    icon: Bike,
    mode: 'restaurant',
    group: NAV_GROUPS.RESTAURANT,
    permission: 'viewDelivery',
  },
  {
    path: '/online-ordering',
    label: 'Online Ordering',
    icon: Globe,
    mode: 'restaurant',
    group: NAV_GROUPS.RESTAURANT,
    permission: 'viewSales',
  },
  {
    path: '/production',
    label: 'Production',
    icon: Factory,
    mode: 'restaurant',
    group: NAV_GROUPS.RESTAURANT,
    permission: 'viewInventory',
  },

  // ── RETAIL MODE ────────────────────────────────────────────────────────────
  {
    path: '/retail/barcode',
    label: 'Barcode',
    icon: Barcode,
    mode: 'retail',
    group: NAV_GROUPS.RETAIL,
    permission: 'viewInventory',
    pinned: true,
  },
  {
    path: '/retail/sku',
    label: 'SKU Management',
    icon: Hash,
    mode: 'retail',
    group: NAV_GROUPS.RETAIL,
    permission: 'viewInventory',
  },
  {
    path: '/retail/variants',
    label: 'Product Variants',
    icon: Layers,
    mode: 'retail',
    group: NAV_GROUPS.RETAIL,
    permission: 'viewInventory',
  },
  {
    path: '/retail/batches',
    label: 'Batch / Lot Tracking',
    icon: Tags,
    mode: 'retail',
    group: NAV_GROUPS.RETAIL,
    permission: 'viewInventory',
    pinned: true,
  },
  {
    path: '/retail/expiry',
    label: 'Expiry Tracking',
    icon: Calendar,
    mode: 'retail',
    group: NAV_GROUPS.RETAIL,
    permission: 'viewInventory',
  },
  {
    path: '/retail/serials',
    label: 'Serial Numbers',
    icon: ScanLine,
    mode: 'retail',
    group: NAV_GROUPS.RETAIL,
    permission: 'viewInventory',
  },

  // ── FINANCE (Shared) ───────────────────────────────────────────────────────
  {
    path: '/treasury',
    label: 'Treasury',
    icon: Wallet,
    mode: 'all',
    group: NAV_GROUPS.FINANCE,
    permission: 'viewTreasury',
  },
  {
    path: '/expenses',
    label: 'Expenses',
    icon: DollarSign,
    mode: 'all',
    group: NAV_GROUPS.FINANCE,
    permission: 'viewExpenses',
  },
  {
    path: '/network-management',
    label: 'Network Settlement',
    icon: Network,
    mode: 'all',
    group: NAV_GROUPS.FINANCE,
    permission: 'viewNetworkAccounts',
  },
  {
    path: '/debt-management',
    label: 'Debt Management',
    icon: Banknote,
    mode: 'all',
    group: NAV_GROUPS.FINANCE,
    permission: 'viewDebts',
  },
  {
    path: '/profit-loss',
    label: 'Profit & Loss',
    icon: TrendingUp,
    mode: 'all',
    group: NAV_GROUPS.FINANCE,
    permission: 'viewReports',
  },
  {
    path: '/payroll',
    label: 'Payroll',
    icon: Users,
    mode: 'all',
    group: NAV_GROUPS.FINANCE,
    permission: 'viewPayroll',
  },

  // ── ANALYTICS (Shared) ─────────────────────────────────────────────────────
  {
    path: '/reports',
    label: 'Reports',
    icon: BarChart3,
    mode: 'all',
    group: NAV_GROUPS.ANALYTICS,
    permission: 'viewReports',
  },
  {
    path: '/sales-dashboard',
    label: 'Sales Analytics',
    icon: TrendingUp,
    mode: 'all',
    group: NAV_GROUPS.ANALYTICS,
    permission: 'viewReports',
  },
  {
    path: '/ai-copilot',
    label: 'AI Analytics',
    icon: Zap,
    mode: 'all',
    group: NAV_GROUPS.ANALYTICS,
    permission: 'viewReports',
  },
  {
    path: '/alerts',
    label: 'Alerts',
    icon: AlertTriangle,
    mode: 'all',
    group: NAV_GROUPS.ANALYTICS,
    permission: 'viewAlerts',
  },

  // ── APPROVALS & SUPPLIER PORTAL ─────────────────────────────────────────────
  {
    path: '/approval-center',
    label: 'Approval Center',
    icon: Clock,
    mode: 'all',
    group: NAV_GROUPS.SETTINGS,
    permission: 'manageSettings',
  },
  {
    path: '/supplier-portal',
    label: 'Supplier Portal',
    icon: Handshake,
    mode: 'all',
    group: NAV_GROUPS.CORE,
    permission: 'viewSuppliers',
  },

  // ── SETTINGS (Shared) ──────────────────────────────────────────────────────
  {
    path: '/settings',
    label: 'Settings',
    icon: Settings,
    mode: 'all',
    group: NAV_GROUPS.SETTINGS,
    permission: 'manageSettings',
  },
  {
    path: '/notifications',
    label: 'Notifications',
    icon: Bell,
    mode: 'all',
    group: NAV_GROUPS.SETTINGS,
    permission: 'viewAlerts',
  },
  {
    path: '/brand',
    label: 'Brand Settings',
    icon: Store,
    mode: 'all',
    group: NAV_GROUPS.SETTINGS,
    permission: 'viewBrandSettings',
  },
];

/**
 * Get navigation items filtered by business mode.
 * @param {string} mode - 'restaurant' | 'retail'
 * @returns {Array} Filtered nav items
 */
export function getNavItemsForMode(mode) {
  return ALL_NAV_ITEMS.filter(item => item.mode === 'all' || item.mode === mode);
}

/**
 * Get pinned (bottom nav) items for a given mode.
 * @param {string} mode - 'restaurant' | 'retail'
 * @returns {Array} Pinned nav items (max 5)
 */
export function getPinnedNavItems(mode) {
  return ALL_NAV_ITEMS
    .filter(item => item.pinned && (item.mode === 'all' || item.mode === mode))
    .slice(0, 5);
}

/**
 * Get nav items grouped by section for a given mode.
 * @param {string} mode - 'restaurant' | 'retail'
 * @returns {Object} Items grouped by NAV_GROUPS key
 */
export function getGroupedNavItems(mode) {
  const items = getNavItemsForMode(mode);
  return items.reduce((groups, item) => {
    const group = item.group || NAV_GROUPS.CORE;
    if (!groups[group]) groups[group] = [];
    groups[group].push(item);
    return groups;
  }, {});
}

export default ALL_NAV_ITEMS;
