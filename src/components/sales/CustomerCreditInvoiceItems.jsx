import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { isItemizedCustomerCreditValid } from '@/lib/customerCreditInvoiceMath';
import { creditPOSMenuLabel,creditPOSMenuChoices,creditPOSInvoiceItem,creditPOSInvoiceTotal } from '@/lib/closingCreditPOSCatalog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const COPY={
 en:{title:'Invoice line items',choose:'Add item from Cashier POS',search:'Search POS food, serving or category',qty:'Qty',price:'Unit price',total:'Invoice total',remove:'Remove item',hint:'Choose a food/serving from this branch’s active POS menu. The configured price fills automatically; change quantity if needed.',loading:'Loading POS items…',empty:'No active POS items available in this branch.',missing:'Select the restaurant and branch to load POS products.',error:'Could not load POS menu. Check your access and try again.',retry:'Retry',legacy:'Previously entered item · select a POS product above to replace it',stale:'This item is no longer available in the POS menu. Remove it and select an active option.',required:'Choose a valid POS product and quantity. Invoice total must equal the credit sale amount.'},
 ar:{title:'تفاصيل أصناف فاتورة الآجل',choose:'إضافة صنف من كاشير POS',search:'ابحث عن الصنف أو الحجم أو الفئة',qty:'الكمية',price:'سعر الوحدة',total:'مجموع الفاتورة',remove:'حذف الصنف',hint:'اختر الصنف والحجم من قائمة كاشير POS النشطة لنفس الفرع؛ يظهر السعر تلقائياً ويمكنك تعديل الكمية.',loading:'جارٍ تحميل أصناف الكاشير…',empty:'لا توجد أصناف نشطة في قائمة هذا الفرع.',missing:'اختر المطعم والفرع لتحميل الأصناف.',error:'تعذر تحميل قائمة POS. تحقق من الصلاحيات وأعد المحاولة.',retry:'إعادة المحاولة',legacy:'صنف أُدخل سابقاً يدوياً؛ يمكنك استبداله من قائمة POS',stale:'هذا الصنف لم يعد موجوداً في قائمة POS النشطة. احذفه واختر صنفاً متاحاً.',required:'اختر صنفاً وكمية صحيحة، ويجب أن يساوي المجموع قيمة البيع الآجل.'},
 fa:{title:'جزئیات اقلام فاکتور نسیه',choose:'افزودن جنس از Cashier POS',search:'جستجوی جنس، اندازه یا کتگوری',qty:'تعداد',price:'قیمت واحد',total:'مجموع فاکتور',remove:'حذف جنس',hint:'جنس و اندازه را از منوی فعال کاشیر همان شعبه انتخاب کنید؛ قیمت خودکار درج می‌شود و فقط تعداد را تغییر دهید.',loading:'محصولات POS بارگذاری می‌شوند…',empty:'در این شعبه محصول فعال POS پیدا نشد.',missing:'اول مطعم و شعبه را انتخاب کنید.',error:'بارگذاری منوی POS ناموفق بود؛ دسترسی را بررسی و دوباره کوشش کنید.',retry:'تلاش دوباره',legacy:'قلم قبلاً دستی درج شده؛ می‌توانید آن را از لیست POS تعویض کنید',stale:'این جنس دیگر در منوی فعال POS نیست؛ حذف و گزینهٔ فعال انتخاب کنید.',required:'جنس و تعداد معتبر انتخاب کنید. مجموع فاکتور باید با مبلغ نسیه برابر باشد.'}
};
const money = n=>Number(n||0).toFixed(2);

