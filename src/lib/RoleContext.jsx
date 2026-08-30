import React, { createContext, useContext, useMemo, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { audit } from '@/lib/auditLogger';

/**
 * OWNER-CONTROLLED ERP ROLE SYSTEM
 * ─────────────────────────
 * 1. Owner            — full access, manages all branches
 * 2. Manager          — assigned branch, permissions granted by Owner
 * 3. Employee         — assigned branch, permissions granted by Owner
 * 4. Supplier         — assigned supplier workflow, permissions granted by Owner
 *
 * Drivers are managed records, not authenticated ERP portal users.
 */

export const ROLES = {
  OWNER:           'owner',
  MANAGER:         'manager',
  EMPLOYEE:        'employee',
  SUPPLIER:        'supplier',
  // Temporary source-compatibility alias. Canonical session resolution maps
  // every legacy general_manager membership to manager in the database.
  GENERAL_MANAGER: 'general_manager',
  // Legacy aliases kept for backward-compat
  SPONSOR:         'sponsor',
  CUSTOMER:        'customer',
};

// Which route each role lands on after login
export const ROLE_HOME = {
  [ROLES.OWNER]:           '/owner-command-center',
  [ROLES.GENERAL_MANAGER]: '/manager-dashboard',
  [ROLES.MANAGER]:         '/manager-dashboard',
  [ROLES.EMPLOYEE]:        '/employee-dashboard',
  [ROLES.SUPPLIER]:        '/supplier-portal',
  // Legacy
  [ROLES.SPONSOR]:         '/sponsor-dashboard',
  [ROLES.CUSTOMER]:        '/customer-dashboard',
};

// Roles that must never be redirected to onboarding
export const NON_OWNER_ROLES = new Set([
  ROLES.MANAGER,
  ROLES.EMPLOYEE,
  ROLES.SUPPLIER,
  ROLES.SPONSOR,
  ROLES.CUSTOMER,
]);

const RoleContext = createContext();

// ─── Permission matrix ───────────────────────────────────────────────────────
function buildCan(role) {
  // Owner has full access
  if (role === ROLES.OWNER) {
    return Object.keys(PERMISSIONS_LIST).reduce((acc, key) => ({ ...acc, [key]: true }), {});
  }
  // Non-owner permissions are never inferred in the browser. The canonical
  // effective permission object is returned by erp_get_session_context().
  return { ...PERMISSIONS_LIST };
}
const PERMISSIONS_LIST = {
  viewDashboard: false, viewSales: false, viewPurchases: false, viewInventory: false,
  viewOrders: false, viewStaff: false, viewAttendance: false, viewReports: false,
  viewFinancials: false, viewProfitLoss: false, recordAttendance: false,
  viewSchedule: false, viewTasks: false, viewSalary: false, manageLoans: false,
  viewProfile: false, viewDeliveries: false, updateDelivery: false,
  viewWallet: false, manageTransactions: false, viewSponsored: false,
  placeOrders: false,
  trackOrders: false, manageSettings: false, manageBranches: false, manageUsers: false,
  manageRoles: false, manageCustomers: false, manageDrivers: false,
  manageSponsors: false, manageDashboardCustomization: false, uploadSales: false, viewAlerts: false, viewSupport: false,
  // Additional permissions used in route guards — must be listed here so Owner reduce() grants them
  viewEmployees: false, viewPayroll: false, viewTreasury: false, viewExpenses: false,
  viewDelivery: false, viewBrandSettings: false, viewBilling: false, viewDebts: false,
  viewNetworkAccounts: false, viewNetworkAnalytics: false, viewSponsorTreasury: false,
  viewActivityLogs: false, viewEmployeeControl: false, viewStaffAttendance: false,
  viewSuppliers: false, exportPDF: false,
  createPurchases: false, approvePurchases: false, viewPurchaseOrders: false,
  updatePurchaseOrders: false, viewInvoices: false, createInvoices: false,
  viewPayments: false, viewProducts: false, updateInventory: false,
  manageSuppliers: false, createExpenses: false, approveExpenses: false,
};
// logSecurityEvent is fire-and-forget via auditLogger
function logSecurityEvent(_user, _type, detail) {
  audit.securityViolation(detail, _user?.role || 'unknown');
}
export function RoleProvider({ children }) {
  const { user, isLoadingAuth } = useAuth();

  const role = useMemo(() => {
    // Do not resolve role until auth has finished loading
    if (isLoadingAuth || !user) return ROLES.EMPLOYEE;
    // Normalize role strings to match our ROLES constant
    const r = (user?.role || '').toLowerCase();
    if (r === ROLES.GENERAL_MANAGER) return ROLES.MANAGER;
    if ([ROLES.OWNER, ROLES.MANAGER, ROLES.EMPLOYEE, ROLES.SUPPLIER].includes(r)) return r;
    if (r === 'admin' || r === 'restaurant_admin') return ROLES.OWNER;
    if (r === 'staff') return ROLES.EMPLOYEE;
    return ROLES.EMPLOYEE; // Deny by default until a recognized role is available
  }, [user, isLoadingAuth]);

  const can = useMemo(() => {
    // Start fail-closed; only the server-computed permission object may grant.
    const base = buildCan(role);
    // Merge with per-user DB permissions (from user.permissions JSONB)
    // DB permissions can only GRANT additional permissions, never revoke owner-level
    const dbPerms = user?.effective_permissions || user?.permissions;
    if (!dbPerms || typeof dbPerms !== 'object') return base;
    // For owner: always full access, ignore DB overrides
    if (role === ROLES.OWNER) return base;
    // Merge: DB permissions override defaults for non-owner roles
    return { ...base, ...dbPerms };
  }, [role, user?.permissions]);

  return (
    <RoleContext.Provider value={{ role, can, user, isLoadingAuth }}>
      {children}
    </RoleContext.Provider>
  );
}
export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) return { role: ROLES.EMPLOYEE, can: buildCan(ROLES.EMPLOYEE), user: null };
  return ctx;
}
export function useRouteGuard() {
  const { role, user, isLoadingAuth } = useRole();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    // Never redirect while auth is still loading — role is not yet final
    if (isLoadingAuth || !user) return;
    const path = location.pathname;
    // Whitelist bypass for home, auth, and onboarding
    if (['/', '/auth', '/erp-login', '/erp-register', '/onboarding', '/support'].includes(path)) return;
    // Check if the role is allowed to be on this specific dashboard
    if (path.endsWith('-dashboard')) {
      const dashboardRole = path.replace('/', '').replace('-dashboard', '');
      if (dashboardRole !== role && role !== ROLES.OWNER) {
        navigate(ROLE_HOME[role] || '/owner-command-center', { replace: true });
      }
    }
  }, [location.pathname, role, user, isLoadingAuth]);
}
