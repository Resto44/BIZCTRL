/**
 * BottomNav — Business Mode Aware Navigation
 *
 * The bottom navigation adapts to the active business mode.
 * Restaurant Mode shows: Dashboard, Treasury, Product Management, Debt Management, More
 * Retail Mode shows:     Dashboard, Treasury, Inventory, Barcode, More
 *
 * The "More" menu also filters items by business mode.
 */

import React, { memo, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Receipt, BarChart3, Wallet, Users, Truck,
  ClipboardList, UserCheck, Bot, Building2,
  Package, CreditCard, ShoppingCart, Star, Grid3x3, X,
  TrendingUp, Calendar, Zap, Barcode, Boxes, Tags,
  ScanLine, Hash, Layers, ShieldCheck,
} from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useRole, ROLES } from '@/lib/RoleContext';
import { useBusinessMode } from '@/lib/BusinessModeContext';

// ── Primary Nav by Role + Mode ────────────────────────────────────────────────

const PRIMARY_NAV_OWNER_RESTAURANT = [
  { path: '/owner-command-center', icon: LayoutDashboard, labelKey: 'dashboard' },
  { path: '/treasury',              icon: Wallet,           labelKey: 'treasury' },
  { path: '/product-management',    icon: Package,          labelKey: 'product_management' },
  { path: '/debt-management',       icon: CreditCard,       labelKey: 'debt_management' },
  { path: '/more',                 icon: Grid3x3,          labelKey: 'more', isMore: true },
];

const PRIMARY_NAV_OWNER_RETAIL = [
  { path: '/owner-command-center', icon: LayoutDashboard, labelKey: 'dashboard' },
  { path: '/treasury',              icon: Wallet,           labelKey: 'treasury' },
  { path: '/inventory',            icon: Boxes,            labelKey: 'inventory' },
  { path: '/retail/barcode',       icon: Barcode,          labelKey: 'barcode' },
  { path: '/more',                 icon: Grid3x3,          labelKey: 'more', isMore: true },
];

const PRIMARY_NAV_MANAGER_RESTAURANT = [
  { path: '/manager-dashboard',    icon: LayoutDashboard, labelKey: 'dashboard' },
  { path: '/treasury',              icon: Wallet,          labelKey: 'treasury' },
  { path: '/product-management',    icon: Package,         labelKey: 'product_management' },
  { path: '/debt-management',       icon: CreditCard,      labelKey: 'debt_management' },
  { path: '/more',                 icon: Grid3x3,         labelKey: 'more', isMore: true },
];

const PRIMARY_NAV_MANAGER_RETAIL = [
  { path: '/manager-dashboard',    icon: LayoutDashboard, labelKey: 'dashboard' },
  { path: '/treasury',              icon: Wallet,          labelKey: 'treasury' },
  { path: '/inventory',            icon: Boxes,           labelKey: 'inventory' },
  { path: '/retail/barcode',       icon: Barcode,         labelKey: 'barcode' },
  { path: '/more',                 icon: Grid3x3,         labelKey: 'more', isMore: true },
];

const PRIMARY_NAV_GENERAL_MANAGER = [
  { path: '/gm-dashboard',         icon: LayoutDashboard, labelKey: 'dashboard' },
  { path: '/reports',              icon: BarChart3,       labelKey: 'reports' },
  { path: '/employees',            icon: Users,           labelKey: 'employees' },
  { path: '/more',                 icon: Grid3x3,         labelKey: 'more', isMore: true },
];

// Role-specific navs (not mode-dependent)
const PRIMARY_NAV_EMPLOYEE = [
  { path: '/employee-dashboard',   icon: LayoutDashboard, labelKey: 'dashboard' },
  { path: '/employee-attendance',  icon: UserCheck,       labelKey: 'attendance' },
  { path: '/tasks',                icon: ClipboardList,   labelKey: 'tasks' },
];
const PRIMARY_NAV_SPONSOR = [
  { path: '/erp-login',            icon: LayoutDashboard, labelKey: 'dashboard' },
];
const PRIMARY_NAV_CUSTOMER = [];

// ── More Menu Sections ────────────────────────────────────────────────────────

