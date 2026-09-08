// @vitest-environment jsdom
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  businessType: '',
  createBarcode: vi.fn(),
  branches: [
    { id: 'branch-1', branch_key: 'main', name: 'Main Branch' },
    { id: 'branch-2', branch_key: 'warehouse', name: 'Warehouse' },
  ],
}));

vi.mock('@/lib/productBarcodeRepository', () => ({ createProductBarcode: fixture.createBarcode }));

vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {
      ProductCategory: { filter: vi.fn(async () => [{ id: 'cat-1', name: 'Food', parent_id: null }]) },
      Supplier: { filter: vi.fn(async () => [{ id: 'supplier-1', name: 'Al Noor Foods' }]) },
      ProductUnit: { list: vi.fn(async () => [{ id: 'unit-1', name: 'Carton', abbreviation: 'ctn' }]) },
      Inventory: { filter: vi.fn(async () => []) },
    },
  },
}));

vi.mock('@/lib/TenantContext', () => ({
  useTenant: () => ({ activeRestaurant: { id: 'restaurant-1', business_type: fixture.businessType }, branches: fixture.branches }),
}));

vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({ t: (key) => key, currency: 'SAR ' }),
}));

vi.mock('@/lib/WorkspaceCustomizationContext', () => ({
  useWorkspaceCustomization: () => ({
    isProductFieldVisible: () => true,
    isProductFieldRequired: () => false,
    productCustomFields: [],
  }),
}));

vi.mock('@/components/ui/select', async () => {
  const ReactModule = await import('react');
  const element = (tag) => ({ children, ...props }) => ReactModule.createElement(tag, props, children);
  return {
    Select: element('div'),
    SelectTrigger: element('button'),
    SelectValue: ({ placeholder }) => ReactModule.createElement('span', null, placeholder || ''),
    SelectContent: element('div'),
    SelectItem: element('div'),
  };
});

const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
});

const { default: ProductMasterForm } = await import('../src/components/products/ProductMasterForm.jsx');

function nodeText(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(nodeText).join(' ');
  return node?.props ? nodeText(node.props.children) : '';
}

describe('ProductMasterForm runtime render', () => {
  it('renders and navigates all four ERP steps without crashing', async () => {
    storage.clear();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let renderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <QueryClientProvider client={queryClient}>
          <ProductMasterForm onSubmit={vi.fn()} onCancel={vi.fn()} />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    expect(JSON.stringify(renderer.toJSON())).toContain('Core identity');

    const nameInput = renderer.root.findByProps({ placeholder: 'Main display name' });
    await act(async () => nameInput.props.onChange({ target: { value: 'Chicken Carton' } }));

    const stepButton = (label) => renderer.root.findAllByType('button').find((button) => nodeText(button).includes(label));
    await act(async () => stepButton('Pricing').props.onClick());
    expect(JSON.stringify(renderer.toJSON())).toContain('Purchase & cost');

    await act(async () => stepButton('Inventory').props.onClick());
    const inventoryJson = JSON.stringify(renderer.toJSON());
    expect(inventoryJson).toContain('Branch opening stock');
    expect(inventoryJson).toContain('Main Branch');
    expect(inventoryJson).toContain('Warehouse');

    await act(async () => stepButton('Advanced').props.onClick());
    const advancedJson = JSON.stringify(renderer.toJSON());
    expect(advancedJson).toContain('Accounting mapping');
    expect(advancedJson).toContain('Create Product');
  });
});

it('generates a retail draft barcode, keeps it in the form payload, and never overwrites an entered code', async () => {
  storage.clear();
  fixture.businessType = 'retail';
  fixture.createBarcode.mockResolvedValue({ barcode: 'BC-000000000017', saved: false });
  const onSubmit = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let renderer;
  await act(async () => { renderer = TestRenderer.create(<QueryClientProvider client={client}><ProductMasterForm onSubmit={onSubmit} onCancel={vi.fn()} /></QueryClientProvider>); });
  const button = (label) => renderer.root.findAllByType('button').find((item) => nodeText(item).trim() === label);
  await act(async () => button('Generate barcode').props.onClick());
  expect(fixture.createBarcode).toHaveBeenCalledWith({ restaurantId: 'restaurant-1' });
  expect(renderer.root.findByProps({ placeholder: 'Barcode' }).props.value).toBe('BC-000000000017');
  expect(button('Generate barcode').props.disabled).toBe(true);
  await act(async () => renderer.root.findByProps({ placeholder: 'Main display name' }).props.onChange({ target: { value: 'Test rice' } }));
  await act(async () => renderer.root.findAllByType('button').find((item) => nodeText(item).includes('Advanced')).props.onClick());
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ barcode: 'BC-000000000017', name: 'Test rice' }));
  await act(async () => renderer.unmount());
  fixture.businessType = '';
});
