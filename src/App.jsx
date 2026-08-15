import React, { lazy, Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { LanguageProvider } from '@/lib/LanguageContext';
import { SubscriptionProvider, useSubscription } from '@/lib/SubscriptionContext';
import { RoleProvider } from '@/lib/RoleContext';
import RoleGuard from '@/components/rbac/RoleGuard';
import ERPRoleGuard from '@/components/rbac/ERPRoleGuard';
import { TenantProvider, useTenant } from '@/lib/TenantContext';
import { BusinessModeProvider } from '@/lib/BusinessModeContext';
import { NotificationProvider } from '@/lib/NotificationContext';
import { useRole, ROLES, ROLE_HOME, NON_OWNER_ROLES } from '@/lib/RoleContext';
import { Toaster } from 'sonner';

// ── Core layout (always loaded eagerly) ──────────────────────────────────────
import AppLayout from '@/components/layout/AppLayout';
import PaywallScreen from '@/components/subscription/PaywallScreen';
import FeatureRouteGuard from '@/components/subscription/FeatureRouteGuard';

// ── Lazy-loaded pages (code splitting) ───────────────────────────────────────
const Dashboard           = lazy(() => import('./pages/Dashboard'));
// Legacy role portals removed — replaced by ERP dashboards
const ExecutiveCommandCenter = lazy(() => import('./pages/ExecutiveCommandCenter'));
const OwnerDashboard         = lazy(() => import('./pages/OwnerDashboard'));
const CashRegisterCenter     = lazy(() => import('./pages/CashRegisterCenter'));
// Legacy dashboard variants removed — canonical ERP pages used instead
const PromotionsV2           = lazy(() => import('./pages/PromotionsV2'));
const LoyaltyProgramV2       = lazy(() => import('./pages/LoyaltyProgramV2'));
const DriverManagement       = lazy(() => import('./pages/DriverManagement'));
const CustomerManagement     = lazy(() => import('./pages/CustomerManagement'));
const BranchCommandCenter    = lazy(() => import('./pages/BranchCommandCenter'));
const InventoryCommandCenter = lazy(() => import('./pages/InventoryCommandCenter'));
const SmartAlertCenter       = lazy(() => import('./pages/SmartAlertCenter'));
const AIBusinessCopilot      = lazy(() => import('./pages/AIBusinessCopilot'));
const BICenter               = lazy(() => import('./pages/BICenter'));

const Sales               = lazy(() => import('./pages/Sales'));
const SalesInvoices       = lazy(() => import('./pages/SalesInvoices'));
const Purchases           = lazy(() => import('./pages/Purchases'));
const Expenses            = lazy(() => import('@/pages/Expenses'));
const Products            = lazy(() => import('@/pages/Products'));
const ProductManagement   = lazy(() => import('@/pages/ProductManagement'));
const Inventory           = lazy(() => import('@/pages/Inventory'));
const InventoryTransfer   = lazy(() => import('@/pages/InventoryTransfer'));
const InventoryWaste      = lazy(() => import('@/pages/InventoryWaste'));
const InventoryForecast   = lazy(() => import('@/pages/InventoryForecast'));

const Suppliers           = lazy(() => import('@/pages/Suppliers'));
const PurchaseOrders      = lazy(() => import('@/pages/PurchaseOrders'));
const ProcurementDashboard = lazy(() => import('@/pages/ProcurementDashboard'));
const EnterprisePurchaseCommandCenter = lazy(() => import('@/pages/EnterprisePurchaseCommandCenter'));
const SupplierLedger      = lazy(() => import('@/pages/SupplierLedger'));

const Reports             = lazy(() => import('@/pages/Reports'));
const SalesDashboard      = lazy(() => import('@/pages/SalesDashboard'));
const ProfitLoss          = lazy(() => import('@/pages/ProfitLoss'));
const CashFlow            = lazy(() => import('@/pages/CashFlow'));
const OracleAnalytics     = lazy(() => import('@/pages/OracleAnalytics'));
const BalanceSheet        = lazy(() => import('@/pages/BalanceSheet'));
const BranchAnalytics     = lazy(() => import('@/pages/BranchAnalytics'));
const CEODashboard        = lazy(() => import('@/pages/CEODashboard'));
const PriceOptimization   = lazy(() => import('@/pages/PriceOptimization'));
const ActivityLogs        = lazy(() => import('@/pages/ActivityLogs'));
const ScheduledReports    = lazy(() => import('@/pages/ScheduledReports'));

const Employees           = lazy(() => import('@/pages/Employees'));
const EmployeeControl     = lazy(() => import('@/pages/EmployeeControl'));
const EmployeeAttendance  = lazy(() => import('@/pages/EmployeeAttendance'));
const Payroll             = lazy(() => import('@/pages/Payroll'));

const Treasury            = lazy(() => import('@/pages/Treasury'));
const SponsorTreasury     = lazy(() => import('@/pages/SponsorTreasury'));
const DebtManagement      = lazy(() => import('@/pages/DebtManagement'));
const NetworkManagement   = lazy(() => import('@/pages/NetworkManagement'));

const CustomerPortal      = lazy(() => import('@/pages/CustomerPortal'));
const LoyaltyProgram      = lazy(() => import('@/pages/LoyaltyProgram'));

const SettingsPage        = lazy(() => import('@/pages/SettingsPage'));
const BrandSettings       = lazy(() => import('@/pages/BrandSettings'));
const BranchManagement    = lazy(() => import('@/pages/BranchManagement'));
const RolePermissionCenter = lazy(() => import('@/pages/RolePermissionCenter'));
const RestaurantManager   = lazy(() => import('@/pages/RestaurantManager'));

const EnterpriseCategoryManager = lazy(() => import('@/components/categories/CategoryManager'));
const ApprovalPolicy      = lazy(() => import('@/pages/ApprovalPolicy'));
const OwnerApprovalCenter = lazy(() => import('@/pages/OwnerApprovalCenter'));
const SalesSources        = lazy(() => import('@/pages/SalesSources'));
const TelegramSettings    = lazy(() => import('@/pages/TelegramSettings'));
const Billing             = lazy(() => import('@/pages/Billing'));
const Support             = lazy(() => import('@/pages/Support'));
const PlatformOwnerPortal = lazy(() => import('@/pages/PlatformOwnerPortal'));
const PlatformOwnerLogin  = lazy(() => import('@/pages/PlatformOwnerLogin'));

const Tasks               = lazy(() => import('@/pages/Tasks'));
const NotificationCenter  = lazy(() => import('@/pages/NotificationCenter'));
const StaffUpload         = lazy(() => import('@/pages/StaffUpload'));
const StaffInvitations    = lazy(() => import('@/pages/StaffInvitations'));

const Onboarding          = lazy(() => import('@/pages/Onboarding'));

// ── Retail Mode Exclusive Modules ────────────────────────────────────────────
const BarcodeScanner      = lazy(() => import('@/pages/retail/BarcodeScanner'));
const SKUManagement       = lazy(() => import('@/pages/retail/SKUManagement'));
const ProductVariants     = lazy(() => import('@/pages/retail/ProductVariants'));
const BatchTracking       = lazy(() => import('@/pages/retail/BatchTracking'));
const ExpiryTracking      = lazy(() => import('@/pages/retail/ExpiryTracking'));
const SerialNumbers       = lazy(() => import('@/pages/retail/SerialNumbers'));

// ── Public pages (eager — shown before auth) ─────────────────────────────────
import LandingPage            from '@/pages/LandingPage';
// AuthPage removed — replaced by ERPLogin
import ERPLogin               from '@/pages/ERPLogin';
import ERPRegister            from '@/pages/ERPRegister';
const BillingVisualHarness = import.meta.env.DEV ? lazy(() => import('@/pages/dev/BillingVisualHarness')) : null;
// Legacy invite pages removed — all redirected to ERP portals

// ── Legacy pages removed — replaced by ERP portals ─────────────────────────
// ── NEW ERP Multi-Tenant Portals ─────────────────────────────────────────────
const GMDashboard           = lazy(() => import('@/pages/GMDashboard'));
const ManagerDashboardERP   = lazy(() => import('@/pages/ManagerDashboardERP'));
const EmployeeDashboardERP  = lazy(() => import('@/pages/EmployeeDashboardERP'));
const SupplierPortalERP     = lazy(() => import('@/pages/SupplierPortalERP'));

// ── Shared page loading fallback ─────────────────────────────────────────────
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
  </div>
);

