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
import { Link, useLocation } from 'react-router-dom';
import { useRole } from '@/lib/RoleContext';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
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
  ArrowLeftRight, ShieldCheck
} from 'lucide-react';
import { useERPNavigation } from '@/hooks/useERPNavigation';

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
      { path: '/sales',          label: 'Sales',          icon: ShoppingCart, permission: 'viewSales' },
      { path: '/sales-invoices', label: 'Sales Invoices', icon: Receipt,      permission: 'viewSales' },
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
      { path: '/supplier-portal', label: 'Supplier Portal', icon: Globe,      permission: 'viewSuppliers' },
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
    ],
  },
  {
    key: 'analytics',
    label: 'Analytics & Reports',
    items: [
      { path: '/reports',         label: 'Reports',         icon: BarChart3, permission: 'viewReports' },
      { path: '/oracle-analytics',label: 'Oracle Analytics',icon: Zap,       permission: 'viewReports' },
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
    ],
  },
];

// ─── Single nav item ──────────────────────────────────────────────────────────
function NavItem({ item, collapsed, isActive }) {
  const Icon = item.icon;
  const base = cn(
    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer',
    'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
    isActive && 'bg-sidebar-accent text-sidebar-primary font-semibold'
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link to={item.path} className={cn(base, 'justify-center px-0 w-10 h-10 mx-auto')}>
              <Icon className="w-5 h-5 shrink-0" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs font-medium">
            {item.label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Link to={item.path} className={base}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {item.badge && (
        <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">
          {item.badge}
        </Badge>
      )}
    </Link>
  );
}

// ─── Nav group ────────────────────────────────────────────────────────────────
function NavGroup({ group, collapsed, location, can }) {
  const [open, setOpen] = useState(true);
  const visibleItems = useMemo(
    () => group.items.filter(item => !item.permission || can[item.permission]),
    [group.items, can]
  );
  if (visibleItems.length === 0) return null;

  return (
    <div className="mb-1">
      {!collapsed && (
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-1 group"
        >
          <span className="erp-section-title">{group.label}</span>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main ERPSidebar ──────────────────────────────────────────────────────────
export default function ERPSidebar({ collapsed, onToggle }) {
  const location = useLocation();
  const { can, role } = useRole();
  const { user } = useAuth();
  const { activeRestaurant } = useTenant();
  const { favorites, recentPages } = useERPNavigation();

  const isOwner = role === 'owner' || role === 'general_manager';

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col h-screen sticky top-0 bg-sidebar border-r border-sidebar-border',
        'transition-all duration-200 ease-in-out overflow-hidden',
        collapsed ? 'w-[var(--erp-sidebar-collapsed)]' : 'w-[var(--erp-sidebar-width)]'
      )}
      style={{
        '--erp-sidebar-width': '260px',
        '--erp-sidebar-collapsed': '64px',
      }}
    >
      {/* ── Logo / Brand ── */}
      <div className={cn(
        'flex items-center gap-3 px-4 h-[60px] border-b border-sidebar-border shrink-0',
        collapsed && 'justify-center px-0'
      )}>
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <ChefHat className="w-4 h-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-sidebar-foreground truncate">
              {activeRestaurant?.name || 'RestoCTRL'}
            </span>
            <span className="text-[10px] text-muted-foreground capitalize">{role}</span>
          </div>
        )}
      </div>

      {/* ── Scrollable nav area ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-2">

        {/* Favorites */}
        {!collapsed && favorites.length > 0 && (
          <div className="mb-1">
            <span className="erp-section-title flex items-center gap-1">
              <Star className="w-3 h-3" /> Favorites
            </span>
            <div className="px-2 space-y-0.5">
              {favorites.map(fav => (
                <NavItem
                  key={fav.path}
                  item={{ path: fav.path, label: fav.label, icon: Star }}
                  collapsed={false}
                  isActive={location.pathname.startsWith(fav.path)}
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
              <Clock className="w-3 h-3" /> Recent
            </span>
            <div className="px-2 space-y-0.5">
              {recentPages.slice(0, 5).map(page => (
                <NavItem
                  key={page.path}
                  item={{ path: page.path, label: page.label, icon: Clock }}
                  collapsed={false}
                  isActive={location.pathname.startsWith(page.path)}
                />
              ))}
            </div>
            <Separator className="my-2 mx-3" />
          </div>
        )}

        {/* Main nav groups */}
        {ERP_NAV_GROUPS.map(group => (
          <NavGroup
            key={group.key}
            group={group}
            collapsed={collapsed}
            location={location}
            can={can}
          />
        ))}
      </div>

      {/* ── Collapse toggle ── */}
      <div className="shrink-0 border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className={cn(
            'w-full h-8 text-muted-foreground hover:text-foreground',
            collapsed ? 'justify-center px-0' : 'justify-start gap-2'
          )}
        >
          {collapsed
            ? <ChevronRight className="w-4 h-4" />
            : <><ChevronLeft className="w-4 h-4" /><span className="text-xs">Collapse</span></>
          }
        </Button>
      </div>
    </aside>
  );
}
