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
import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useRole } from '@/lib/RoleContext';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
const PortalPushSettings = lazy(() => import('@/components/notifications/PortalPushSettings'));


import ERPLayout from './ERPLayout';
import OwnerWorkspaceTabs from './OwnerWorkspaceTabs';
import NotificationRecordLink from '@/components/notifications/NotificationRecordLink';
import NotificationPopups from '@/components/notifications/NotificationPopups.jsx';
import { useAuth } from '@/lib/AuthContext';
import { initAuditLogger } from '@/lib/auditLogger';
import { useRouteGuard } from '@/lib/RoleContext';
import PWAInstallBanner from '@/components/pwa/PWAInstallBanner';
import NewUserWelcomeTour from '@/components/onboarding/NewUserWelcomeTour';
import { isNewSaaSUser } from '@/lib/newUserWelcomeTour';
import SubscriptionStatusBanner from '@/components/subscription/SubscriptionStatusBanner';

function RouteEnforcer() {
  useRouteGuard();
  return null;
}

export default function AppLayout() {
  const { user } = useAuth();
  const { role } = useRole();
  const { activeRestaurant } = useTenant();
  const { lang } = useLanguage();
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    if (user) initAuditLogger(user);
  }, [user]);

  return (
    <ERPLayout>
      <RouteEnforcer />
      <div className="mx-auto w-full min-w-0 max-w-[1600px] px-4 py-2 sm:py-4 lg:px-6">
        <SubscriptionStatusBanner />
        {user?.id && activeRestaurant?.id && <Suspense fallback={null}>
          <PortalPushSettings role={role} restaurantId={activeRestaurant.id} language={lang} />
        </Suspense>}
        <NotificationRecordLink><OwnerWorkspaceTabs /></NotificationRecordLink>
      </div>
      <NotificationPopups />
      <NewUserWelcomeTour onVisibleChange={setTourOpen} />
      {/* New users already get install instructions in the tour; avoid two prompts. */}
      {!tourOpen && !isNewSaaSUser(user?.created_at) && <PWAInstallBanner />}
    </ERPLayout>
  );
}