// ── Route-level error boundary ────────────────────────────────────────────────
class RouteErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(e, info) { console.error('[RouteErrorBoundary]', e, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
          <p className="text-muted-foreground mb-4">This page failed to load.</p>
          <button
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
            onClick={() => this.setState({ hasError: false })}
          >Try Again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Onboarding gate ───────────────────────────────────────────────────────────
function OnboardingGate({ children }) {
  const { restaurants, loadingRestaurants } = useTenant();
  const { user, isLoadingAuth } = useAuth();
  const location = window.location;

  // Block rendering until both auth AND restaurant data are ready
  if (isLoadingAuth || loadingRestaurants) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  // Non-owner ERP roles must never be redirected to onboarding
  const restrictedRole = NON_OWNER_ROLES.has(user?.role);
  if (restrictedRole) return children;

  const isOwner = user?.role === ROLES.OWNER || !user?.role;
  const needsOnboarding = isOwner && restaurants.length === 0;
  const onOnboardingPage = location.pathname === '/onboarding';

  if (needsOnboarding && !onOnboardingPage) { window.location.replace('/onboarding'); return null; }
  if (!needsOnboarding && onOnboardingPage) { window.location.replace('/owner-command-center'); return null; }

  return children;
}

// ── Role-based home redirect ──────────────────────────────────────────────────
function RoleHomeRedirect() {
  const { role } = useRole();
  const { restaurants, loadingRestaurants } = useTenant();
  // Use ROLE_HOME directly — all roles now have explicit non-root paths
  const home = ROLE_HOME[role] || '/owner-command-center';

  React.useEffect(() => {
    if (loadingRestaurants) return;
    if (restaurants.length === 0) return;
    const currentPath = window.location.pathname;
    // Redirect from root or auth to the role's home page
    if (currentPath === '/' || currentPath === '/auth' || currentPath === '/erp-login' || currentPath === '/dashboard') {
      window.location.replace(home);
    }
  }, [home, loadingRestaurants, restaurants.length]);
  return null;
}

// ── Subscribed routes (all protected pages) ───────────────────────────────────
const SubscribedRoutes = () => {
  const { isActive, loading } = useSubscription();
  const { loadingRestaurants } = useTenant();

  if (loading || loadingRestaurants) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isActive) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding onComplete={() => window.location.replace('/owner-command-center')} />} />
          <Route element={<AppLayout />}>
            <Route path="/billing" element={<Billing />} />
          </Route>
          <Route path="*" element={<PaywallScreen />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <RouteErrorBoundary>
    <OnboardingGate>
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/onboarding" element={<Onboarding onComplete={() => window.location.replace('/owner-command-center')} />} />
      <Route element={<AppLayout />}>
        {/* ── Primary owner dashboard (canonical entry point) ── */}
        <Route path="/owner-command-center" element={<RoleGuard permission="viewDashboard"><OwnerDashboard /></RoleGuard>} />

        {/* ── Legacy dashboard (manager workspace + first-time owner) ── */}
        <Route path="/dashboard" element={<RoleGuard permission="viewDashboard"><Dashboard /></RoleGuard>} />

        {/* ── Executive analytics view ── */}
        <Route path="/executive-command-center" element={<RoleGuard permission="viewDashboard"><ExecutiveCommandCenter /></RoleGuard>} />

        <Route path="/staff-upload" element={<RoleGuard permission="uploadSales"><StaffUpload /></RoleGuard>} />
        <Route path="/staff-invitations" element={<RoleGuard permission="viewBrandSettings"><StaffInvitations /></RoleGuard>} />

        {/* ── Core Operations ── */}
        <Route path="/sales" element={<RoleGuard permission="viewSales"><Sales /></RoleGuard>} />
        <Route path="/sales/invoices" element={<RoleGuard permission="viewSales"><SalesInvoices /></RoleGuard>} />
        <Route path="/purchases" element={<RoleGuard permission="viewPurchases"><Purchases /></RoleGuard>} />
        <Route path="/expenses" element={<RoleGuard permission="viewExpenses"><Expenses /></RoleGuard>} />

        {/* ── Procurement ── */}
        <Route path="/procurement-dashboard" element={<RoleGuard permission="viewPurchases"><ProcurementDashboard /></RoleGuard>} />
        <Route path="/enterprise-purchases" element={<RoleGuard permission="viewPurchases"><EnterprisePurchaseCommandCenter /></RoleGuard>} />
        <Route path="/supplier-ledger" element={<RoleGuard permission="viewSuppliers"><SupplierLedger /></RoleGuard>} />
        <Route path="/purchase-orders" element={<RoleGuard permission="viewSuppliers"><PurchaseOrders /></RoleGuard>} />
        <Route path="/suppliers" element={<RoleGuard permission="viewSuppliers"><Suppliers /></RoleGuard>} />

        {/* ── Inventory ── */}
        <Route path="/product-management" element={<RoleGuard permission="viewInventory"><ProductManagement /></RoleGuard>} />
        <Route path="/products" element={<RoleGuard permission="viewInventory"><Products /></RoleGuard>} />
        <Route path="/inventory" element={<RoleGuard permission="viewInventory"><Inventory /></RoleGuard>} />
        <Route path="/inventory-transfers" element={<RoleGuard permission="viewInventory"><InventoryTransfer /></RoleGuard>} />
        <Route path="/inventory-waste" element={<RoleGuard permission="viewInventory"><InventoryWaste /></RoleGuard>} />
        <Route path="/inventory-forecast" element={<InventoryForecast />} />

        {/* ── Analytics & Reports ── */}
        <Route path="/reports" element={<RoleGuard permission="viewReports"><Reports /></RoleGuard>} />
        <Route path="/sales-dashboard" element={<RoleGuard permission="viewReports"><SalesDashboard /></RoleGuard>} />
        <Route path="/profit-loss" element={<RoleGuard permission="viewReports"><ProfitLoss /></RoleGuard>} />
        <Route path="/cashflow" element={<RoleGuard permission="viewReports"><FeatureRouteGuard feature="cashflow_forecast"><CashFlow /></FeatureRouteGuard></RoleGuard>} />
        <Route path="/oracle-analytics" element={<RoleGuard permission="viewReports"><FeatureRouteGuard feature="advanced_analytics"><OracleAnalytics /></FeatureRouteGuard></RoleGuard>} />
        <Route path="/balance-sheet" element={<RoleGuard permission="viewReports"><BalanceSheet /></RoleGuard>} />
        <Route path="/branch-analytics" element={<RoleGuard permission="viewReports"><FeatureRouteGuard feature="advanced_analytics"><BranchAnalytics /></FeatureRouteGuard></RoleGuard>} />
        <Route path="/ceo-dashboard" element={<RoleGuard permission="viewDashboard"><FeatureRouteGuard feature="advanced_analytics"><CEODashboard /></FeatureRouteGuard></RoleGuard>} />
        <Route path="/price-optimization" element={<RoleGuard permission="viewReports"><FeatureRouteGuard feature="advanced_analytics"><PriceOptimization /></FeatureRouteGuard></RoleGuard>} />
        <Route path="/activity-logs" element={<RoleGuard permission="viewActivityLogs"><ActivityLogs /></RoleGuard>} />
        <Route path="/scheduled-reports" element={<RoleGuard permission="exportPDF"><FeatureRouteGuard feature="scheduled_reports"><ScheduledReports /></FeatureRouteGuard></RoleGuard>} />

        {/* ── People ── */}
        <Route path="/employees" element={<RoleGuard permission="viewEmployees"><Employees /></RoleGuard>} />
        <Route path="/employee-control" element={<RoleGuard permission="viewEmployeeControl"><EmployeeControl /></RoleGuard>} />
        <Route path="/employee-attendance" element={<RoleGuard permission="recordAttendance"><EmployeeAttendance /></RoleGuard>} />
        <Route path="/staff-attendance" element={<RoleGuard permission="viewStaffAttendance"><EmployeeAttendance /></RoleGuard>} />
        <Route path="/payroll" element={<RoleGuard permission="viewPayroll"><Payroll /></RoleGuard>} />

        {/* ── Finance ── */}
        <Route path="/treasury" element={<RoleGuard permission="viewTreasury"><Treasury /></RoleGuard>} />
        <Route path="/sponsor-treasury" element={<RoleGuard permission="viewSponsorTreasury"><SponsorTreasury /></RoleGuard>} />
        <Route path="/debts" element={<RoleGuard permission="viewDebts"><DebtManagement /></RoleGuard>} />
        <Route path="/debt-management" element={<RoleGuard permission="viewDebts"><DebtManagement /></RoleGuard>} />
        <Route path="/network-management" element={<RoleGuard permission="viewNetworkAccounts"><FeatureRouteGuard feature="network_management"><NetworkManagement /></FeatureRouteGuard></RoleGuard>} />
        {/* Legacy redirects */}
        <Route path="/network-accounts" element={<RoleGuard permission="viewNetworkAccounts"><FeatureRouteGuard feature="network_management"><NetworkManagement /></FeatureRouteGuard></RoleGuard>} />
        <Route path="/network-analytics" element={<RoleGuard permission="viewNetworkAccounts"><FeatureRouteGuard feature="network_management"><NetworkManagement /></FeatureRouteGuard></RoleGuard>} />
        <Route path="/network-hub" element={<RoleGuard permission="viewDashboard"><FeatureRouteGuard feature="network_management"><NetworkManagement /></FeatureRouteGuard></RoleGuard>} />

        {/* ── Configuration ── */}
        <Route path="/settings" element={<RoleGuard permission="manageSettings"><SettingsPage /></RoleGuard>} />
        <Route path="/brand" element={<RoleGuard permission="viewBrandSettings"><BrandSettings /></RoleGuard>} />
        <Route path="/restaurants" element={<RoleGuard permission="viewBrandSettings"><RestaurantManager /></RoleGuard>} />
        <Route path="/branch-management" element={<RoleGuard permission="viewBrandSettings"><BranchManagement /></RoleGuard>} />
        <Route path="/role-permissions" element={<RoleGuard permission="manageBranches"><RolePermissionCenter /></RoleGuard>} />

        <Route path="/approval-policy" element={<RoleGuard permission="viewBrandSettings"><ApprovalPolicy /></RoleGuard>} />
        <Route path="/approval-center" element={<Navigate to="/erp-approval-center" replace />} />
        <Route path="/sales-sources" element={<RoleGuard permission="viewBrandSettings"><SalesSources /></RoleGuard>} />
        <Route path="/telegram-settings" element={<RoleGuard permission="viewBrandSettings"><TelegramSettings /></RoleGuard>} />
        <Route path="/billing" element={<RoleGuard permission="viewBilling"><Billing /></RoleGuard>} />
        <Route path="/notifications" element={<RoleGuard permission="viewAlerts"><NotificationCenter /></RoleGuard>} />
        <Route path="/alerts" element={<RoleGuard permission="viewAlerts"><SmartAlertCenter /></RoleGuard>} />
        <Route path="/tasks" element={<RoleGuard permission="viewTasks"><Tasks /></RoleGuard>} />
        <Route path="/support" element={<Support />} />
        <Route path="/super-admin" element={<Navigate to="/platform-owner/login" replace />} />

        {/* ── NEW ERP Role Portals — strict role-based access control ── */}
        <Route path="/gm-dashboard" element={<ERPRoleGuard allowedRoles={['general_manager']}><GMDashboard /></ERPRoleGuard>} />
        <Route path="/manager-dashboard" element={<ERPRoleGuard allowedRoles={['manager']}><ManagerDashboardERP /></ERPRoleGuard>} />
        <Route path="/employee-dashboard" element={<ERPRoleGuard allowedRoles={['employee']}><EmployeeDashboardERP /></ERPRoleGuard>} />
        <Route path="/supplier-portal" element={<ERPRoleGuard allowedRoles={['supplier']}><SupplierPortalERP /></ERPRoleGuard>} />
        <Route path="/erp-approval-center" element={<RoleGuard permission="manageSettings"><OwnerApprovalCenter /></RoleGuard>} />
        {/* ── Legacy role portals — redirect to new ERP dashboards ── */}
        <Route path="/employee-portal" element={<Navigate to="/employee-dashboard" replace />} />
        <Route path="/sponsor-dashboard" element={<Navigate to="/erp-login" replace />} />
        <Route path="/customer-dashboard" element={<Navigate to="/erp-login" replace />} />

        {/* ── Enterprise Modules ── */}
        <Route path="/cash-register" element={<RoleGuard permission="viewSales"><CashRegisterCenter /></RoleGuard>} />
        <Route path="/promotions" element={<RoleGuard permission="viewSales"><PromotionsV2 /></RoleGuard>} />
        <Route path="/loyalty-v2" element={<RoleGuard permission="viewDebts"><LoyaltyProgramV2 /></RoleGuard>} />
        <Route path="/driver-management" element={<RoleGuard permission="viewEmployees"><FeatureRouteGuard feature="driver_analytics"><DriverManagement /></FeatureRouteGuard></RoleGuard>} />
        <Route path="/customer-management" element={<RoleGuard permission="viewDebts"><CustomerManagement /></RoleGuard>} />
        <Route path="/branch-command-center" element={<RoleGuard permission="viewDashboard"><BranchCommandCenter /></RoleGuard>} />
        <Route path="/inventory-command-center" element={<RoleGuard permission="viewInventory"><InventoryCommandCenter /></RoleGuard>} />
        <Route path="/smart-alerts" element={<Navigate to="/alerts" replace />} />
        <Route path="/ai-copilot" element={<RoleGuard permission="viewDashboard"><FeatureRouteGuard feature="ai_copilot"><AIBusinessCopilot /></FeatureRouteGuard></RoleGuard>} />
        <Route path="/bi-center" element={<RoleGuard permission="viewReports"><FeatureRouteGuard feature="advanced_analytics"><BICenter /></FeatureRouteGuard></RoleGuard>} />
        <Route path="/customer-portal" element={<CustomerPortal />} />
        <Route path="/loyalty-program" element={<RoleGuard permission="viewDebts"><LoyaltyProgram /></RoleGuard>} />

        {/* ── Short aliases — redirect to new ERP dashboards ── */}
        <Route path="/employee" element={<Navigate to="/employee-dashboard" replace />} />
        <Route path="/customer" element={<Navigate to="/erp-login" replace />} />

        {/* ══════════════════════════════════════════════════════════════════════
            RETAIL MODE EXCLUSIVE ROUTES
            These routes are accessible to all authenticated users but the pages
            themselves enforce Retail Mode via useBusinessMode() guard.
        ══════════════════════════════════════════════════════════════════════ */}
        <Route path="/retail/barcode"  element={<RoleGuard permission="viewInventory"><BarcodeScanner /></RoleGuard>} />
        <Route path="/retail/sku"      element={<RoleGuard permission="viewInventory"><SKUManagement /></RoleGuard>} />
        <Route path="/retail/variants" element={<RoleGuard permission="viewInventory"><ProductVariants /></RoleGuard>} />
        <Route path="/retail/batches"  element={<RoleGuard permission="viewInventory"><BatchTracking /></RoleGuard>} />
        <Route path="/retail/expiry"   element={<RoleGuard permission="viewInventory"><ExpiryTracking /></RoleGuard>} />
        <Route path="/retail/serials"  element={<RoleGuard permission="viewInventory"><SerialNumbers /></RoleGuard>} />

      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
    </OnboardingGate>
    </RouteErrorBoundary>
  );
};

