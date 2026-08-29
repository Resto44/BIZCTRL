/**
 * ERPSidebar — Enterprise ERP sidebar navigation.
 *
 * Features:
 *   - Grouped modules with icons
 *   - Collapsible (icon-only) mode
 *   - Active route highlighting
 *   - Permission-based item visibility
 *   - Favorites pinned at top
 *   - Recent pages section
 *   - Dark/light mode aware
 *   - Responsive: hidden on mobile (BottomNav handles mobile)
 */
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { supabase } from '@/api/supabaseClient';
import { useRole } from '@/lib/RoleContext';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  LayoutDashboard, TrendingUp, ShoppingCart, Package, Users,
  DollarSign, Wallet, BarChart3, Settings, Bell, Building2,
  ChefHat, Shield, Star, Clock, ChevronLeft, ChevronRight,
  Receipt, FileText, AlertTriangle, Zap, Activity, CreditCard,
  Banknote, Network, UserCheck, GitBranch, Store, Globe,
  PieChart, Target, Layers, ClipboardList, Handshake,
  ArrowLeftRight, ShieldCheck, SlidersHorizontal, Truck, X,
  Search, Plus, CircleAlert, CheckCircle2, LifeBuoy, MapPinned
} from 'lucide-react';
import { useERPNavigation } from '@/hooks/useERPNavigation';
import { useActiveAlerts } from '@/hooks/useActiveAlerts';
import { useWorkspaceCustomization } from '@/lib/WorkspaceCustomizationContext';
import { getCustomizedNavigationGroups } from '@/lib/workspaceCustomization';
import LogoutButton from './LogoutButton';

