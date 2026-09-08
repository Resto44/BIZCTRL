// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), search: vi.fn() }));
vi.mock('@/lib/productBarcodeRepository', () => ({ createProductBarcode: mocks.create }));
vi.mock('@/lib/productCatalogRepository', () => ({ searchMasterProducts: mocks.search }));
import ProductBarcodeDialog from '@/components/products/ProductBarcodeDialog';
import BarcodeGenerator from '@/components/products/BarcodeGenerator';
let root, container, client;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => {
  mocks.create.mockReset(); mocks.search.mockReset();
  mocks.search.mockResolvedValue({ rows: [], total: 0 });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: (text) => ({ width: text.length * 8 }) });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); client.clear(); vi.restoreAllMocks(); });
const button = (label) => [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === label);
const render = async (element) => { await act(async () => { root.render(<QueryClientProvider client={client}>{element}</QueryClientProvider>); }); };
const click = async (label) => { await act(async () => button(label).click()); };
const product = { id: 'p1', name: 'Fresh milk', name_ar: 'حليب طازج', sku: 'SKU-1', barcode: null };

describe('Create Barcode user flow', () => {
  it('shows persistence errors, then generates once and enables printing only after confirmation', async () => {
    const changed = vi.fn();
    mocks.create.mockRejectedValueOnce(new Error('Permission denied'));
    await render(<ProductBarcodeDialog restaurantId="r1" initialProduct={product} onClose={vi.fn()} onChanged={changed} />);
    expect(button('Print labels')).toBeUndefined();
    await click('Generate & save barcode');
    expect(document.body.textContent).toContain('Permission denied');
    expect(button('Print labels')).toBeUndefined();
    let resolve;
    mocks.create.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await click('Generate & save barcode');
    expect(button('Creating…').disabled).toBe(true);
    await act(async () => resolve({ barcode: 'BC-000000000017', saved: true, product_id: 'p1' }));
    expect(button('Print labels').disabled).toBe(false);
    expect(document.querySelector('img').alt).toBe('BC-000000000017');
    expect(mocks.create).toHaveBeenLastCalledWith({ restaurantId: 'r1', productId: 'p1' });
    expect(changed).toHaveBeenCalledOnce();
  });
  it('keeps existing barcodes and handles blocked mobile print popups', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    await render(<ProductBarcodeDialog restaurantId="r1" initialProduct={{ ...product, barcode: '000742' }} onClose={vi.fn()} />);
    expect(button('Generate & save barcode')).toBeUndefined();
    expect(document.querySelector('img').alt).toBe('000742');
    await click('Print labels');
    expect(document.body.textContent).toContain('Allow pop-up windows');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('never exports an unsaved draft label', async () => {
    await render(<BarcodeGenerator product={{ ...product, barcode: 'BC-000000000017' }} />);
    expect(button('Print labels').disabled).toBe(true);
    expect(button('Download barcode PNG').disabled).toBe(true);
  });
  it('opens a tenant-scoped paginated product picker and selects a real product', async () => {
    mocks.search.mockResolvedValue({ rows: [{ ...product, product_data: product }], total: 21 });
    await render(<ProductBarcodeDialog restaurantId="r1" onClose={vi.fn()} />);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(mocks.search).toHaveBeenCalledWith({ restaurantId: 'r1', query: '', page: 1, pageSize: 20 });
    await click('Next');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(mocks.search).toHaveBeenLastCalledWith({ restaurantId: 'r1', query: '', page: 2, pageSize: 20 });
    await click('Fresh milkSKU-1');
    expect(button('Generate & save barcode')).toBeTruthy();
  });
  it('does not show a completed old-tenant request in a newly mounted dialog', async () => {
    let resolve;
    mocks.create.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const changed = vi.fn();
    await render(<ProductBarcodeDialog key="r1" restaurantId="r1" initialProduct={product} onClose={vi.fn()} onChanged={changed} />);
    await click('Generate & save barcode');
    await render(<ProductBarcodeDialog key="r2" restaurantId="r2" initialProduct={{ ...product, id: 'p2', name: 'Other store product' }} onClose={vi.fn()} />);
    await act(async () => resolve({ barcode: 'BC-000000000017', saved: true }));
    expect(document.body.textContent).toContain('Other store product');
    expect(document.querySelector('img')).toBeNull();
    expect(button('Generate & save barcode')).toBeTruthy();
    expect(changed).toHaveBeenCalledOnce();
  });
});
