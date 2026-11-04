// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, Link, useLocation } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import OwnerWorkspaceTabs from '@/components/layout/OwnerWorkspaceTabs';
import UniversalTouchPOSRoute from '@/components/pos-touch/UniversalTouchPOSRoute';
import WorkspaceNavigate from '@/components/layout/WorkspaceNavigate';
vi.mock('@/lib/TenantContext', () => ({ useTenant: () => ({ activeRestaurant: { business_mode: 'restaurant' }, loadingRestaurants: false }) }));
vi.mock('@/lib/RoleContext', () => ({ ROLES: { OWNER: 'owner' }, useRole: () => ({ role: 'owner' }) }));
vi.mock('@/components/layout/ERPSidebar', () => ({ ERP_NAV_GROUPS: [] }));
function Location() { return <output data-location>{useLocation().pathname}</output>; }
describe('cached redirect navigation', () => {
  it.each(['/products', '/approval-center', '/smart-alerts', '/pos'])('can leave and revisit %s without a hidden redirect hijacking navigation', async (alias) => {
    const destination = alias === '/pos' ? '/restaurant/pos' : '/destination';
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const click = async (path) => act(async () => container.querySelector(`a[href="${path}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })));
    try {
      await act(async () => root.render(<MemoryRouter initialEntries={[alias]}><Location /><Link to="/sales">Sales</Link><Link to={alias}>Alias</Link><Routes><Route element={<OwnerWorkspaceTabs />}><Route path={alias} element={alias === '/pos' ? <UniversalTouchPOSRoute /> : <WorkspaceNavigate to={destination} replace />} /><Route path={destination} element={<h1>Destination</h1>} /><Route path="/sales" element={<h1>Sales</h1>} /></Route></Routes></MemoryRouter>));
      expect(container.querySelector('output').textContent).toBe(destination);
      await click('/sales');
      expect(container.querySelector('output').textContent).toBe('/sales');
      await click(alias);
      expect(container.querySelector('output').textContent).toBe(destination);
      await click('/sales');
      expect(container.querySelector('output').textContent).toBe('/sales');
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
});