// Legacy invitation routes may preserve a token, but can never apply a role or tenant from the browser.
function LegacyInvitationRedirect() {
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const token = query.get('token') || query.get('invite_token');
  return <Navigate to={token ? `/erp-register?token=${encodeURIComponent(token)}` : '/erp-register'} replace />;
}

// ── Authenticated app shell ───────────────────────────────────────────────────
const AuthenticatedApp = () => {
  const { isLoadingAuth, authError, user, navigateToLogin } = useAuth();
  const [timedOut, setTimedOut] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 10000);
    return () => clearTimeout(t);
  }, []);

  // Wait for auth to finish before deciding whether to redirect. Navigation must
  // run in an effect, never during render, to avoid React state-update warnings.
  const noUser = !isLoadingAuth && !user && !authError;
  const requiresLogin = noUser || authError?.type === 'auth_required';
  React.useEffect(() => {
    if (requiresLogin) navigateToLogin();
  }, [navigateToLogin, requiresLogin]);

  if (requiresLogin) return null;

  if (isLoadingAuth && timedOut) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg font-semibold text-foreground">App is taking too long to load</p>
        <p className="text-sm text-muted-foreground">This may be a network or session issue.</p>
        <button
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium"
          onClick={() => { localStorage.clear(); sessionStorage.clear(); window.location.reload(); }}
        >Reset &amp; Reload</button>
      </div>
    );
  }

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
  }

  return (
    <SubscriptionProvider>
      <RoleProvider>
        <TenantProvider>
          <BusinessModeProvider>
            <NotificationProvider>
              <RoleHomeRedirect />
              <SubscribedRoutes />
            </NotificationProvider>
          </BusinessModeProvider>
        </TenantProvider>
      </RoleProvider>
    </SubscriptionProvider>
  );
};

