import { supabase } from '@/api/supabaseClient';

export async function createProductBarcode({ restaurantId, productId = null }) {
  if (!restaurantId) throw new Error('Select a business first.');
  const { data, error } = await supabase.rpc('erp_create_product_barcode', {
    p_restaurant_id: restaurantId,
    p_product_id: productId,
  });
  if (error) throw new Error(error.message || 'Unable to create barcode.');
  if (typeof data?.barcode !== 'string' || !data.barcode.trim() || (productId && (!data.saved || data.product_id !== productId))) {
    throw new Error('The barcode was not confirmed. Please try again.');
  }
  return data;
}
