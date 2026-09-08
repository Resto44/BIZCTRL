import React, { createContext, useContext, useState } from 'react';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';

const Scope = createContext({ warehouseId: null, setWarehouseId: () => {} });
export function RetailInventoryScopeProvider({ children }) {
  const { activeRestaurant } = useTenant();
  const { selectedBranchId } = useBranchScope();
  const key = `${activeRestaurant?.id || ''}:${selectedBranchId}`;
  const [selection, setSelection] = useState({ key: '', id: null });
  return <Scope.Provider value={{ warehouseId: selection.key === key ? selection.id : null, setWarehouseId: (id) => setSelection({ key, id: id || null }) }}>{children}</Scope.Provider>;
}
export const useRetailInventoryScope = () => useContext(Scope);