// ── Root app ──────────────────────────────────────────────────────────────────
function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <LanguageProvider>
        <Router>
          <AuthProvider>
              <Routes>
              {/* ── NEW ERP Unified Auth (primary entry points) ── */}
              <Route path="/erp-login" element={<ERPLogin />} />
              <Route path="/erp-register" element={<ERPRegister />} />
              <Route path="/platform-owner/login" element={<Suspense fallback={<PageLoader />}><PlatformOwnerLogin /></Suspense>} />
              <Route path="/platform-owner/*" element={<Suspense fallback={<PageLoader />}><PlatformOwnerPortal /></Suspense>} />
              {import.meta.env.DEV && BillingVisualHarness && <Route path="/__test/billing" element={<Suspense fallback={<PageLoader />}><BillingVisualHarness /></Suspense>} />}
              {/* ── Legacy auth routes — all redirect to unified ERP login ── */}
              <Route path="/auth" element={<Navigate to="/erp-login" replace />} />
              <Route path="/invite" element={<LegacyInvitationRedirect />} />
              <Route path="/manager-invite" element={<LegacyInvitationRedirect />} />
              <Route path="/auth/invite" element={<LegacyInvitationRedirect />} />
              <Route path="/auth/manager-login" element={<Navigate to="/erp-login?role=manager" replace />} />
              <Route path="/auth/activate" element={<LegacyInvitationRedirect />} />
              <Route path="/employee-invite" element={<LegacyInvitationRedirect />} />
              <Route path="/auth/employee-login" element={<Navigate to="/erp-login?role=employee" replace />} />
              <Route path="/supplier-registration" element={<LegacyInvitationRedirect />} />
              {/* ── Landing page ── */}
              <Route path="/" element={<LandingPage />} />
              {/* All authenticated routes */}
              <Route path="*" element={<AuthenticatedApp />} />
            </Routes>
            <Toaster />
          </AuthProvider>
        </Router>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
