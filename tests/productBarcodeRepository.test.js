import { beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/api/supabaseClient', () => ({ supabase: { rpc } }));
import { createProductBarcode } from '@/lib/productBarcodeRepository';
beforeEach(() => rpc.mockReset());
describe('barcode persistence confirmation', () => {
  it('sends the exact tenant and product UUID and preserves returned text', async () => {
    rpc.mockResolvedValue({ data: { product_id: 'p1', barcode: '000742', saved: true }, error: null });
    expect((await createProductBarcode({ restaurantId: 'r1', productId: 'p1' })).barcode).toBe('000742');
    expect(rpc).toHaveBeenCalledWith('erp_create_product_barcode', { p_restaurant_id: 'r1', p_product_id: 'p1' });
  });
  it('allocates unsaved form values without a product ID', async () => {
    rpc.mockResolvedValue({ data: { barcode: 'BC-000000000003', saved: false } });
    expect((await createProductBarcode({ restaurantId: 'r1' })).saved).toBe(false);
    expect(rpc).toHaveBeenCalledWith('erp_create_product_barcode', { p_restaurant_id: 'r1', p_product_id: null });
  });
  it.each([{ barcode: '123', saved: false }, { barcode: '123', saved: true, product_id: 'other' }, { barcode: 123, saved: true, product_id: 'p1' }])('rejects an unconfirmed save', async (data) => {
    rpc.mockResolvedValue({ data });
    await expect(createProductBarcode({ restaurantId: 'r1', productId: 'p1' })).rejects.toThrow('not confirmed');
  });
  it('propagates permission failures and refuses missing tenant', async () => {
    await expect(createProductBarcode({})).rejects.toThrow('Select a business');
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ error: { message: 'Permission denied' } });
    await expect(createProductBarcode({ restaurantId: 'r1' })).rejects.toThrow('Permission denied');
  });
});
