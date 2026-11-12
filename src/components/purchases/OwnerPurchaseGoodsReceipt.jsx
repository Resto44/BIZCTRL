import React,{useState} from 'react';
import {PackageCheck,ShieldCheck} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {supabase} from '@/api/supabaseClient';
import {approvedPurchaseForDelivery,purchaseInvoiceItemQuantity,validFullPurchaseDelivery,purchaseDeliveryConfirmationLines} from '@/lib/supplierInvoiceGoodsReceipt';

const LANG={
 en:{title:'Owner goods receipt confirmation',intro:'Confirm actual physical delivery of every product listed on this purchase invoice. The delivery receipt is permanent and separate from invoice approval and payment.',invoice:'Invoice',qty:'Quantity received',check:'I physically received this item in full',submit:'Confirm all products received',cancel:'Cancel',blocked:'This invoice needs an approved status, product details and a linked supplier/branch.',error:'Could not confirm delivery. No receipt was recorded.',busy:'Confirming…',note:'This confirms delivery only. It does not pay the supplier or change inventory.'},
 ar:{title:'تأكيد استلام المنتجات من المالك',intro:'راجع تسليم كل صنف وكميته فعلياً قبل التأكيد. إثبات الاستلام مستقل عن اعتماد الفاتورة والدفع.',invoice:'الفاتورة',qty:'الكمية المستلمة',check:'أؤكد استلام هذا الصنف كاملاً',submit:'تأكيد استلام جميع المنتجات',cancel:'إلغاء',blocked:'يجب اعتماد الفاتورة وتوفر بيانات المنتجات والمورد والفرع.',error:'تعذر تأكيد الاستلام. لم يسجل أي إثبات.',busy:'جارٍ التأكيد…',note:'هذا تأكيد استلام فقط، لا يدفع المبلغ ولا يغير المخزون.'},
 fa:{title:'تأیید دریافت کالا توسط اونر',intro:'قبل از تأیید، همهٔ محصولات و تعداد واقعی تحویل‌شده را بررسی کنید. رسید تحویل از تأیید فاکتور و پرداخت جدا است.',invoice:'فاکتور',qty:'مقدار تحویل‌شده',check:'این جنس را با مقدار کامل تحویل گرفتم',submit:'تأیید دریافت تمام محصولات',cancel:'لغو',blocked:'فاکتور باید تأییدشده و دارای معلومات محصول، سپلایر و شعبه باشد.',error:'ثبت تحویل ناموفق بود؛ رسیدی ذخیره نشد.',busy:'در حال تأیید…',note:'این کار فقط تحویل را ثبت می‌کند؛ پول پرداخت نمی‌شود و موجودی انبار تغییر نمی‌کند.'}
};
export default function OwnerPurchaseGoodsReceipt({invoice,lang='en',onSaved,onClose}){
 const t=LANG[lang]||LANG.en;
 const [checked,setChecked]=useState({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const items=Array.isArray(invoice?.items)?invoice.items:[];
 const ready=approvedPurchaseForDelivery(invoice)&&validFullPurchaseDelivery(items,checked);
 const confirm=async()=>{
  if(!ready||busy)return;
  setBusy(true);setError('');
  try{
   const {data,error:rpcError}=await supabase.rpc('erp_owner_confirm_supplier_invoice_delivery',{
    p_invoice_id:invoice.id,p_received_items:purchaseDeliveryConfirmationLines(items)
   });
   if(rpcError)throw rpcError;
   if(data?.status!=='received')throw new Error(t.error);
   onSaved?.(data);
  }catch(e){setError(e?.message||t.error);}
  finally{setBusy(false);}
 };
 return <section data-testid="owner-purchase-goods-receipt" className="min-w-0 space-y-3 text-slate-900">
  <header className="flex items-center gap-2">
   <ShieldCheck className="size-5 shrink-0 text-emerald-700"/>
   <h3 className="min-w-0 break-words text-base font-black">{t.title}</h3>
  </header>
  <p className="text-sm leading-6 text-slate-600">{t.intro}</p>
  <div className="min-w-0 rounded-xl bg-slate-50 p-3">
   <p className="text-xs font-bold">{t.invoice}</p>
   <p className="break-all text-sm font-bold">{invoice?.invoice_number||invoice?.id}</p>
   <p className="mt-1 break-words text-xs text-slate-600">{invoice?.supplier_name||'—'}</p>
  </div>
  {!approvedPurchaseForDelivery(invoice)&&<p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">{t.blocked}</p>}
  <div className="max-h-[43dvh] space-y-2 overflow-y-auto">
   {items.map((item,i)=><label key={i} className="flex min-w-0 items-start gap-3 rounded-xl border bg-white p-3">
     <input type="checkbox" checked={Boolean(checked[i])}
      disabled={busy||!approvedPurchaseForDelivery(invoice)}
      onChange={e=>setChecked(old=>({...old,[i]:e.target.checked}))}
      className="mt-1 size-5 shrink-0 accent-emerald-700"/>
     <span className="min-w-0 flex-1">
      <strong className="block break-words text-sm">{item.product_name||item.name||'—'}</strong>
      <span className="mt-1 block text-xs text-slate-600">{t.qty}: <strong>{purchaseInvoiceItemQuantity(item)} {item.unit||''}</strong></span>
      <span className="mt-1 block text-[11px] text-slate-500">{t.check}</span>
     </span>
   </label>)}
  </div>
  <p className="rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-900">{t.note}</p>
  {error&&<p role="alert" className="break-words rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  <div className="flex flex-wrap gap-2">
   <Button type="button" className="min-h-12 flex-1 bg-emerald-700 text-white hover:bg-emerald-800" disabled={!ready||busy}
    onClick={confirm}><PackageCheck className="me-2 size-4"/>{busy?t.busy:t.submit}</Button>
   <Button type="button" className="min-h-12" variant="outline" disabled={busy} onClick={onClose}>{t.cancel}</Button>
  </div>
 </section>;
}