// ─── Nav groups definition ────────────────────────────────────────────────────
export const ERP_NAV_GROUPS = [
  {
    key: 'overview',
    label: 'Overview',
    items: [
      { path: '/owner-command-center', label: 'Dashboard', icon: LayoutDashboard, permission: 'viewDashboard' },
      { path: '/sales-dashboard',      label: 'Sales Analytics', icon: TrendingUp,      permission: 'viewReports' },
      { path: '/ceo-dashboard',        label: 'CEO Dashboard',   icon: Target,          permission: 'viewDashboard' },
    ],
  },
  {
    key: 'operations',
    label: 'Operations',
    items: [
      { path: '/sales',          label: 'Sales',                    icon: ShoppingCart, permission: 'viewSales' },
      { path: '/sales-sources',  label: 'Sales Source Management', icon: Banknote,     permission: 'viewSales' },
      { path: '/sales/invoices', label: 'Sales Invoices',           icon: Receipt,      permission: 'viewSales' },
      { path: '/cash-register',  label: 'Cash Register',  icon: Banknote,     permission: 'viewSales' },
      { path: '/purchases',      label: 'Purchases',      icon: Package,      permission: 'viewPurchases' },
      { path: '/purchase-orders',label: 'Purchase Orders',icon: ClipboardList,permission: 'viewPurchases' },
      { path: '/expenses',       label: 'Expenses',       icon: DollarSign,   permission: 'viewExpenses' },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    items: [
      { path: '/inventory',           label: 'Stock',           icon: Layers,         permission: 'viewInventory' },
      { path: '/inventory-transfers', label: 'Transfers',       icon: ArrowLeftRight, permission: 'viewInventory' },
      { path: '/inventory-waste',     label: 'Waste',           icon: AlertTriangle,  permission: 'viewInventory' },
      { path: '/products',            label: 'Products',        icon: Store,          permission: 'viewInventory' },
    ],
  },
  {
    key: 'suppliers',
    label: 'Suppliers',
    items: [
      { path: '/suppliers',       label: 'Suppliers',       icon: Handshake,  permission: 'viewSuppliers' },
      // This is a supplier's self-service workspace, not an owner management page.
      // Restricting the navigation item prevents an Owner from being sent to a supplier-only route.
      { path: '/supplier-portal', label: 'Supplier Portal', icon: Globe,      permission: 'viewSuppliers', roles: ['supplier'] },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    items: [
      { path: '/treasury',          label: 'Treasury',          icon: Wallet,    permission: 'viewTreasury' },
      { path: '/profit-loss',       label: 'Profit & Loss',     icon: PieChart,  permission: 'viewReports' },
      { path: '/cashflow',          label: 'Cash Flow',         icon: Activity,  permission: 'viewReports' },
      { path: '/balance-sheet',     label: 'Balance Sheet',     icon: FileText,  permission: 'viewReports' },
      { path: '/debt-management',   label: 'Debt Management',   icon: Banknote,  permission: 'viewDebts' },
      { path: '/customer-management',label: 'Customer Management',icon: Users,    permission: 'viewDebts' },
      { path: '/network-management',label: 'Network Settlement',icon: Network,   permission: 'viewNetworkAccounts' },
      { path: '/payroll',           label: 'Payroll',           icon: CreditCard,permission: 'viewPayroll' },
    ],
  },
  {
    key: 'people',
    label: 'People',
    items: [
      { path: '/employees',          label: 'Employees',       icon: Users,      permission: 'viewEmployees' },
      { path: '/employee-attendance',label: 'Attendance',      icon: UserCheck,  permission: 'viewAttendance' },
      { path: '/employee-control',   label: 'Staff Control',   icon: ShieldCheck,permission: 'viewEmployeeControl' },
      { path: '/driver-management',  label: 'Driver Management',icon: Truck,      permission: 'viewEmployees' },
    ],
  },
  {
    key: 'analytics',
    label: 'Analytics & Reports',
    items: [
      { path: '/reports',         label: 'Reports',         icon: BarChart3, permission: 'viewReports' },
      { path: '/oracle-analytics',label: 'Oracle Analytics',icon: Zap,       permission: 'viewReports' },
      { path: '/bi-center',       label: 'Business Intelligence',icon: BarChart3, permission: 'viewReports' },
      { path: '/branch-analytics',label: 'Branch Analytics',icon: GitBranch, permission: 'viewReports' },
      { path: '/alerts',          label: 'Smart Alerts',    icon: Bell,      permission: 'viewAlerts' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    items: [
      { path: '/branch-management',  label: 'Branch Management',    icon: Shield,    permission: 'manageBranches' },
      { path: '/role-permissions',    label: 'Role & Permissions',   icon: ShieldCheck, permission: 'manageBranches' },
      { path: '/restaurants',        label: 'Restaurants',          icon: Building2, permission: 'viewBrandSettings' },
      { path: '/settings',           label: 'Settings',             icon: Settings,  permission: 'manageSettings' },
      { path: '/erp-approval-center',label: 'Approvals',            icon: ShieldCheck,permission: 'manageSettings' },
      { path: '/notifications',      label: 'Notifications',        icon: Bell,      permission: 'viewAlerts' },
      { path: '/billing',            label: 'Billing & Subscription',icon: CreditCard,permission: 'viewBilling' },
      { path: '/support',            label: 'Support',              icon: Bell },
      { path: '/customize-workspace', label: 'Customize your workspace', icon: SlidersHorizontal, permission: 'manageDashboardCustomization' },
    ],
  },
];

const MOBILE_NAV_SECTIONS = [
  {
    key: 'executive',
    label: 'Executive Reports',
    description: 'KPIs, performance & insights',
    icon: BarChart3,
    paths: [
      '/sales-dashboard', '/ceo-dashboard', '/reports', '/oracle-analytics',
      '/bi-center', '/branch-analytics', '/alerts',
    ],
  },
  {
    key: 'sales',
    label: 'Sales & Customers',
    description: 'Sales, customers & closing',
    icon: ShoppingCart,
    paths: [
      '/sales', '/sales-sources', '/sales/invoices', '/cash-register',
      '/customer-management',
    ],
  },
  {
    key: 'finance',
    label: 'Finance & Treasury',
    description: 'Cash, expenses & profitability',
    icon: Wallet,
    paths: [
      '/expenses', '/treasury', '/profit-loss', '/cashflow', '/balance-sheet',
      '/debt-management', '/network-management', '/payroll',
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory & Supply',
    description: 'Stock, purchases & suppliers',
    icon: Package,
    paths: [
      '/purchases', '/purchase-orders', '/inventory', '/inventory-transfers',
      '/inventory-waste', '/products', '/suppliers', '/supplier-portal',
    ],
  },
  {
    key: 'administration',
    label: 'Team & Administration',
    description: 'Users, roles & system settings',
    icon: Users,
    paths: [
      '/employees', '/employee-attendance', '/employee-control', '/driver-management',
      '/branch-management', '/role-permissions', '/restaurants', '/settings',
      '/erp-approval-center', '/notifications', '/billing', '/support',
      '/customize-workspace',
    ],
  },
];

const roleTitle = (role) => ({
  owner: 'Owner',
  general_manager: 'General Manager',
  manager: 'Branch Manager',
  cashier: 'Cashier',
  accountant: 'Accountant',
  procurement: 'Procurement',
  warehouse: 'Warehouse',
  auditor: 'Auditor',
  read_only: 'Read only',
}[role] || 'ERP');

const roleDashboardPath = (role) => ({
  owner: '/owner-command-center',
  general_manager: '/gm-dashboard',
  manager: '/manager-dashboard',
}[role] || '/dashboard');

function isCurrentPath(pathname, path) {
  if (path === '/sales') return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function MobileOwnerMenu({ activeRestaurant, can, role, location, navigationGroups, onNavigate, onToggle }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [openSection, setOpenSection] = useState(null);
  const { translateLiteral, t } = useLanguage();
  const { alertCount, isError: alertsError } = useActiveAlerts();
  const restaurantId = activeRestaurant?.id || null;
  const dashboardPath = roleDashboardPath(role);
  const today = format(new Date(), 'yyyy-MM-dd');

  const accessibleItems = useMemo(
    () => navigationGroups
      .flatMap((group) => group.items)
      .filter((item) =>
        item.path !== '/owner-command-center'
        && (!item.permission || can[item.permission])
        && (!item.roles || item.roles.includes(role))
      ),
    [can, navigationGroups, role],
  );

  const sections = useMemo(() => MOBILE_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.paths
      .map((path) => accessibleItems.find((item) => item.path === path))
      .filter(Boolean),
  })).filter((section) => section.items.length > 0), [accessibleItems]);

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const searchedSections = useMemo(() => sections.map((section) => ({
    ...section,
    items: normalizedSearch
      ? section.items.filter((item) => `${item.label} ${section.label}`.toLocaleLowerCase().includes(normalizedSearch))
      : section.items,
  })).filter((section) => section.items.length > 0), [normalizedSearch, sections]);

  const closingQuery = useQuery({
    queryKey: ['mobile-menu-closing-status', restaurantId, today],
    enabled: Boolean(restaurantId && can.viewSales),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_sales')
        .select('id, closing_state')
        .eq('restaurant_id', restaurantId)
        .eq('date', today)
        .limit(250);
      if (error) throw error;
      return data || [];
    },
  });

  const pendingPurchasesQuery = useQuery({
    queryKey: ['mobile-menu-pending-purchases', restaurantId],
    enabled: Boolean(restaurantId && can.viewPurchases),
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('supplier_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .eq('approval_status', 'pending');
      if (error) throw error;
      return count || 0;
    },
  });

  const closingRecords = closingQuery.data || [];
  const systemsHealthy = !alertsError && !closingQuery.isError && !pendingPurchasesQuery.isError;
  const finalizedClosings = closingRecords.filter((record) => record.closing_state === 'finalized').length;
  const draftClosings = closingRecords.length - finalizedClosings;
  const closingStatus = closingQuery.isLoading
    ? 'Checking today’s records…'
    : draftClosings > 0
      ? `${draftClosings} closing${draftClosings === 1 ? '' : 's'} ready to finish`
      : finalizedClosings > 0
        ? `${finalizedClosings} finalized today`
        : 'No closing recorded today';

  const todayActions = [
    can.viewSales && {
      path: '/sales',
      label: "Close today's sales",
      description: closingStatus,
      icon: CheckCircle2,
      iconClass: 'border-emerald-200 bg-emerald-50 text-emerald-600',
      badge: draftClosings > 0 ? String(draftClosings) : finalizedClosings > 0 ? 'Done' : 'Start',
      badgeClass: draftClosings > 0 ? 'bg-amber-100 text-amber-700' : finalizedClosings > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700',
    },
    can.viewAlerts && {
      path: '/alerts',
      label: 'Review critical alerts',
      description: alertCount > 0 ? 'Stock, cash variance and pricing need attention' : 'No active ERP alerts',
      icon: CircleAlert,
      iconClass: alertCount > 0 ? 'border-red-200 bg-red-50 text-red-600' : 'border-slate-200 bg-slate-50 text-slate-500',
      badge: String(alertCount),
      badgeClass: alertCount > 0 ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600',
    },
    can.viewPurchases && {
      path: '/enterprise-purchases',
      label: ['owner', 'general_manager'].includes(role) ? 'Approve purchases' : 'Review purchases',
      description: pendingPurchasesQuery.data > 0 ? 'Waiting for owner review' : 'No purchases waiting for approval',
      icon: Clock,
      iconClass: pendingPurchasesQuery.data > 0 ? 'border-amber-200 bg-amber-50 text-amber-600' : 'border-slate-200 bg-slate-50 text-slate-500',
      badge: String(pendingPurchasesQuery.data || 0),
      badgeClass: pendingPurchasesQuery.data > 0 ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600',
    },
  ].filter(Boolean);

  return (
    <aside className="flex h-dvh max-h-dvh w-full min-w-0 max-w-full flex-col overflow-x-hidden bg-white text-slate-950 shadow-2xl dark:bg-slate-950 dark:text-white">
      <header className="shrink-0 bg-gradient-to-br from-slate-950 via-blue-950 to-blue-900 px-4 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onToggle}
            aria-label={translateLiteral('Close navigation')}
            className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-6 w-6" />
          </button>
          <span className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] font-bold',
            systemsHealthy
              ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-300'
              : 'border-amber-300/20 bg-amber-400/10 text-amber-200',
          )}>
            <span className={cn('me-1 inline-block h-1.5 w-1.5 rounded-full', systemsHealthy ? 'bg-emerald-400' : 'bg-amber-300')} />
            {translateLiteral(systemsHealthy ? 'Systems live' : 'Sync issue')}
          </span>
        </div>

        <div className="mt-2 flex min-w-0 items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-950/40">
            <ChefHat className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-black tracking-tight">
              {translateLiteral(`${roleTitle(role)} Command Center`)}
            </h2>
            <p className="mt-0.5 truncate text-sm text-blue-100/75">
              {activeRestaurant?.name || translateLiteral('Restaurant')} · {translateLiteral(['owner', 'general_manager'].includes(role) ? 'All branches' : 'Assigned branch')}
            </p>
          </div>
        </div>

        <label className="relative mt-4 block">
          <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={translateLiteral('Ask or search ERP')}
            aria-label={translateLiteral('Search modules and actions')}
            className="h-12 w-full rounded-2xl border border-blue-400/50 bg-white ps-12 pe-4 text-base font-medium text-slate-900 shadow-lg outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-400/20"
          />
        </label>
      </header>

      <nav className="flex-1 min-h-0 min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain bg-slate-50 px-3 py-4 dark:bg-slate-950" aria-label={translateLiteral('Main navigation')}>
        {!normalizedSearch && todayActions.length > 0 && (
          <section aria-labelledby="today-work-title">
            <h3 id="today-work-title" className="px-1 text-xs font-black tracking-[0.14em] text-slate-500">
              {translateLiteral("TODAY'S WORK")}
            </h3>
            <div className="mt-2 space-y-2">
              {todayActions.map((action) => {
                const ActionIcon = action.icon;
                return (
                  <Link
                    key={action.path}
                    to={action.path}
                    onClick={onNavigate}
                    className="flex min-h-16 touch-manipulation items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition active:scale-[0.99] dark:border-slate-800 dark:bg-slate-900"
                  >
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border', action.iconClass)}>
                      <ActionIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-950 dark:text-white">{translateLiteral(action.label)}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{translateLiteral(action.description)}</span>
                    </span>
                    <span className={cn('shrink-0 rounded-full px-2 py-1 text-[10px] font-black', action.badgeClass)}>{translateLiteral(action.badge)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-blue-600 rtl:rotate-180" />
                  </Link>
                );
              })}
            </div>
            {can.viewDashboard && (
              <Link
                to={dashboardPath}
                onClick={onNavigate}
                className="mt-2 flex h-11 touch-manipulation items-center justify-center gap-2 rounded-xl border border-blue-300 bg-blue-50 text-sm font-bold text-blue-700 transition active:scale-[0.99] dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
              >
                <Target className="h-4 w-4" />
                {translateLiteral('Open daily command center')}
              </Link>
            )}
          </section>
        )}

        <section className={cn(!normalizedSearch && todayActions.length > 0 && 'mt-5')} aria-labelledby="navigate-title">
          <h3 id="navigate-title" className="px-1 text-xs font-black tracking-[0.14em] text-slate-500">
            {normalizedSearch ? translateLiteral('SEARCH RESULTS') : translateLiteral('NAVIGATE')}
          </h3>
          <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {searchedSections.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">{translateLiteral('No results found')}</div>
            ) : searchedSections.map((section) => {
              const SectionIcon = section.icon;
              const isOpen = Boolean(normalizedSearch) || openSection === section.key;
              return (
                <div key={section.key} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setOpenSection((current) => current === section.key ? null : section.key)}
                    aria-expanded={isOpen}
                    className="flex min-h-[68px] w-full touch-manipulation items-center gap-3 px-3 py-2 text-start transition hover:bg-slate-50 dark:hover:bg-slate-800/70"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                      <SectionIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-950 dark:text-white">{translateLiteral(section.label)}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{translateLiteral(section.description)}</span>
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">{section.items.length}</span>
                    <ChevronRight className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform rtl:rotate-180', isOpen && 'rotate-90 rtl:rotate-90')} />
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50/70 p-2 dark:border-slate-800 dark:bg-slate-950/40">
                      {section.items.map((item) => {
                        const ItemIcon = item.icon;
                        const active = isCurrentPath(location.pathname, item.path);
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={onNavigate}
                            className={cn(
                              'flex min-h-11 touch-manipulation items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition',
                              active
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-900',
                            )}
                          >
                            <ItemIcon className="h-4 w-4 shrink-0" />
                            <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] [word-break:break-word]">{translateLiteral(item.label)}</span>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60 rtl:rotate-180" />
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {!normalizedSearch && can.viewDashboard && (
          <Link
            to={dashboardPath}
            onClick={onNavigate}
            className={cn(
              'mt-3 flex min-h-14 touch-manipulation items-center gap-3 rounded-2xl border px-3 py-2 shadow-sm',
              isCurrentPath(location.pathname, dashboardPath)
                ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300'
                : 'border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100',
            )}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><LayoutDashboard className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black">{translateLiteral('Dashboard')}</span>
              <span className="block truncate text-xs font-normal text-slate-500 dark:text-slate-400">{translateLiteral('Overview of your restaurant')}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 opacity-60 rtl:rotate-180" />
          </Link>
        )}
      </nav>

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-slate-200 bg-white px-3 pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.10)] dark:border-slate-800 dark:bg-slate-950 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {(can.viewSales || can.viewPurchases) && (
          <section aria-labelledby="quick-entry-title">
            <h3 id="quick-entry-title" className="mb-2 text-[10px] font-black tracking-[0.14em] text-slate-500">{translateLiteral('QUICK ENTRY')}</h3>
            <div className="grid grid-cols-2 gap-2">
              {can.viewSales && (
                <Link
                  to="/sales"
                  onClick={onNavigate}
                  className="flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 text-sm font-black text-white shadow-md shadow-emerald-500/20 transition active:scale-[0.98]"
                >
                  <ShoppingCart className="h-5 w-5" />
                  {t('add_sale') || translateLiteral('Add Sale')}
                </Link>
              )}
              {can.viewPurchases && (
                <Link
                  to="/purchases?create=1"
                  onClick={onNavigate}
                  className="flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-black text-white shadow-md shadow-blue-600/20 transition active:scale-[0.98]"
                >
                  <Plus className="h-5 w-5" />
                  {t('add_purchase') || translateLiteral('Add Purchase')}
                </Link>
              )}
            </div>
          </section>
        )}

        <div className="mt-2 grid grid-cols-3 gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
          {can.manageBranches && (
            <Link to="/branch-management" onClick={onNavigate} className="flex min-h-11 touch-manipulation flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900">
              <MapPinned className="h-4 w-4 text-blue-600" />{translateLiteral('Switch branch')}
            </Link>
          )}
          {can.manageSettings && (
            <Link to="/settings" onClick={onNavigate} className="flex min-h-11 touch-manipulation flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900">
              <Settings className="h-4 w-4 text-blue-600" />{translateLiteral('Settings')}
            </Link>
          )}
          <Link to="/support" onClick={onNavigate} className="flex min-h-11 touch-manipulation flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900">
            <LifeBuoy className="h-4 w-4 text-blue-600" />{translateLiteral('Support')}
          </Link>
        </div>

        <div className="mx-auto mt-1 max-w-36 [&_button]:justify-center [&_button]:py-1.5 [&_button]:text-xs">
          <LogoutButton variant="menu-item" />
        </div>
        <p className="text-center text-[9px] text-slate-400">{translateLiteral('ERP live data')}</p>
      </div>
    </aside>
  );
}

// ─── Single nav item ──────────────────────────────────────────────────────────
function NavItem({ item, collapsed, isActive, onNavigate, mobile = false }) {
  const Icon = item.icon;
  const { translateLiteral } = useLanguage();
  const label = translateLiteral(item.label);
  const base = cn(
    'flex min-w-0 max-w-full items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer',
    'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
    isActive && 'bg-sidebar-accent text-sidebar-primary font-semibold'
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link to={item.path} onClick={onNavigate} className={cn(base, 'justify-center px-0 w-10 h-10 mx-auto')}>
              <Icon className="w-5 h-5 shrink-0" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs font-medium">
            {label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Link to={item.path} onClick={onNavigate} className={base}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className={cn('min-w-0 max-w-full', mobile ? 'break-words [overflow-wrap:anywhere] [word-break:break-word]' : 'truncate')}>{label}</span>
      {item.badge && (
        <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">
          {item.badge}
        </Badge>
      )}
    </Link>
  );
}

// ─── Nav group ────────────────────────────────────────────────────────────────
function NavGroup({ group, collapsed, location, can, role, onNavigate, mobile = false }) {
  const [open, setOpen] = useState(true);
  const { translateLiteral } = useLanguage();
  const visibleItems = useMemo(
    () => group.items.filter(item =>
      (!item.permission || can[item.permission]) &&
      (!item.roles || item.roles.includes(role))
    ),
    [group.items, can, role]
  );
  if (visibleItems.length === 0) return null;

  return (
    <div className="mb-1">
      {!collapsed && (
        <button
          onClick={() => setOpen(o => !o)}
          className="flex w-full min-w-0 max-w-full items-center justify-between gap-2 px-3 py-1 group"
        >
          <span className={cn('min-w-0 max-w-full text-left', mobile && 'break-words [overflow-wrap:anywhere] [word-break:break-word]')}>{translateLiteral(group.label)}</span>
          <ChevronRight
            className={cn(
              'w-3 h-3 text-muted-foreground/50 transition-transform',
              open && 'rotate-90'
            )}
          />
        </button>
      )}
      {(open || collapsed) && (
        <div className={cn('space-y-0.5', collapsed ? 'flex flex-col items-center' : 'px-2')}>
          {visibleItems.map(item => (
            <NavItem
              key={item.path}
              item={item}
              collapsed={collapsed}
              isActive={
                item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path)
              }
              onNavigate={onNavigate}
              mobile={mobile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main ERPSidebar ──────────────────────────────────────────────────────────
export default function ERPSidebar({ collapsed, onToggle, mobile = false, onNavigate }) {
  const location = useLocation();
  const { can, role } = useRole();
  const { activeRestaurant } = useTenant();
  const { favorites, recentPages } = useERPNavigation();
  const { translateLiteral } = useLanguage();
  const { configuration } = useWorkspaceCustomization();
  const navigationGroups = useMemo(
    () => getCustomizedNavigationGroups(ERP_NAV_GROUPS, configuration),
    [configuration],
  );

  if (mobile) {
    return (
      <MobileOwnerMenu
        activeRestaurant={activeRestaurant}
        can={can}
        role={role}
        location={location}
        navigationGroups={navigationGroups}
        onNavigate={onNavigate}
        onToggle={onToggle}
      />
    );
  }

  return (
    <aside
      className={cn(
        mobile
          ? 'flex h-dvh max-h-dvh w-full min-w-0 max-w-full flex-col overflow-x-hidden overflow-y-auto overscroll-contain box-border bg-sidebar border-r border-sidebar-border shadow-2xl'
          : 'hidden lg:flex h-screen sticky top-0 bg-sidebar border-r border-sidebar-border transition-all duration-200 ease-in-out overflow-hidden',
        !mobile && (collapsed ? 'w-[var(--erp-sidebar-collapsed)]' : 'w-[var(--erp-sidebar-width)]')
      )}
      style={{
        '--erp-sidebar-width': '260px',
        '--erp-sidebar-collapsed': '64px',
      }}
    >
      {/* ── Logo / Brand ── */}
      <div className={cn(
        'flex min-w-0 max-w-full items-center gap-3 px-4 h-[60px] border-b border-sidebar-border shrink-0 box-border',
        collapsed && 'justify-center px-0'
      )}>
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <ChefHat className="w-4 h-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="min-w-0 max-w-full text-sm font-bold text-sidebar-foreground break-words [overflow-wrap:anywhere] [word-break:break-word]">
              {activeRestaurant?.name || ''}
            </span>
            <span className="text-[10px] text-muted-foreground capitalize">{role}</span>
          </div>
        )}
      </div>

      {/* ── Scrollable nav area ── */}
      <nav className="flex-1 min-h-0 min-w-0 max-w-full overflow-x-hidden overflow-y-auto overscroll-contain scrollbar-thin py-2" aria-label={translateLiteral('Main navigation')}>

        {/* Favorites */}
        {!collapsed && favorites.length > 0 && (
          <div className="mb-1">
            <span className="erp-section-title flex items-center gap-1">
              <Star className="w-3 h-3" /> {translateLiteral('Favorites')}
            </span>
            <div className="px-2 space-y-0.5">
              {favorites.map(fav => (
                <NavItem
                  key={fav.path}
                  item={{ path: fav.path, label: fav.label, icon: Star }}
                  collapsed={false}
                  isActive={location.pathname.startsWith(fav.path)}
                  onNavigate={onNavigate}
                  mobile={mobile}
                />
              ))}
            </div>
            <Separator className="my-2 mx-3" />
          </div>
        )}

        {/* Recent pages */}
        {!collapsed && recentPages.length > 0 && (
          <div className="mb-1">
            <span className="erp-section-title flex items-center gap-1">
              <Clock className="w-3 h-3" /> {translateLiteral('Recent')}
            </span>
            <div className="px-2 space-y-0.5">
              {recentPages.slice(0, 5).map(page => (
                <NavItem
                  key={page.path}
                  item={{ path: page.path, label: page.label, icon: Clock }}
                  collapsed={false}
                  isActive={location.pathname.startsWith(page.path)}
                  onNavigate={onNavigate}
                  mobile={mobile}
                />
              ))}
            </div>
            <Separator className="my-2 mx-3" />
          </div>
        )}

        {/* Main nav groups */}
        {navigationGroups.map(group => (
          <NavGroup
            key={group.key}
            group={group}
            collapsed={collapsed}
            location={location}
            can={can}
            role={role}
            onNavigate={onNavigate}
            mobile={mobile}
          />
        ))}
      </nav>

      {/* ── Collapse toggle ── */}
      <div className="sticky bottom-0 z-10 shrink-0 border-t border-sidebar-border bg-sidebar p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          aria-label={mobile ? translateLiteral('Close navigation') : translateLiteral('Collapse navigation')}
          className={cn(
            'w-full h-10 text-muted-foreground hover:text-foreground',
            collapsed ? 'justify-center px-0' : 'justify-start gap-2'
          )}
        >
          {mobile
            ? <><X className="w-4 h-4" /><span className="text-xs">{translateLiteral('Close')}</span></>
            : collapsed
              ? <ChevronRight className="w-4 h-4" />
              : <><ChevronLeft className="w-4 h-4" /><span className="text-xs">{translateLiteral('Collapse')}</span></>
          }
        </Button>
      </div>
    </aside>
  );
}
