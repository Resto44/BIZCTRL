// Browser helpers are UX only. Supabase independently validates identity,
// branch, price, payment status, quantity and delivery address server-side.
export function customerOrderValidPhone(value) {
  return typeof value === 'string' && /^[+0-9 ()-]{7,24}$/.test(value.trim()) && (value.match(/[0-9]/g)||[]).length >= 7 && (value.match(/[0-9]/g)||[]).length <= 15;
}
export function customerOrderDeliveryValid(fulfillment, address, phone) {
  if (fulfillment === 'pickup') return true;
  if (fulfillment !== 'delivery') return false;
  const location = typeof address === 'string' ? address.trim() : '';
  return location.length >= 10 && location.length <= 400 && customerOrderValidPhone(phone);
}
export function customerOrderCart(catalog = [], cart = {}) {
  const catalogMap = new Map((Array.isArray(catalog)?catalog:[]).map(row=>[row.id,row]));
  return Object.entries(cart || {})
    .filter(([id,quantity])=>catalogMap.has(id)&&Number.isInteger(quantity)&&quantity>0&&quantity<=20)
    .map(([id,quantity])=>({...catalogMap.get(id),quantity}));
}
export function customerOrderCartTotal(selected = []) {
  return selected.reduce((sum,line)=>sum+Math.round(Number(line.price||0)*100)*line.quantity,0)/100;
}
