import React from 'react';
import { Navigate } from 'react-router-dom';
import { MonitorSmartphone } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { businessTouchPosPath } from '@/lib/productImportAccess';

// One stable entry point; sale processing stays in the established
// restaurant or stock-backed commerce cashier engine with server-side guards.
export default function UniversalTouchPOSRoute() {
  const { activeRestaurant, loadingRestaurants } = useTenant();
  if (loadingRestaurants) return <div role="status" className="flex min-h-[45vh] items-center justify-center gap-2">
    <MonitorSmartphone className="h-5 w-5" />Loading POS…
  </div>;
  const path = businessTouchPosPath(activeRestaurant);
  if (!path) return <section role="alert" className="m-4 rounded-xl border p-4">
    POS is unavailable for this business type. Select an organization with an active supported business portal.
  </section>;
  return <Navigate to={path} replace />;
}
