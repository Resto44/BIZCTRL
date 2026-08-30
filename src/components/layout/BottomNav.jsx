/**
 * BottomNav — Business Mode Aware Navigation
 *
 * The bottom navigation adapts to the active business mode.
 * Restaurant Mode shows: Dashboard, Treasury, Product Management, Debt Management, More
 * Retail Mode shows:     Dashboard, Treasury, Inventory, Barcode, More
 *
 * The "More" menu also filters items by business mode.
 */

import React, { memo, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import {
  LayoutDashboard, Receipt, BarChart3, Wallet, Users, Truck,
  ClipboardList, UserCheck, Bot, Building2,
  Package, CreditCard, ShoppingCart, Star, Grid3x3, X,
  TrendingUp, Calendar, Zap, Barcode, Boxes, Tags,
  ScanLine, Hash, Layers, ShieldCheck, Search, ChevronDown,
  AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useRole, ROLES } from '@/lib/RoleContext';
import { useBusinessMode } from '@/lib/BusinessModeContext';
import { useWorkspaceCustomization } from '@/lib/WorkspaceCustomizationContext';
import { useTenant } from '@/lib/TenantContext';
import { isWorkspacePathEnabled } from '@/lib/workspaceCustomization';

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

// Keep the mobile More menu aligned with the established role permission matrix.
// Route guards and RLS remain authoritative; this prevents navigation to pages a role
// cannot use in the first place, especially when General Manager shares Owner sections.
const MORE_PERMISSION_BY_PATH = {
  '/erp-approval-center': 'manageSettings',
  '/cash-register': 'viewSales',
  '/sales/invoices': 'viewSales',
  '/inventory': 'viewInventory',
  '/product-management': 'viewInventory',
  '/inventory-waste': 'viewInventory',
  '/purchases': 'viewPurchases',
  '/suppliers': 'viewSuppliers',
  '/network-management': 'viewNetworkAccounts',
  '/bi-center': 'viewReports',
  '/reports': 'viewReports',
  '/profit-loss': 'viewReports',
  '/ai-copilot': 'viewDashboard',
  '/employees': 'viewEmployees',
  '/staff-invitations': 'manageUsers',
  '/customer-management': 'manageCustomers',
  '/driver-management': 'manageDrivers',
  '/debt-management': 'viewDebts',
  '/treasury': 'viewTreasury',
  '/payroll': 'viewPayroll',
  '/settings': 'manageSettings',
  '/customize-workspace': 'manageDashboardCustomization',
  '/branch-management': 'manageBranches',
  '/billing': 'viewBilling',
  '/retail/barcode': 'viewInventory',
  '/retail/sku': 'viewInventory',
  '/retail/variants': 'viewInventory',
  '/retail/batches': 'viewInventory',
  '/retail/expiry': 'viewInventory',
  '/retail/serials': 'viewInventory',
};

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
      { path: '/customize-workspace',       icon: Grid3x3,     labelKey: 'customize_workspace' },
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
      { path: '/customize-workspace',       icon: Grid3x3,     labelKey: 'customize_workspace' },
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

const CONTROL_GROUPS = [
  {
    key: 'sales',
    title: 'Sales & Revenue',
    icon: TrendingUp,
    iconClass: 'bg-blue-600 text-white',
    paths: ['/cash-register', '/sales/invoices'],
  },
  {
    key: 'purchasing',
    title: 'Purchasing & Suppliers',
    icon: ShoppingCart,
    iconClass: 'bg-emerald-500 text-white',
    paths: ['/purchases', '/suppliers'],
  },
  {
    key: 'inventory',
    title: 'Stock & Products',
    icon: Package,
    iconClass: 'bg-orange-500 text-white',
    paths: ['/inventory', '/product-management', '/inventory-waste', '/retail/barcode', '/retail/sku', '/retail/variants', '/retail/batches', '/retail/expiry', '/retail/serials'],
  },
  {
    key: 'finance',
    title: 'Finance & Treasury',
    icon: Wallet,
    iconClass: 'bg-violet-600 text-white',
    paths: ['/network-management', '/profit-loss', '/debt-management', '/treasury', '/payroll'],
  },
  {
    key: 'team',
    title: 'Team & Access',
    icon: Users,
    iconClass: 'bg-cyan-600 text-white',
    paths: ['/employees', '/staff-invitations', '/customer-management', '/driver-management'],
  },
  {
    key: 'system',
    title: 'System Settings',
    icon: Zap,
    iconClass: 'bg-slate-600 text-white',
    paths: [],
  },
];

function readableLabel(t, labelKey) {
  const translated = t(labelKey);
  if (translated && translated !== labelKey) return translated;
  return labelKey
    .split('_')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function MoreMenu({ sections, can, onClose }) {
  const { t } = useLanguage();
  const location = useLocation();
  const { activeRestaurant } = useTenant();
  const [searchTerm, setSearchTerm] = useState('');
  const [openSection, setOpenSection] = useState(null);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const allItems = useMemo(() => sections.flatMap(section => section.items), [sections]);
  const groupedSections = useMemo(() => {
    const assignedPaths = new Set(CONTROL_GROUPS.flatMap(group => group.paths));
    return CONTROL_GROUPS.map(group => ({
      ...group,
      items: group.key === 'system'
        ? allItems.filter(item => !assignedPaths.has(item.path))
        : allItems.filter(item => group.paths.includes(item.path)),
    })).filter(group => group.items.length > 0);
  }, [allItems]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const searchedSections = useMemo(() => groupedSections
    .map(section => ({
      ...section,
      items: normalizedSearch
        ? section.items.filter(item => readableLabel(t, item.labelKey).toLowerCase().includes(normalizedSearch))
        : section.items,
    }))
    .filter(section => section.items.length > 0), [groupedSections, normalizedSearch, t]);

  const { data: metrics, isError: metricsError } = useQuery({
    queryKey: ['more-control-metrics', activeRestaurant?.id],
    queryFn: async () => {
      const [approvalResult, alertResult] = await Promise.all([
        supabase
          .from('supplier_invoices')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', activeRestaurant.id)
          .eq('approval_status', 'pending'),
        supabase
          .from('active_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', activeRestaurant.id)
          .eq('status', 'active'),
      ]);
      if (approvalResult.error || alertResult.error) throw approvalResult.error || alertResult.error;
      return {
        pendingApprovals: approvalResult.count ?? 0,
        openAlerts: alertResult.count ?? 0,
      };
    },
    enabled: Boolean(activeRestaurant?.id),
    staleTime: 60000,
    retry: 1,
  });

  const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  const availablePaths = useMemo(() => new Set(allItems.map(item => item.path)), [allItems]);
  const quickActions = [
    can?.viewSales ? { path: '/sales', label: 'Add Sale', description: 'Create a new sale', icon: ShoppingCart, iconClass: 'bg-blue-50 text-blue-700' } : null,
    can?.viewPurchases ? { path: '/purchases?create=1', label: 'Add Purchase', description: 'Create a purchase invoice', icon: Package, iconClass: 'bg-emerald-50 text-emerald-700' } : null,
    availablePaths.has('/cash-register') ? { path: '/cash-register', label: 'Cash Register', description: 'Open the register', icon: CreditCard, iconClass: 'bg-violet-50 text-violet-700' } : null,
    can?.viewReports ? { path: '/reports', label: 'Reports', description: 'Analyze performance', icon: BarChart3, iconClass: 'bg-sky-50 text-sky-700' } : null,
  ].filter(Boolean);

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="more-control-title"
        className="absolute inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px))] flex h-[82dvh] max-h-[calc(100dvh-var(--bottom-nav-height)-env(safe-area-inset-bottom,0px))] w-full max-w-full flex-col overflow-hidden rounded-t-[1.75rem] bg-slate-50 text-slate-950 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3.5">
          <div className="min-w-0">
            <h2 id="more-control-title" className="truncate text-xl font-black tracking-tight">More &amp; Control</h2>
            <p className="truncate text-xs text-slate-500">ERP workspace and system access</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close More and Control" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950">
            <X className="h-6 w-6" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3.5 py-3.5 sm:px-5">
          <div className="mx-auto w-full max-w-2xl space-y-4 pb-4">
            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                <Building2 className="h-5 w-5 shrink-0 text-blue-600" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{activeRestaurant?.name || 'Restaurant'} · All branches</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
              </div>
              <label className="flex h-11 min-w-11 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 sm:max-w-[15rem]">
                <Search className="h-5 w-5 shrink-0 text-slate-500" />
                <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} aria-label="Search ERP modules" placeholder="Search" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
              </label>
            </div>

            <section className="grid grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="ERP control summary">
              <Link to={availablePaths.has('/erp-approval-center') ? '/erp-approval-center' : location.pathname} onClick={availablePaths.has('/erp-approval-center') ? onClose : undefined} className="flex min-w-0 flex-col items-center px-1.5 py-3 text-center hover:bg-slate-50">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                <span className="mt-1 text-[10px] leading-tight text-slate-500">Pending approvals</span>
                <strong className="mt-1 text-lg text-slate-950">{metrics?.pendingApprovals ?? '—'}</strong>
              </Link>
              <Link to={can?.viewAlerts ? '/alerts' : location.pathname} onClick={can?.viewAlerts ? onClose : undefined} className="flex min-w-0 flex-col items-center px-1.5 py-3 text-center hover:bg-slate-50">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <span className="mt-1 text-[10px] leading-tight text-slate-500">Open alerts</span>
                <strong className="mt-1 text-lg text-slate-950">{metrics?.openAlerts ?? '—'}</strong>
              </Link>
              <div className="flex min-w-0 flex-col items-center px-1.5 py-3 text-center">
                <CheckCircle2 className={`h-5 w-5 ${isOnline && !metricsError ? 'text-emerald-600' : 'text-amber-500'}`} />
                <span className="mt-1 text-[10px] leading-tight text-slate-500">Connection</span>
                <strong className={`mt-1 text-sm ${isOnline && !metricsError ? 'text-emerald-700' : 'text-amber-700'}`}>{isOnline && !metricsError ? 'Online' : 'Check'}</strong>
              </div>
            </section>

            {quickActions.length > 0 && (
              <section aria-labelledby="more-quick-access-title">
                <h3 id="more-quick-access-title" className="mb-2 text-sm font-black">Quick Access</h3>
                <div className="grid grid-cols-2 gap-2.5">
                  {quickActions.map(action => (
                    <Link key={action.path} to={action.path} onClick={onClose} className="flex min-h-[4.75rem] min-w-0 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${action.iconClass}`}><action.icon className="h-5 w-5" /></span>
                      <span className="min-w-0"><span className="block truncate text-sm font-black">{action.label}</span><span className="mt-0.5 block text-[10px] leading-tight text-slate-500">{action.description}</span></span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="all-erp-modules-title">
              <h3 id="all-erp-modules-title" className="mb-2 text-sm font-black">All ERP Modules</h3>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {searchedSections.map(section => {
                  const SectionIcon = section.icon;
                  const isOpen = Boolean(normalizedSearch) || openSection === section.key;
                  return (
                    <div key={section.key} className="border-b border-slate-200 last:border-b-0">
                      <button type="button" onClick={() => setOpenSection(current => current === section.key ? null : section.key)} className="flex min-h-14 w-full items-center gap-3 px-3 text-left hover:bg-slate-50" aria-expanded={isOpen}>
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${section.iconClass}`}><SectionIcon className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1 truncate text-sm font-bold">{section.title}</span>
                        <span className="shrink-0 text-[11px] font-medium text-slate-500">{section.items.length} module{section.items.length === 1 ? '' : 's'}</span>
                        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="grid grid-cols-1 border-t border-slate-100 bg-slate-50/70 p-2 sm:grid-cols-2">
                          {section.items.map(item => {
                            const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                            return (
                              <Link key={item.path} to={item.path} onClick={onClose} className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors ${isActive ? 'bg-blue-100 text-blue-800' : 'text-slate-700 hover:bg-white hover:text-blue-700'}`}>
                                <item.icon className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{readableLabel(t, item.labelKey)}</span><ChevronDown className="h-3.5 w-3.5 -rotate-90 text-slate-400" />
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {searchedSections.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-500">No matching ERP module found.</div>}
              </div>
            </section>

            <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm"><ShieldCheck className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1"><p className="text-sm font-black">System Status</p><p className={`text-xs ${isOnline && !metricsError ? 'text-emerald-700' : 'text-amber-700'}`}>{isOnline && !metricsError ? 'ERP data connected' : 'Connection needs review'}</p></div>
              <Link to="/settings" onClick={onClose} className="shrink-0 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">View details</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main BottomNav ────────────────────────────────────────────────────────────

const BottomNav = memo(function BottomNav() {
  const location = useLocation();
  const { t } = useLanguage();
  const { role, can } = useRole();
  const { isRetailLike } = useBusinessMode();
  const { configuration } = useWorkspaceCustomization();
  const [showMore, setShowMore] = useState(false);

  const { visibleNav: baseNav, moreSections: baseMoreSections } = useMemo(() => {
    if (role === ROLES.EMPLOYEE) return { visibleNav: PRIMARY_NAV_EMPLOYEE, moreSections: [] };
    if (role === ROLES.SPONSOR) return { visibleNav: PRIMARY_NAV_SPONSOR, moreSections: [] };
    if (role === ROLES.CUSTOMER) return { visibleNav: PRIMARY_NAV_CUSTOMER, moreSections: [] };
    if (role === ROLES.SUPPLIER) return { visibleNav: [
      { path: '/supplier-portal', icon: Package, labelKey: 'dashboard' },
    ], moreSections: [] };
    if (role === ROLES.GENERAL_MANAGER) return { visibleNav: PRIMARY_NAV_GENERAL_MANAGER, moreSections: MORE_SECTIONS_OWNER_RESTAURANT };

    if (role === ROLES.MANAGER) {
      return isRetailLike
        ? { visibleNav: PRIMARY_NAV_MANAGER_RETAIL, moreSections: MORE_SECTIONS_MANAGER_RETAIL }
        : { visibleNav: PRIMARY_NAV_MANAGER_RESTAURANT, moreSections: MORE_SECTIONS_MANAGER_RESTAURANT };
    }

    // OWNER (default)
    return isRetailLike
      ? { visibleNav: PRIMARY_NAV_OWNER_RETAIL, moreSections: MORE_SECTIONS_OWNER_RETAIL }
      : { visibleNav: PRIMARY_NAV_OWNER_RESTAURANT, moreSections: MORE_SECTIONS_OWNER_RESTAURANT };
  }, [role, isRetailLike]);

  const { visibleNav, moreSections } = useMemo(() => {
    const hidden = new Set(configuration?.navigation?.hidden_paths || []);
    const rank = new Map((configuration?.navigation?.order || []).map((path, index) => [path, index]));
    const compare = (a, b) => (rank.get(a.path) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.path) ?? Number.MAX_SAFE_INTEGER);
    const visibleNav = baseNav
      .filter((item) => item.isMore || !hidden.has(item.path))
      .sort((a, b) => a.isMore ? 1 : b.isMore ? -1 : compare(a, b));
    const moreSections = baseMoreSections
      .map((section) => ({
        ...section,
        items: section.items
          .filter((item) => {
            const permission = MORE_PERMISSION_BY_PATH[item.path];
            return (!permission || can[permission]) && !hidden.has(item.path) && isWorkspacePathEnabled(configuration, item.path);
          })
          .sort(compare),
      }))
      .filter((section) => section.items.length > 0);
    return { visibleNav, moreSections };
  }, [baseMoreSections, baseNav, can, configuration]);

  return (
    <>
      {showMore && moreSections.length > 0 && (
        <MoreMenu sections={moreSections} can={can} onClose={() => setShowMore(false)} />
      )}
      <nav className="fixed inset-x-0 bottom-0 z-50 w-full max-w-full border-t border-border bg-card pb-[env(safe-area-inset-bottom,0px)] shadow-lg">
        <div className="mx-auto flex h-[var(--bottom-nav-height)] w-full max-w-lg items-center justify-between px-0.5">
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
                  <span className={`mt-0.5 w-full break-words text-center text-[9px] leading-tight ${showMore ? 'font-semibold' : 'font-medium'}`}>
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
                <span className={`mt-0.5 w-full break-words text-center text-[9px] leading-tight ${isActive ? 'font-semibold' : 'font-medium'}`}>
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
