/**
 * Only supplier-facing email/WhatsApp content. Never include hidden Owner
 * purchase price fields, even when the Owner can see them locally.
 */
export const parsePurchaseOrderItems=items=>{
 try{const x=typeof items==='string'?JSON.parse(items):items;return Array.isArray(x)?x:[];}catch{return [];}
};
export function purchaseOrderSupplierMessage(order,currency='SAR'){
 const items=parsePurchaseOrderItems(order?.items);
 const hidden=Boolean(order?.hide_prices_from_supplier);
 const itemLines=items.map(item=>{
  const label='- '+(item.product_name||item.name||'Product')+': '+(item.qty??item.quantity??0)+' '+(item.unit||'');
  return hidden?label:label+' @ '+currency+Number(item.unit_price||0).toFixed(2);
 }).join('\n');
 const date=String(order?.created_date||order?.date||'').slice(0,10)||'—';
 return [
  'Purchase Order #'+(order?.order_number||String(order?.id||'').slice(-6).toUpperCase()),
  'Date: '+date,
  'Expected Delivery: '+(order?.expected_date||order?.expected_delivery||'TBD'),
  'Branch: '+(order?.branch||'—'),
  '',
  'Items:',
  itemLines,
  '',
  hidden?'Prices are hidden by the Owner.':'Total: '+currency+Number(order?.total_amount||0).toFixed(2),
  '',
  'Notes: '+(order?.notes||'-')
 ].join('\n');
}
