// Independent of payment status; checks invoice metadata before offering Owner receipt.
export const approvedPurchaseForDelivery = invoice =>
 Boolean(invoice?.id && invoice?.restaurant_id && invoice?.supplier_id &&
   (invoice?.branch_id||invoice?.branch) &&
   ['approved','auto_approved'].includes(invoice?.approval_status) &&
   ['approved','paid','partial','unpaid'].includes(invoice?.status) &&
   Array.isArray(invoice?.items) && invoice.items.length>0 &&
   invoice.items.length<=100);

export const purchaseInvoiceItemQuantity = item=>Number(item?.quantity??item?.qty);
export const validFullPurchaseDelivery = (items,acknowledged) =>
 Array.isArray(items)&&items.length>0&&items.length<=100&&
 items.every((item,index)=>Boolean(String(item?.product_name||item?.name||'').trim())&&
   Number.isFinite(purchaseInvoiceItemQuantity(item))&&
   purchaseInvoiceItemQuantity(item)>0&&
   purchaseInvoiceItemQuantity(item)<=1000000&&
   acknowledged[index]===true);
export const purchaseDeliveryConfirmationLines = items=>items.map((item,index)=>({
 line_index:index,received_qty:purchaseInvoiceItemQuantity(item)
}));
