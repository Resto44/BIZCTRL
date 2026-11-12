import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {approvedPurchaseForDelivery,purchaseInvoiceItemQuantity,validFullPurchaseDelivery,purchaseDeliveryConfirmationLines} from '../src/lib/supplierInvoiceGoodsReceipt.js';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');

const example={
 id:'invoice-1',restaurant_id:'tenant-1',branch_id:'branch-1',supplier_id:'supplier-1',
 approval_status:'auto_approved',status:'approved',
 items:[{product_name:'Chicken',quantity:4,unit:'carton',unit_cost:135},{product_name:'Rice',quantity:2,unit_cost:8}]
};
describe('Owner verifies complete supplier invoice goods separately from payment',()=>{
 it('allows both approved unpaid and fully paid invoices to be delivered independently of settlement',()=>{
  expect(approvedPurchaseForDelivery(example)).toBe(true);
  expect(approvedPurchaseForDelivery({...example,status:'paid',paid_amount:556})).toBe(true);
  expect(approvedPurchaseForDelivery({...example,status:'partial',paid_amount:20})).toBe(true);
  expect(approvedPurchaseForDelivery({...example,status:'draft'})).toBe(false);
  expect(approvedPurchaseForDelivery({...example,approval_status:'pending'})).toBe(false);
  expect(approvedPurchaseForDelivery({...example,supplier_id:null})).toBe(false);
 });
 it('requires explicit verification of every item and keeps original exact quantities',()=>{
  expect(validFullPurchaseDelivery(example.items,{0:true,1:false})).toBe(false);
  expect(validFullPurchaseDelivery(example.items,{0:true,1:true})).toBe(true);
  expect(purchaseDeliveryConfirmationLines(example.items)).toEqual([
   {line_index:0,received_qty:4},{line_index:1,received_qty:2}
  ]);
  expect(purchaseInvoiceItemQuantity({qty:5})).toBe(5);
  expect(validFullPurchaseDelivery([{product_name:'',quantity:5}],{0:true})).toBe(false);
 });
 it('separates receipt from invoice status/payables, protects owner role and scopes supplier read',async()=>{
  const sql=await read('../supabase/migrations/20261112105500_owner_supplier_invoice_goods_receipt.sql');
  for(const check of [
   'erp_owner_confirm_supplier_invoice_delivery',
   'erp_supplier_invoice_delivery_receipts',
   "m.role='owner' AND m.status='approved'",
   "m.role='supplier' AND m.linked_entity_id=r.supplier_id",
   'SUPPLIER_INVOICE_DELIVERY_QUANTITY_MISMATCH',
   'verified_items jsonb NOT NULL',
   'ON DELETE RESTRICT',
   'ENABLE ROW LEVEL SECURITY',
   'REVOKE ALL ON public.supplier_invoice_delivery_receipts FROM PUBLIC,anon,authenticated'
  ])expect(sql).toContain(check);
  expect(sql).not.toMatch(/UPDATE public\.supplier_invoices SET/);
  expect(sql).not.toMatch(/INSERT INTO public\.supplier_payments/);
  expect(sql).not.toMatch(/UPDATE public\.products SET/);
  expect(sql).not.toMatch(/DELETE FROM public\.supplier_invoices/);
 });
 it('Owner sees a delivery confirmation button on real invoice cards and a separate received badge',async()=>{
  const [page,list,dialog]=await Promise.all([
   read('../src/pages/Purchases.jsx'),
   read('../src/components/purchases/PurchaseInvoiceList.jsx'),
   read('../src/components/purchases/OwnerPurchaseGoodsReceipt.jsx')
  ]);
  expect(page).toContain("supabase.rpc('erp_supplier_invoice_delivery_receipts'");
  expect(page).toContain('onConfirmDelivery={isOwner&&!deliveryReceiptsError');
  expect(page).toContain('<OwnerPurchaseGoodsReceipt');
  expect(list).toContain('data-testid="owner-confirm-purchase-delivery"');
  expect(list).toContain('data-testid="supplier-invoice-goods-received-badge"');
  expect(list).toContain('remaining > 0');
  expect(dialog).toContain("supabase.rpc('erp_owner_confirm_supplier_invoice_delivery'");
  expect(dialog).toContain('validFullPurchaseDelivery(items,checked)');
  expect(dialog).toContain('p_received_items:purchaseDeliveryConfirmationLines(items)');
 });
 it('Supplier sees only authorized confirmed invoice items and does not gain a receipt write control',async()=>{
  const s=await read('../src/pages/SupplierPortalERP.jsx');
  expect(s).toContain("supabase.rpc('erp_supplier_invoice_delivery_receipts'");
  expect(s).toContain('deliveryReceipt={invoiceDeliveryById.get(String(inv.id))}');
  expect(s).toContain('data-testid="supplier-invoice-goods-delivered"');
  expect(s).not.toContain("supabase.rpc('erp_owner_confirm_supplier_invoice_delivery'");
 });
});
