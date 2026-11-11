import { supabase } from '@/api/supabaseClient';
export { isRestaurantPOSPortal } from '@/lib/productImportAccess';
export async function restaurantRpc(name, args, client = supabase) {
  const { data, error } = await client.rpc(`erp_restaurant_${name}`, args);
  if (error) throw error;
  return data;
}
// Sales Closing customer credit uses a finance-scoped RPC that intentionally does
// not have the erp_restaurant_ prefix used by the cashier command namespace.
export async function customerCreditPOSMenuRpc(args, client = supabase) {
  const {data,error} = await client.rpc('erp_customer_credit_pos_items',args);
  if(error) throw error;
  if(!Array.isArray(data)) throw new Error('CUSTOMER_CREDIT_POS_MENU_INVALID_RESPONSE');
  return data;
}
export const restaurantProductName = (item, lang) => item?.[`name_${lang}`] || item?.name || item?.name_en || '';
export const restaurantBusinessDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const kitchenNextState = status => ({ queued: 'preparing', preparing: 'ready', ready: 'served' })[status] || null;
export function parseRecipeRows(rows) {
  return rows.filter(row => row.inventory_id).map(row => {
    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Every ingredient needs a positive quantity in its inventory unit.');
    return { inventory_id: row.inventory_id, quantity };
  });
}
