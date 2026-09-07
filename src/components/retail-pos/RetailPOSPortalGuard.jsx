import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useTenant } from '@/lib/TenantContext';
import { ROLE_HOME, useRole } from '@/lib/RoleContext';
import { isSupermarketProductPortal } from '@/lib/productImportAccess';

export default function RetailPOSPortalGuard({ children }) {
  const { activeRestaurant, loadingRestaurants } = useTenant();
  const { role } = useRole();

  if (loadingRestaurants) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSupermarketProductPortal(activeRestaurant)) {
    return <Navigate to={ROLE_HOME[role] || '/owner-command-center'} replace />;
  }

  return children;
}
