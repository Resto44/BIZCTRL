import React, { createContext, useContext, useMemo, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { audit } from '@/lib/auditLogger';

/**
 * ROLE SYSTEM — 7 ERP Roles
 * ─────────────────────────
 * 1. Owner            — full access, manages all branches
 * 2. General Manager  — cross-branch access, reports to Owner
 * 3. Manager          — single branch, reports to Owner/GM
 * 4. Employee         — single branch, limited ops
 * 5. Kitchen          — single branch, kitchen queue only
 * 6. Supplier         — no branch, purchase orders only
 *
 * Drivers are managed records, not authenticated ERP portal users.
 */

export const ROLES = {
  OWNER:           'owner',
  GENERAL_MANAGER: 'general_manager',
  MANAGER:         'manager',
  EMPLOYEE:        'employee',
  // Retained only to safely quarantine legacy profile values; no driver portal exists.
  DRIVER:          'driver',
  KITCHEN:         'kitchen',
  SUPPLIER:        'supplier',
  // Legacy aliases kept for backward-compat
  SPONSOR:         'sponsor',
  CUSTOMER:        'customer',
};

// Which route each role lands on after login
export const ROLE_HOME = {
  [ROLES.OWNER]:           '/owner-command-center',
  [ROLES.GENERAL_MANAGER]: '/gm-dashboard',
  [ROLES.MANAGER]:         '/manager-dashboard',
  [ROLES.EMPLOYEE]:        '/employee-dashboard',
  [ROLES.DRIVER]:          '/erp-login',
  [ROLES.KITCHEN]:         '/kitchen-dashboard',
  [ROLES.SUPPLIER]:        '/supplier-portal',
  // Legacy
  [ROLES.SPONSOR]:         '/sponsor-dashboard',
  [ROLES.CUSTOMER]:        '/customer-dashboard',
};

// Roles that must never be redirected to onboarding
export const NON_OWNER_ROLES = new Set([
  ROLES.GENERAL_MANAGER,
  ROLES.MANAGER,
  ROLES.EMPLOYEE,
  ROLES.DRIVER,
  ROLES.KITCHEN,
  ROLES.SUPPLIER,
  ROLES.SPONSOR,
  ROLES.CUSTOMER,
]);

const RoleContext = createContext();

// ─── Permission matrix ───────────────────────────────────────────────────────
function buildCan(role) {
  const is = (...r) => r.includes(role);
  
  // Owner has full access
  if (role === ROLES.OWNER) {
    return Object.keys(PERMISSIONS_LIST).reduce((acc, key) => ({ ...acc, [key]: true }), {});
  }

  // General Manager — cross-branch, no billing/admin
  if (role === ROLES.GENERAL_MANAGER) {
    return {
      ...Object.keys(PERMISSIONS_LIST).reduce((acc, key) => ({ ...acc, [key]: true }), {}),
      manageSettings: false,
      manageBranches: false,
      manageRoles: false,
      viewBilling: false,
    };
  }

  return {
    // Dashboard
    viewDashboard:      is(ROLES.MANAGER, ROLES.EMPLOYEE, ROLES.KITCHEN, ROLES.SUPPLIER, ROLES.SPONSOR, ROLES.CUSTOMER),
    // Sales
    viewSales:          is(ROLES.MANAGER),
    // Purchases
    viewPurchases:      is(ROLES.MANAGER, ROLES.SUPPLIER),
    // Inventory
    viewInventory:      is(ROLES.MANAGER),
    // Orders
    viewOrders:         is(ROLES.MANAGER, ROLES.KITCHEN),
    // Staff
    viewStaff:          is(ROLES.MANAGER),
    viewEmployees:      is(ROLES.MANAGER),
    viewPayroll:        is(ROLES.MANAGER),
    viewEmployeeControl: is(ROLES.MANAGER),
    viewStaffAttendance: is(ROLES.MANAGER),
    // Treasury / Finance
    viewTreasury:       is(ROLES.MANAGER),
    viewExpenses:       is(ROLES.MANAGER),
    viewDebts:          is(ROLES.MANAGER),
    viewNetworkAccounts: false,
    viewNetworkAnalytics: false,
    viewSponsorTreasury: is(ROLES.SPONSOR),
    // Suppliers
    viewSuppliers:      is(ROLES.MANAGER, ROLES.SUPPLIER),
    // Delivery
    viewDelivery:       is(ROLES.MANAGER),
    // Brand / Settings
    viewBrandSettings:  false,
    viewBilling:        false,
    // Reports
    viewReports:        is(ROLES.MANAGER, ROLES.SPONSOR),
    viewActivityLogs:   false,
    exportPDF:          false,
    // Attendance
    viewAttendance:     is(ROLES.MANAGER, ROLES.EMPLOYEE),
    // Financials
    viewFinancials:     false,
    viewProfitLoss:     false,
    // Employee Specific
    recordAttendance:   is(ROLES.MANAGER, ROLES.EMPLOYEE),
    viewSchedule:       is(ROLES.MANAGER, ROLES.EMPLOYEE),
    viewTasks:          is(ROLES.MANAGER, ROLES.EMPLOYEE),
    viewSalary:         is(ROLES.EMPLOYEE),
    manageLoans:        is(ROLES.EMPLOYEE),
    viewProfile:        is(ROLES.MANAGER, ROLES.EMPLOYEE, ROLES.CUSTOMER),
    // Driver Specific
    viewDeliveries:     is(ROLES.MANAGER),
    updateDelivery:     is(ROLES.MANAGER),
    viewEarnings:       false,
    // Sponsor Specific
    viewWallet:         is(ROLES.SPONSOR),
    manageTransactions: is(ROLES.SPONSOR),
    viewSponsored:      is(ROLES.SPONSOR),
    // Kitchen Specific
    viewKitchenQueue:   is(ROLES.MANAGER, ROLES.KITCHEN),
    updatePrepStatus:   is(ROLES.MANAGER, ROLES.KITCHEN),
    // Customer Specific
    placeOrders:        is(ROLES.CUSTOMER),
    trackOrders:        is(ROLES.CUSTOMER),
    // Settings / Management
    manageSettings:     false,
    manageBranches:     false,
    manageUsers:        false,
    manageRoles:        false,
    manageCustomers:    false,
    manageDrivers:      false,
    manageKitchen:      false,
    manageSponsors:     false,
    // Legacy / Misc
    uploadSales:        is(ROLES.MANAGER),
    viewAlerts:         is(ROLES.MANAGER),
    viewSupport:        true,
  };
}
const PERMISSIONS_LIST = {
  viewDashboard: false, viewSales: false, viewPurchases: false, viewInventory: false,
  viewOrders: false, viewStaff: false, viewAttendance: false, viewReports: false,
  viewFinancials: false, viewProfitLoss: false, recordAttendance: false,
  viewSchedule: false, viewTasks: false, viewSalary: false, manageLoans: false,
  viewProfile: false, viewDeliveries: false, updateDelivery: false, viewEarnings: false,
  viewWallet: false, manageTransactions: false, viewSponsored: false,
  viewKitchenQueue: false, updatePrepStatus: false, placeOrders: false,
  trackOrders: false, manageSettings: false, manageBranches: false, manageUsers: false,
  manageRoles: false, manageCustomers: false, manageDrivers: false, manageKitchen: false,
  manageSponsors: false, uploadSales: false, viewAlerts: false, viewSupport: true,
  // Additional permissions used in route guards — must be listed here so Owner reduce() grants them
  viewEmployees: false, viewPayroll: false, viewTreasury: false, viewExpenses: false,
  viewDelivery: false, viewBrandSettings: false, viewBilling: false, viewDebts: false,
  viewNetworkAccounts: false, viewNetworkAnalytics: false, viewSponsorTreasury: false,
  viewActivityLogs: false, viewEmployeeControl: false, viewStaffAttendance: false,
  viewSuppliers: false, exportPDF: false,
};
// logSecurityEvent is fire-and-forget via auditLogger
function logSecurityEvent(_user, _type, detail) {
  audit.securityViolation(detail, _user?.role || 'unknown');
}
export function RoleProvider({ children }) {
  const { user, isLoadingAuth } = useAuth();

  const role = useMemo(() => {
    // Do not resolve role until auth has finished loading
    if (isLoadingAuth || !user) return ROLES.OWNER;
    // Normalize role strings to match our ROLES constant
    const r = (user?.role || '').toLowerCase();
    if (Object.values(ROLES).includes(r)) return r;
    if (r === 'admin' || r === 'restaurant_admin') return ROLES.OWNER;
    if (r === 'staff') return ROLES.EMPLOYEE;
    return ROLES.OWNER; // Safe default
  }, [user, isLoadingAuth]);

  const can = useMemo(() => {
    // Start with role-based defaults
    const base = buildCan(role);
    // Merge with per-user DB permissions (from user.permissions JSONB)
    // DB permissions can only GRANT additional permissions, never revoke owner-level
    const dbPerms = user?.permissions;
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
  if (!ctx) return { role: ROLES.OWNER, can: buildCan(ROLES.OWNER), user: null };
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
      if (dashboardRole !== role && role !== ROLES.OWNER && role !== ROLES.GENERAL_MANAGER) {
        navigate(ROLE_HOME[role] || '/owner-command-center', { replace: true });
      }
    }
  }, [location.pathname, role, user, isLoadingAuth]);
}