export default function CustomerCreditInvoiceItems({
 entry,onUpdate,disabled=false,currency='SAR',lang='en',restaurantId=null,branchId=null
}) {
 const t=COPY[lang]||COPY.en;
 const [search,setSearch]=useState('');
 const [catalog,setCatalog]=useState([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [refresh,setRefresh]=useState(0);
 const scoped=Boolean(restaurantId&&branchId);
 const items=Array.isArray(entry.items)?entry.items:[];
 const valid=isItemizedCustomerCreditValid(items,entry.amount);
 useEffect(()=>{
  if(!scoped)return undefined;
  let mounted=true;
  setLoading(true);setError('');setCatalog([]);
  import('@/lib/restaurantPOS').then(({customerCreditPOSMenuRpc})=>customerCreditPOSMenuRpc({
    p_restaurant_id:restaurantId,p_branch_id:branchId,p_search:''
  })).then(result=>{
    if(!mounted)return;
    setCatalog(creditPOSMenuChoices(result));
  }).catch(e=>{
    if(!mounted)return;
    setCatalog([]);setError(e?.message||t.error);
  }).finally(()=>{if(mounted)setLoading(false);});
  return()=>{mounted=false;};
 },[scoped,restaurantId,branchId,refresh]);

 const choices=useMemo(()=>{
  const term=search.trim().toLocaleLowerCase();
  return !term?catalog:catalog.filter(m=>
   [m.name,m.name_ar,m.name_fa,m.option_group,m.category,
    ...(Array.isArray(m.variant_options)?m.variant_options.map(o=>o?.value):[])
   ].some(v=>String(v||'').toLocaleLowerCase().includes(term)));
 },[catalog,search]);
 const groups=useMemo(()=>{
  const collected=new Map();
  for(const m of choices) {
   const group=String(m.option_group||m.category||'POS').trim()||'POS';
   if(!collected.has(group))collected.set(group,[]);
   collected.get(group).push(m);
  }
  return [...collected.entries()];
 },[choices]);
 const update=(next)=>{
  const normalized=next.map(l=>({...l,total_price:Math.round(Number(l.quantity||0)*Number(l.unit_price||0)*100)/100}));
  onUpdate(entry.id,{items:normalized,amount:creditPOSInvoiceTotal(normalized)});
 };
 const choose=(menuId)=>{
  const menu=catalog.find(m=>m.id===menuId);
  if(!menu||disabled)return;
  const existing=items.findIndex(l=>l.menu_id===menuId);
  if(existing>=0) {
   const qty=Number(items[existing].quantity||0);
   if(qty>=1000)return;
   update(items.map((line,i)=>i===existing?creditPOSInvoiceItem(menu,lang,qty+1):line));
  }else if(items.length<30)update([...items,creditPOSInvoiceItem(menu,lang,1)]);
 };
 const changeQty=(index,raw)=>{
  const quantity=raw===''?'':Number(raw);
  update(items.map((line,i)=>i===index?{...line,quantity}:line));
 };
 return <section className="min-w-0 space-y-3 rounded-xl border border-blue-200 bg-blue-50/30 p-3"
  aria-label={t.title} data-testid="customer-credit-pos-invoice-items">
  <h3 className="text-sm font-bold">{t.title}</h3>
  <p className="text-xs leading-5 text-slate-600">{t.hint}</p>
  {!scoped?<p role="status" className="text-sm text-amber-800">{t.missing}</p>:<>
   <label className="block text-xs font-semibold">{t.search}
    <Input type="search" autoComplete="off" value={search} onChange={e=>setSearch(e.target.value)}
     disabled={disabled||loading||Boolean(error)}
     className="mt-1 min-h-11 w-full min-w-0" placeholder={t.search}/>
   </label>
   <label className="block text-sm font-semibold">{t.choose}
    <select className="mt-1 min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-950"
      aria-label={t.choose} data-testid="customer-credit-pos-product-dropdown"
      value="" disabled={disabled||loading||Boolean(error)||!catalog.length||items.length>=30}
      onChange={e=>choose(e.target.value)}>
     <option value="">{loading?t.loading:error?t.error:!catalog.length?t.empty:t.choose}</option>
     {groups.map(([group,options])=><optgroup key={group} label={group}>
      {options.map(m=><option key={m.id} value={m.id}>
       {creditPOSMenuLabel(m,lang)} · {currency} {money(m.price)}
      </option>)}
     </optgroup>)}
    </select>
   </label>
   {loading&&<p role="status" className="text-xs text-slate-500">{t.loading}</p>}
   {!loading&&!error&&scoped&&!catalog.length&&<p role="status" className="text-xs text-amber-800">{t.empty}</p>}
   {error&&<div role="alert" className="flex flex-wrap items-center gap-2">
    <p className="text-xs text-red-700">{t.error}</p>
    <Button type="button" variant="outline" size="sm" onClick={()=>setRefresh(n=>n+1)}>{t.retry}</Button>
   </div>}
  </>}
  {items.map((line,index)=>{
   const selected=catalog.find(m=>m.id===line.menu_id);
   const stale=Boolean(line.menu_id&&scoped&&!loading&&!error&&!selected);
   return <div key={line.menu_id||`legacy-${index}`} className="min-w-0 space-y-2 rounded-xl border bg-white p-3"
     data-testid="customer-credit-invoice-line">
    <p className="break-words text-sm font-semibold text-slate-900">{line.name||t.choose}</p>
    {!line.menu_id&&<p className="text-xs text-amber-800">{t.legacy}</p>}
    {stale&&<p role="alert" className="text-xs text-red-700">{t.stale}</p>}
    <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[90px_minmax(0,1fr)_50px]">
     <label className="min-w-0 text-xs">{t.qty}
      <Input type="number" inputMode="numeric" min="1" max="1000" step="1"
       value={line.quantity??''} disabled={disabled||stale}
       onChange={e=>changeQty(index,e.target.value)}
       className="mt-1 min-h-11 w-full min-w-0"/>
     </label>
     <div className="min-w-0 text-xs">{t.price}
      <div className="mt-1 flex min-h-11 min-w-0 items-center rounded-lg border bg-slate-50 px-3 font-bold tabular-nums"
       dir="ltr">{currency} {money(line.unit_price)}</div>
     </div>
     <button type="button" disabled={disabled} aria-label={t.remove}
      className="col-span-2 flex min-h-11 items-center justify-center rounded-lg border text-red-600 disabled:opacity-40 sm:col-span-1 sm:self-end"
      onClick={()=>update(items.filter((_,i)=>i!==index))}><Trash2 size={17}/></button>
    </div>
    <p className="text-end text-sm font-semibold tabular-nums" dir="ltr">{currency} {money(line.total_price)}</p>
   </div>;
  })}
  {items.length>0&&<p className="text-sm font-bold tabular-nums" dir="ltr">{t.total}: {currency} {money(entry.amount)}</p>}
  {(!valid||items.some(x=>x.menu_id&&!catalog.some(m=>m.id===x.menu_id)&&scoped&&!loading&&!error))&&
   <p role="alert" className="text-xs font-bold text-red-700">{t.required}</p>}
 </section>;
}
