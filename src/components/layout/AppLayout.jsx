/**
 * AppLayout — Root authenticated layout shell.
 *
 * Wraps all authenticated routes with:
 *   - ERPLayout (enterprise sidebar + header + bottom nav)
 *   - Route guard enforcement
 *   - Audit logger initialization
 *   - Notification popups
 *   - PWA install banner
 */
import React, { useEffect } from 'react';

import ERPLayout from './ERPLayout';
import OwnerWorkspaceTabs from './OwnerWorkspaceTabs';
import NotificationPopups from '@/components/notifications/NotificationPopups.jsx';
import { useAuth } from '@/lib/AuthContext';
import { initAuditLogger } from '@/lib/auditLogger';
import { useRouteGuard } from '@/lib/RoleContext';
import PWAInstallBanner from '@/components/pwa/PWAInstallBanner';
import SubscriptionStatusBanner from '@/components/subscription/SubscriptionStatusBanner';

function RouteEnforcer() {
  useRouteGuard();
  return null;
}

export default function AppLayout() {
  const { user } = useAuth();

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
      <NotificationPopups />
      <PWAInstallBanner />
    </ERPLayout>
  );
}
