// @vitest-environment jsdom
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { buildProductControlSnapshot } from '../src/lib/productControlCenter.js';

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

vi.mock('@/components/ui/switch', async () => {
  const ReactModule = await import('react');
  return {
    Switch: ({ checked, onCheckedChange }) => ReactModule.createElement('button', {
      type: 'button',
      'aria-pressed': checked,
      onClick: () => onCheckedChange?.(!checked),
    }),
  };
});

vi.mock('@/lib/productCatalogRepository', () => ({
  EMPTY_COUNTS: { master_total: 1, active_total: 1, branch_assigned: 0, branch_unassigned: 1, low_stock: 0, out_of_stock: 0, inventory_value: 0 },
  searchMasterProducts: vi.fn().mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 50 }),
  getProductCatalogCounts: vi.fn().mockResolvedValue({ master_total: 1, active_total: 1, branch_assigned: 0, branch_unassigned: 1 }),
  setBranchProductAssortment: vi.fn().mockResolvedValue(1),
  createProductImportJob: vi.fn().mockResolvedValue('job-1'),
  updateProductImportJob: vi.fn().mockResolvedValue(undefined),
  importMasterProducts: vi.fn().mockResolvedValue({ processed: 0, created: 0, updated: 0, failed: 0, branch_added: 0, errors: [] }),
}));

const { default: ProductMasterWorkspace } = await import('../src/components/products/ProductMasterWorkspace.jsx');

function nodeText(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(nodeText).join(' ');
  return node?.props ? nodeText(node.props.children) : '';
}

describe('Master Product Management workspace', () => {
  it('navigates all four responsive ERP pages without crashing', async () => {
    const product = {
      id: 'product-1', product_id: 'SKU-1', sku: 'SKU-1', name: 'Chicken Carton',
      category: 'Food', unit: 'Carton', purchase_cost: 100, selling_price: 140, status: 'active',
    };
    const snapshot = buildProductControlSnapshot({
      products: [product],
      inventory: [{ id: 'stock-1', product_id: 'SKU-1', branch_id: 'branch-1', opening_stock: 8, low_stock_threshold: 10 }],
      branches: [{ id: 'branch-1', name: 'Main Branch' }],
    });
    let renderer;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await act(async () => {
      renderer = TestRenderer.create(
        <QueryClientProvider client={queryClient}><ProductMasterWorkspace
          restaurantId="restaurant-1"
          snapshot={snapshot}
          productsLoading={false}
          categories={[{ id: 'cat-1', name: 'Food' }]}
          transactions={[]}
          suppliers={[]}
          branches={[{ id: 'branch-1', name: 'Main Branch' }]}
          selectedLocation="all"
          onSelectedLocationChange={vi.fn()}
          money={(value) => `SAR ${Number(value).toFixed(2)}`}
          priceRules={{ minimum_margin: 22, max_discount: 10, cost_change_review_percent: 5, branch_override_requires_approval: true, price_includes_vat: true, vat_rate: 15 }}
          setPriceRules={vi.fn()}
          savePriceRules={vi.fn()}
          savingPriceRules={false}
          onAdd={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onAdjust={vi.fn()}
          onArchive={vi.fn()}
          onImport={vi.fn()}
          onExport={vi.fn()}
          onRefresh={vi.fn()}
          onNavigate={vi.fn()}
          onManageCategories={vi.fn()}
          onManageUnits={vi.fn()}
          canImportProductSpreadsheet={false}
          canDeleteProducts={false}
        /></QueryClientProvider>,
      );
    });

    expect(JSON.stringify(renderer.toJSON())).toContain('AI Insights');
    expect(JSON.stringify(renderer.toJSON())).not.toContain('Import Excel');
    const openPage = async (label) => {
      const button = renderer.root.findAllByType('button').find((item) => nodeText(item).trim() === label);
      expect(button).toBeTruthy();
      await act(async () => button.props.onClick());
    };

    await openPage('Catalog');
    expect(JSON.stringify(renderer.toJSON())).toContain('Master Catalog');
    await openPage('Inventory');
    expect(JSON.stringify(renderer.toJSON())).toContain('Inventory Control');
    await openPage('Pricing');
    expect(JSON.stringify(renderer.toJSON())).toContain('Pricing & Governance');
  });
});
