// @vitest-environment jsdom
import React, { useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  cleanProductBrands, existingProductBrand, fetchProductBrandChoices, normalizeProductBrand,
} from '../src/lib/productBrands.js';

vi.mock('@/components/ui/select', async () => {
  const ReactModule = await import('react');
  const element = tag => ({ children, ...props }) => ReactModule.createElement(tag, props, children);
  return {
    Select: element('div'), SelectTrigger: element('button'),
    SelectValue: ({ placeholder }) => ReactModule.createElement('span', null, placeholder || ''),
    SelectContent: element('div'), SelectItem: element('div'),
  };
});
const { default: ProductBrandPicker } = await import('../src/components/products/ProductBrandPicker.jsx');

describe('ERP Product Master brand selector', () => {
  it('normalizes Arabic/Persian spaces and deduplicates Latin brands without cross-tenant defaults', () => {
    expect(cleanProductBrands([
      { brand: '  Coca   Cola ' }, { brand: 'coca cola' },
      { brand: 'پپسی' }, { brand: '' }, { brand: null }, { brand: '  Pepsi' },
    ])).toEqual(expect.arrayContaining(['Coca Cola', 'پپسی', 'Pepsi']));
    expect(cleanProductBrands(['Coca Cola','coca cola'])).toHaveLength(1);
    expect(existingProductBrand(['Coca Cola'], ' COCA   COLA ')).toBe('Coca Cola');
    expect(normalizeProductBrand('  مياه\nمعدنية  ')).toBe('مياه معدنية');
    expect(cleanProductBrands([], 'Legacy Brand')).toEqual(['Legacy Brand']);
  });

  it('reads the authenticated organization scoped brand vocabulary through read-only RLS RPC', async () => {
    const restaurantId = '11111111-1111-4111-8111-111111111111';
    const db = { rpc: vi.fn(async () => ({ data: [
      { brand: 'Pepsi' }, { brand: 'PEPSI' }, { brand: 'Nestlé' },
    ], error: null })) };
    const brands = await fetchProductBrandChoices(db, restaurantId);
    expect(brands).toHaveLength(2);
    expect(db.rpc).toHaveBeenCalledOnce();
    expect(db.rpc).toHaveBeenCalledWith('erp_product_brand_choices', {
      p_restaurant_id: restaurantId,
    });
    await expect(fetchProductBrandChoices(db, '')).rejects.toThrow('authorized business');
    expect(db.rpc).toHaveBeenCalledOnce();
    const error = { rpc: vi.fn(async () => ({ data: null, error: new Error('RLS or offline error') })) };
    await expect(fetchProductBrandChoices(error, restaurantId)).rejects.toThrow('RLS or offline error');
  });

  it('preserves a product edit brand and selects existing options without guessing on new products', async () => {
    let renderer;
    function Harness({ initial = '' }) {
      const [brand, setBrand] = useState(initial);
      return <ProductBrandPicker value={brand} onChange={setBrand}
        brands={['Coca Cola','Pepsi']} lang="fa" />;
    }
    await act(async () => { renderer = TestRenderer.create(<Harness initial="Coca Cola" />); });
    expect(renderer.root.findByProps({ 'data-testid': 'product-brand-select' }).parent.props.value).toBe('brand:Coca Cola');
    await act(async () => {
      renderer.root.findByProps({ 'data-testid': 'product-brand-select' }).parent.props.onValueChange('brand:Pepsi');
    });
    expect(renderer.root.findByProps({ 'data-testid': 'product-brand-select' }).parent.props.value).toBe('brand:Pepsi');
    await act(async () => { renderer.unmount(); });

    await act(async () => { renderer = TestRenderer.create(<Harness />); });
    expect(renderer.root.findByProps({ 'data-testid': 'product-brand-select' }).parent.props.value).toBe('__none__');
    await act(async () => { renderer.unmount(); });
  });

  it('supports a new brand and reuses the registered spelling for case-only duplicates', async () => {
    let renderer;
    function Harness() {
      const [brand,setBrand] = useState('');
      return <ProductBrandPicker value={brand} onChange={setBrand}
        brands={['Pepsi']} lang="en" />;
    }
    await act(async () => { renderer = TestRenderer.create(<Harness />); });
    const select = () => renderer.root.findByProps({ 'data-testid': 'product-brand-select' }).parent;
    await act(async () => { select().props.onValueChange('__new__'); });
    const input = () => renderer.root.findByProps({ 'aria-label': 'New brand name' });
    await act(async () => { input().props.onChange({ target: { value: '  pepsi  ' } }); });
    await act(async () => { input().props.onBlur(); });
    expect(select().props.value).toBe('brand:Pepsi');
    await act(async () => { select().props.onValueChange('__new__'); });
    await act(async () => { input().props.onChange({ target: { value: '  New   Brand ' } }); });
    await act(async () => { input().props.onBlur(); });
    expect(input().props.value).toBe('New Brand');
    await act(async () => { renderer.unmount(); });
  });

  it('keeps product master payload and save behavior unchanged; SQL respects caller RLS', async () => {
    const form = await readFile('src/components/products/ProductMasterForm.jsx','utf8');
    const ddl = await readFile('supabase/migrations/20261114103000_erp_product_brand_choices.sql','utf8');
    expect(form).toContain('<ProductBrandPicker');
    expect(form).toContain('brands={productBrands}');
    expect(form).toContain("queryKey: ['product-brand-choices', activeRestaurant?.id]");
    expect(form).toContain('brand: existingProductBrand(productBrands, form.brand) || normalizeProductBrand(form.brand)');
    expect(form).toContain('queryClient.invalidateQueries');
    expect(ddl).toContain('security invoker');
    expect(ddl).not.toContain('security definer');
    expect(ddl).toContain('p.restaurant_id = p_restaurant_id');
    expect(ddl).toContain('revoke all');
    expect(ddl).toContain('to authenticated');
  });
});
