import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  auth: { user: null, isLoadingAuth: false },
  organizations: {
    'owner-a': { id: 'restaurant-a', email: 'owner-a@example.test', name: 'Restaurant A', business_mode: 'restaurant' },
    'owner-b': { id: 'restaurant-b', email: 'owner-b@example.test', name: 'Pharmacy B', business_mode: 'pharmacy' },
    'owner-a-second': { id: 'restaurant-c', email: 'owner-a@example.test', name: 'Retail C', business_mode: 'retail' },
  },
}));

vi.mock('@/lib/AuthContext', () => ({ useAuth: () => fixture.auth }));
vi.mock('@/lib/RoleContext', () => ({
  ROLES: { OWNER: 'owner', MANAGER: 'manager', EMPLOYEE: 'employee', CUSTOMER: 'customer', SPONSOR: 'sponsor' },
  useRole: () => ({ role: fixture.auth.user?.role || 'employee' }),
}));

vi.mock('@/api/supabaseClient', () => ({
  supabase: {
    from: (table) => {
      const filters = {};
      const query = {
        select: () => query,
        eq: (key, value) => { filters[key] = value; return query; },
        in: (key, values) => { filters[key] = values; return query; },
        then: (resolve) => {
          if (table === 'erp_memberships') {
            const organizations = Object.values(fixture.organizations).filter((item) => item.email === fixture.auth.user?.email);
            return Promise.resolve({ data: organizations.map((item) => ({ restaurant_id: item.id })), error: null }).then(resolve);
          }
          if (table === 'restaurants') {
            const organizations = Object.values(fixture.organizations).filter((item) => filters.id?.includes?.(item.id));
            return Promise.resolve({ data: organizations, error: null }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
        limit: async () => {
          if (table === 'restaurants') {
            const organization = Object.values(fixture.organizations).find((item) => item.id === filters.id);
            return { data: organization ? [organization] : [], error: null };
          }
          return { data: [], error: null };
        },
        order: async () => ({ data: [], error: null }),
        single: async () => {
          if (table === 'erp_memberships') {
            const organization = fixture.organizations[filters.user_id];
            return { data: organization ? { restaurant_id: organization.id } : null, error: null };
          }
          return { data: null, error: null };
        },
      };
      return query;
    },
    rpc: async (_name, { p_restaurant_id }) => {
      const organization = Object.values(fixture.organizations).find((item) => item.id === p_restaurant_id);
      return { data: organization ? [{ restaurant_id: organization.id, portal_name: organization.business_mode, owner_name: organization.name.replace(/ .*/, ' Owner') }] : [], error: null };
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  },
}));

const { TenantProvider, useTenant } = await import('../src/lib/TenantContext.jsx');

function TenantProbe() {
  const { activeRestaurant, portalIdentity, setActiveRestaurant } = useTenant();
  return React.createElement('output', { onClick: () => setActiveRestaurant('restaurant-c') }, `${activeRestaurant?.id || 'none'}|${portalIdentity?.owner_name || 'none'}`);
}

function renderTenantTree(queryClient) {
  return React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(TenantProvider, null, React.createElement(TenantProbe)));
}

async function flush(times = 4) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
}

describe('TenantProvider portal identity session transitions', () => {
  it('clears the prior identity and renders only the next organization after logout/login', async () => {
    const localStorageData = new Map();
    globalThis.localStorage = {
      getItem: (key) => localStorageData.get(key) || null,
      setItem: (key, value) => localStorageData.set(key, String(value)),
      removeItem: (key) => localStorageData.delete(key),
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
    fixture.auth = { user: { id: 'owner-a', email: 'owner-a@example.test', role: 'owner' }, isLoadingAuth: false };
    let renderer;
    await act(async () => { renderer = TestRenderer.create(renderTenantTree(queryClient)); });
    await flush();
    expect(renderer.toJSON().children.join('')).toBe('restaurant-a|Restaurant Owner');

    fixture.auth = { user: null, isLoadingAuth: false };
    await act(async () => { renderer.update(renderTenantTree(queryClient)); });
    await flush();
    expect(renderer.toJSON().children.join('')).not.toContain('Restaurant Owner');

    fixture.auth = { user: { id: 'owner-b', email: 'owner-b@example.test', role: 'owner' }, isLoadingAuth: false };
    await act(async () => { renderer.update(renderTenantTree(queryClient)); });
    await flush();
    const output = renderer.toJSON().children.join('');
    expect(output).toBe('restaurant-b|Pharmacy Owner');
    expect(output).not.toContain('Restaurant Owner');
  });

  it('replaces the portal identity when the same owner switches active restaurant', async () => {
    const localStorageData = new Map();
    globalThis.localStorage = {
      getItem: (key) => localStorageData.get(key) || null,
      setItem: (key, value) => localStorageData.set(key, String(value)),
      removeItem: (key) => localStorageData.delete(key),
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
    fixture.auth = { user: { id: 'owner-a', email: 'owner-a@example.test', role: 'owner' }, isLoadingAuth: false };
    let renderer;
    await act(async () => { renderer = TestRenderer.create(renderTenantTree(queryClient)); });
    await flush();
    expect(renderer.toJSON().children.join('')).toBe('restaurant-a|Restaurant Owner');
    await act(async () => { renderer.toJSON().props.onClick(); });
    await flush();
    const output = renderer.toJSON().children.join('');
    expect(output).toBe('restaurant-c|Retail Owner');
    expect(output).not.toContain('Restaurant Owner');
  });
});