const MORE_SECTIONS_OWNER_RESTAURANT = [
  {
    title: 'Approvals',
    items: [
      { path: '/erp-approval-center',       icon: ShieldCheck, labelKey: 'approval_center' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { path: '/cash-register',             icon: CreditCard,  labelKey: 'cash_register' },
      { path: '/sales/invoices',            icon: Receipt,     labelKey: 'sales_invoices' },
      { path: '/inventory',                 icon: Package,     labelKey: 'inventory' },
      { path: '/product-management',        icon: Package,     labelKey: 'product_management' },
      { path: '/inventory-waste',           icon: Package,     labelKey: 'waste_tracking' },
      { path: '/purchases',                 icon: ShoppingCart, labelKey: 'purchases' },
      { path: '/suppliers',                 icon: Truck,       labelKey: 'suppliers' },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { path: '/network-management',        icon: Building2,   labelKey: 'network_management' },
      { path: '/bi-center',                 icon: BarChart3,   labelKey: 'bi_center' },
      { path: '/reports',                   icon: TrendingUp,  labelKey: 'reports' },
      { path: '/profit-loss',               icon: Wallet,      labelKey: 'profit_loss' },
      { path: '/ai-copilot',                icon: Bot,         labelKey: 'ai_copilot' },
    ],
  },
  {
    title: 'People & Finance',
    items: [
      { path: '/employees',                 icon: Users,       labelKey: 'employees' },
      { path: '/staff-invitations',         icon: UserCheck,   labelKey: 'staff_invitations' },
      { path: '/customer-management',       icon: Star,        labelKey: 'customer_management' },
      { path: '/driver-management',         icon: Truck,       labelKey: 'driver_management' },
      { path: '/debt-management',           icon: CreditCard,  labelKey: 'debt_management' },
      { path: '/treasury',                  icon: Wallet,      labelKey: 'treasury' },
      { path: '/payroll',                   icon: Receipt,     labelKey: 'payroll' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { path: '/settings',                  icon: Zap,         labelKey: 'settings' },
      { path: '/branch-management',         icon: Building2,   labelKey: 'branches' },
      { path: '/billing',                   icon: CreditCard,  labelKey: 'billing' },
    ],
  },
];

const MORE_SECTIONS_OWNER_RETAIL = [
  {
    title: 'Approvals',
    items: [
      { path: '/erp-approval-center',       icon: ShieldCheck, labelKey: 'approval_center' },
    ],
  },
  {
    title: 'Retail',
    items: [
      { path: '/retail/barcode',            icon: Barcode,     labelKey: 'barcode' },
      { path: '/retail/sku',                icon: Hash,        labelKey: 'sku_management' },
      { path: '/retail/variants',           icon: Layers,      labelKey: 'product_variants' },
      { path: '/retail/batches',            icon: Tags,        labelKey: 'batch_tracking' },
      { path: '/retail/expiry',             icon: Calendar,    labelKey: 'expiry_tracking' },
      { path: '/retail/serials',            icon: ScanLine,    labelKey: 'serial_numbers' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { path: '/cash-register',             icon: CreditCard,  labelKey: 'cash_register' },
      { path: '/sales/invoices',            icon: Receipt,     labelKey: 'sales_invoices' },
      { path: '/inventory',                 icon: Boxes,       labelKey: 'inventory' },
      { path: '/product-management',        icon: Package,     labelKey: 'product_management' },
      { path: '/purchases',                 icon: ShoppingCart, labelKey: 'purchases' },
      { path: '/suppliers',                 icon: Truck,       labelKey: 'suppliers' },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { path: '/network-management',        icon: Building2,   labelKey: 'network_management' },
      { path: '/reports',                   icon: TrendingUp,  labelKey: 'reports' },
      { path: '/profit-loss',               icon: Wallet,      labelKey: 'profit_loss' },
      { path: '/ai-copilot',                icon: Bot,         labelKey: 'ai_copilot' },
    ],
  },
  {
    title: 'People & Finance',
    items: [
      { path: '/employees',                 icon: Users,       labelKey: 'employees' },
      { path: '/staff-invitations',         icon: UserCheck,   labelKey: 'staff_invitations' },
      { path: '/customer-management',       icon: Star,        labelKey: 'customer_management' },
      { path: '/debt-management',           icon: CreditCard,  labelKey: 'debt_management' },
      { path: '/treasury',                  icon: Wallet,      labelKey: 'treasury' },
      { path: '/payroll',                   icon: Receipt,     labelKey: 'payroll' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { path: '/settings',                  icon: Zap,         labelKey: 'settings' },
      { path: '/branch-management',         icon: Building2,   labelKey: 'branches' },
      { path: '/billing',                   icon: CreditCard,  labelKey: 'billing' },
    ],
  },
];

const MORE_SECTIONS_MANAGER_RESTAURANT = [
  {
    title: 'Operations',
    items: [
      { path: '/cash-register',     icon: CreditCard,  labelKey: 'cash_register' },
      { path: '/inventory',         icon: Package,     labelKey: 'inventory' },
      { path: '/product-management', icon: Package,    labelKey: 'product_management' },
      { path: '/inventory-waste',   icon: Package,     labelKey: 'waste_tracking' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { path: '/treasury',          icon: Wallet,      labelKey: 'treasury' },
      { path: '/expenses',          icon: Receipt,     labelKey: 'expenses' },
      { path: '/reports',           icon: BarChart3,   labelKey: 'reports' },
    ],
  },
];

const MORE_SECTIONS_MANAGER_RETAIL = [
  {
    title: 'Retail',
    items: [
      { path: '/retail/barcode',    icon: Barcode,     labelKey: 'barcode' },
      { path: '/retail/batches',    icon: Tags,        labelKey: 'batch_tracking' },
      { path: '/retail/expiry',     icon: Calendar,    labelKey: 'expiry_tracking' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { path: '/cash-register',     icon: CreditCard,  labelKey: 'cash_register' },
      { path: '/inventory',         icon: Boxes,       labelKey: 'inventory' },
      { path: '/product-management', icon: Package,    labelKey: 'product_management' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { path: '/treasury',          icon: Wallet,      labelKey: 'treasury' },
      { path: '/expenses',          icon: Receipt,     labelKey: 'expenses' },
      { path: '/reports',           icon: BarChart3,   labelKey: 'reports' },
    ],
  },
];

// ── More Menu Component ───────────────────────────────────────────────────────

function MoreMenu({ sections, onClose }) {
  const { t } = useLanguage();
  const location = useLocation();
  return (
    <div className="fixed inset-0 z-[60] bg-black/50" onClick={onClose}>
      <div
        className="absolute bottom-16 left-0 right-0 bg-background rounded-t-2xl max-h-[75vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-bold">{t('more')}</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4 pb-8">
          {sections.map(section => (
            <div key={section.title}>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {section.title}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {section.items.map(item => {
                  const isActive = location.pathname.startsWith(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors ${
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      <item.icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                      <span className="text-[10px] font-medium text-center leading-tight">
                        {t(item.labelKey) || item.labelKey.replace(/_/g, ' ')}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main BottomNav ────────────────────────────────────────────────────────────

const BottomNav = memo(function BottomNav() {
  const location = useLocation();
  const { t } = useLanguage();
  const { role } = useRole();
  const { isRetail } = useBusinessMode();
  const [showMore, setShowMore] = useState(false);

  const { visibleNav, moreSections } = useMemo(() => {
    if (role === ROLES.EMPLOYEE) return { visibleNav: PRIMARY_NAV_EMPLOYEE, moreSections: [] };
    if (role === ROLES.SPONSOR) return { visibleNav: PRIMARY_NAV_SPONSOR, moreSections: [] };
    if (role === ROLES.CUSTOMER) return { visibleNav: PRIMARY_NAV_CUSTOMER, moreSections: [] };
    if (role === ROLES.SUPPLIER) return { visibleNav: [
      { path: '/supplier-portal', icon: Package, labelKey: 'dashboard' },
    ], moreSections: [] };
    if (role === ROLES.GENERAL_MANAGER) return { visibleNav: PRIMARY_NAV_GENERAL_MANAGER, moreSections: MORE_SECTIONS_OWNER_RESTAURANT };

    if (role === ROLES.MANAGER) {
      return isRetail
        ? { visibleNav: PRIMARY_NAV_MANAGER_RETAIL, moreSections: MORE_SECTIONS_MANAGER_RETAIL }
        : { visibleNav: PRIMARY_NAV_MANAGER_RESTAURANT, moreSections: MORE_SECTIONS_MANAGER_RESTAURANT };
    }

    // OWNER (default)
    return isRetail
      ? { visibleNav: PRIMARY_NAV_OWNER_RETAIL, moreSections: MORE_SECTIONS_OWNER_RETAIL }
      : { visibleNav: PRIMARY_NAV_OWNER_RESTAURANT, moreSections: MORE_SECTIONS_OWNER_RESTAURANT };
  }, [role, isRetail]);

  return (
    <>
      {showMore && moreSections.length > 0 && (
        <MoreMenu sections={moreSections} onClose={() => setShowMore(false)} />
      )}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-lg pb-[env(safe-area-inset-bottom,0px)]">
        <div className="flex items-center justify-between h-[var(--bottom-nav-height)] max-w-lg mx-auto px-0.5">
          {visibleNav.map(({ path, icon: NavIcon, labelKey, isMore }) => {
            if (isMore) {
              return (
                <button
                  key="more"
                  onClick={() => setShowMore(s => !s)}
                  className={`flex flex-col items-center justify-center flex-1 min-w-0 h-full transition-colors px-0.5 ${
                    showMore ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <NavIcon className={`w-5 h-5 flex-shrink-0 ${showMore ? 'stroke-[2.5]' : ''}`} />
                  <span className={`text-[9px] mt-0.5 w-full text-center leading-tight whitespace-nowrap ${showMore ? 'font-semibold' : 'font-medium'}`}>
                    {t(labelKey) || 'More'}
                  </span>
                </button>
              );
            }
            const isActive = path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                className={`flex flex-col items-center justify-center flex-1 min-w-0 h-full transition-colors px-0.5 ${
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <NavIcon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'stroke-[2.5]' : ''}`} />
                <span className={`text-[9px] mt-0.5 w-full text-center leading-tight whitespace-nowrap ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {t(labelKey) || labelKey.replace(/_/g, ' ')}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
});

export default BottomNav;
