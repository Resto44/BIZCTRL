/**
 * AppLayout — Root authenticated layout shell.
 *
 * Wraps all authenticated routes with:
 *   - ERPLayout (enterprise sidebar + header + bottom nav)
 *   - Route guard enforcement
 *   - Audit logger initialization
 *   - Notification popups
 *   - PWA install banner
 *   - Unified Customer Credit screen for the customer-management route
 */
import React, { lazy, Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import ERPLayout from './ERPLayout';
import OwnerWorkspaceTabs from './OwnerWorkspaceTabs';
import NotificationPopups from '@/components/notifications/NotificationPopups.jsx';
import { useAuth } from '@/lib/AuthContext';
import { initAuditLogger } from '@/lib/auditLogger';
import { useRouteGuard } from '@/lib/RoleContext';
import PWAInstallBanner from '@/components/pwa/PWAInstallBanner';
import SubscriptionStatusBanner from '@/components/subscription/SubscriptionStatusBanner';

const CustomerCredit = lazy(() => import('@/pages/CustomerCredit'));

function RouteEnforcer() {
  useRouteGuard();
  return null;
}

const CustomerCreditFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" aria-label="Loading customer credit" />
  </div>
);

export default function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const showUnifiedCustomerCredit = location.pathname === '/customer-management' && searchParams.get('mode') !== 'directory';

  useEffect(() => {
    if (user) initAuditLogger(user);
  }, [user]);

  return (
    <ERPLayout>
      <RouteEnforcer />
      <div className="mx-auto w-full min-w-0 max-w-[1600px] px-4 py-4 lg:px-6">
        <SubscriptionStatusBanner />
        <OwnerWorkspaceTabs />
      </div>
      {showUnifiedCustomerCredit ? (
        <Suspense fallback={<CustomerCreditFallback />}>
          <CustomerCredit />
        </Suspense>
      ) : (
        <Outlet />
      )}
      <NotificationPopups />
      <PWAInstallBanner />
    </ERPLayout>
  );
}
