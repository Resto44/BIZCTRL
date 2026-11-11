import React from 'react';
import { Trash2 } from 'lucide-react';
import { isItemizedCustomerCreditValid } from '@/lib/customerCreditInvoiceMath';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function CustomerCreditInvoiceItems({entry, onUpdate, disabled=false, currency='SAR',lang='en'}) {
 const t={
  en:{title:'Invoice line items',add:'Add invoice item',hint:'Optional. Without items, the customer sees a clearly labeled closing summary, not an invented product list.',name:'Item name',qty:'Qty',price:'Unit price',total:'Itemized total',remove:'Remove item',required:'Complete each item name, quantity and price before finalizing. The invoice sum must equal the credit sale amount.'},
  ar:{title:'تفاصيل أصناف فاتورة الآجل',add:'إضافة صنف',hint:'اختياري. بدون الأصناف سيرى العميل ملخصاً واضحاً للبيع الآجل وليس تفاصيل منتجات غير مسجلة.',name:'اسم الصنف',qty:'الكمية',price:'سعر الوحدة',total:'الإجمالي',remove:'حذف الصنف',required:'أكمل اسم وكمية وسعر كل صنف، ويجب أن يساوي المجموع قيمة البيع الآجل.'},
  fa:{title:'جزئیات اقلام فاکتور نسیه',add:'افزودن قلم',hint:'اختیاری. بدون اقلام، مشتری فقط خلاصهٔ نسیهٔ کلوزینگ را می‌بیند؛ نام محصول ساختگی نمایش داده نمی‌شود.',name:'نام جنس',qty:'تعداد',price:'قیمت واحد',total:'مجموع',remove:'حذف قلم',required:'نام، تعداد و قیمت هر جنس را تکمیل کنید؛ جمع اقلام باید با مبلغ نسیه برابر باشد.'}
 }[lang]||null;
 const c=t||{title:'Invoice items',add:'Add item',hint:'Optional itemized details.',name:'Item',qty:'Qty',price:'Unit price',total:'Total',remove:'Remove',required:'Check items'};
 const items=Array.isArray(entry.items)?entry.items:[];
 const valid=isItemizedCustomerCreditValid(items,entry.amount);
 const update=(next)=>{
  const sum=next.reduce((acc,line)=>acc+Math.round((Number(line.quantity)||0)*(Number(line.unit_price)||0)*100),0);
  const sanitized=next.map(line=>({...line,total_price:Number((Math.round((Number(line.quantity)||0)*(Number(line.unit_price)||0)*100)/100).toFixed(2))}));
  onUpdate(entry.id,{items:sanitized,amount:(sum/100).toFixed(2)});
 };
 return <section className="min-w-0 space-y-3 rounded-xl border border-blue-200 bg-blue-50/30 p-3" aria-label={c.title}>
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h3 className="text-sm font-bold">{c.title}</h3>
   <Button type="button" variant="outline" size="sm" disabled={disabled||items.length>=30}
    onClick={()=>update([...items,{name:'',quantity:1,unit_price:items.length?0:Number(entry.amount||0),total_price:items.length?0:Number(entry.amount||0)}])}>
    <span className="me-1 text-lg" aria-hidden="true">＋</span>{c.add}
   </Button>
  </div>
  <p className="text-xs leading-5 text-slate-600">{c.hint}</p>
  {items.map((line,index)=><div key={index} className="grid min-w-0 grid-cols-2 gap-2 rounded-xl border bg-white p-3 sm:grid-cols-[minmax(0,1fr)_85px_125px_45px]">
   <label className="col-span-2 min-w-0 text-xs sm:col-span-1">{c.name}
    <Input type="text" className="mt-1 min-h-11 w-full min-w-0" maxLength={160} value={line.name||''} disabled={disabled}
     onChange={e=>update(items.map((v,i)=>i===index?{...v,name:e.target.value}:v))}/>
   </label>
   <label className="min-w-0 text-xs">{c.qty}
    <Input type="number" inputMode="decimal" min="0.001" max="1000" step="any" className="mt-1 min-h-11 w-full min-w-0"
     value={line.quantity??''} disabled={disabled} onChange={e=>update(items.map((v,i)=>i===index?{...v,quantity:e.target.value}:v))}/>
   </label>
   <label className="min-w-0 text-xs">{c.price}
    <Input type="number" inputMode="decimal" min="0" step="0.01" className="mt-1 min-h-11 w-full min-w-0"
     value={line.unit_price??''} disabled={disabled} onChange={e=>update(items.map((v,i)=>i===index?{...v,unit_price:e.target.value}:v))}/>
   </label>
   <button type="button" disabled={disabled} aria-label={c.remove} className="col-span-2 flex min-h-11 items-center justify-center rounded-lg border text-red-600 sm:col-span-1 sm:self-end"
    onClick={()=>update(items.filter((_,i)=>i!==index))}><Trash2 size={16}/></button>
  </div>)}
  {items.length>0&&<p className="text-sm font-semibold" dir="ltr">{c.total}: {currency} {Number(entry.amount||0).toFixed(2)}</p>}
  {!valid&&<p role="alert" className="text-xs font-bold text-red-700">{c.required}</p>}
 </section>;
}
