import React, {useRef, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {customerPortalRpc} from '@/lib/customerPortal';
import {portalOrderCategories, selectedPortalCategory, filterPortalOrderProducts, PORTAL_ORDER_ALL} from '@/lib/portalOrderCategories';
import {Button} from '@/components/ui/button';
import {customerOrderDeliveryValid,customerOrderCart,customerOrderCartTotal} from '@/lib/customerOrderCheckout';
import {Input} from '@/components/ui/input';

const language={
 en:{
  title:'Order products',hint:'Choose delivery to your address or pickup at the restaurant.',
  delivery:'Delivery to my address',pickup:'Pickup from restaurant',branch:'Receiving branch',
  category:'Category',all:'All categories',search:'Search products',selected:'Your basket',
  address:'Delivery address (street, building, district)',phone:'Contact phone number',
  notes:'Order notes (optional)',submit:'Send order request',sending:'Sending order…',
  disabled:'Online ordering is not yet enabled for this customer account. Contact the restaurant.',
  waiting:'Restaurant confirmation required',fee:'Delivery fee: to be confirmed by the restaurant',
  noFee:'Pickup: no delivery fee',quote:'Menu subtotal (not paid)',empty:'No products are configured for this branch',
  noMatch:'No products match this category or search',login:'Please sign in again.',
  history:'My order requests',emptyHistory:'No order requests yet.',refresh:'Refresh',
  error:'The order could not be confirmed. Retrying the same order is safe.',
  success:'Order request sent to the restaurant',needAddress:'Enter a full delivery address and a valid phone number.',
  item:'items',notPaid:'Not paid — final price and availability require confirmation',
  remove:'Remove',add:'Add',pending:'Pending review',ready:'Ready',completed:'Completed',
  unavailable:'The restaurant has not yet enabled the necessary delivery/manager route.',
 },
 ar:{
  title:'طلب منتجات',hint:'اختر التوصيل إلى عنوانك أو الاستلام من المطعم.',
  delivery:'توصيل إلى عنواني',pickup:'استلام من المطعم',branch:'الفرع',category:'التصنيف',
  all:'جميع التصنيفات',search:'ابحث عن منتج',selected:'سلة طلبك',
  address:'عنوان التوصيل (الحي، الشارع، المبنى)',phone:'رقم التواصل',
  notes:'ملاحظات الطلب (اختياري)',submit:'إرسال الطلب',sending:'جارٍ إرسال الطلب…',
  disabled:'الطلب الإلكتروني غير مفعل لحسابك حالياً. تواصل مع المطعم.',
  waiting:'يتطلب تأكيد المطعم',fee:'رسوم التوصيل: يحددها المطعم قبل الدفع',
  noFee:'الاستلام من المطعم: دون رسوم توصيل',quote:'قيمة الأصناف (غير مدفوعة)',
  empty:'لا توجد منتجات في هذا الفرع',noMatch:'لا توجد منتجات مطابقة للبحث أو التصنيف',
  login:'سجل الدخول مجدداً',history:'طلباتي',emptyHistory:'لا توجد طلبات بعد',refresh:'تحديث',
  error:'لم يتم تأكيد الإرسال. يمكنك إعادة المحاولة بنفس الطلب.',
  success:'تم إرسال الطلب للمطعم',needAddress:'أدخل عنوان توصيل واضحاً ورقم هاتف صحيحاً',
  item:'أصناف',notPaid:'غير مدفوع — السعر النهائي والتوفر يحتاجان تأكيداً',
  remove:'حذف',add:'إضافة',pending:'بانتظار المراجعة',ready:'جاهز',completed:'مكتمل',
  unavailable:'لم يفعّل المطعم مسار مراجعة التوصيل بعد.',
 },
 fa:{
  title:'سفارش محصولات',hint:'تحویل در نشانی خود یا گرفتن سفارش از رستوران را انتخاب کنید.',
  delivery:'ارسال به نشانی من',pickup:'تحویل‌گرفتن از رستوران',branch:'شعبه تحویل',category:'دسته‌بندی',
  all:'تمام دسته‌ها',search:'جستجوی غذا یا محصول',selected:'سبد سفارش من',
  address:'نشانی تحویل (ناحیه، سرک، ساختمان)',phone:'شماره تماس',
  notes:'یادداشت سفارش (اختیاری)',submit:'ارسال درخواست سفارش',sending:'در حال ارسال…',
  disabled:'سفارش آنلاین برای این حساب هنوز فعال نیست. با رستوران تماس بگیرید.',
  waiting:'نیازمند تأیید رستوران',fee:'هزینه دلیوری: بعد از تأیید رستوران مشخص می‌شود',
  noFee:'تحویل از رستوران: بدون هزینه ارسال',quote:'جمع قیمت منو (پرداخت نشده)',
  empty:'برای این شعبه محصول ثبت نشده',noMatch:'محصول مطابق دسته یا جستجو پیدا نشد',
  login:'دوباره وارد شوید',history:'سفارش‌های من',emptyHistory:'هنوز سفارشی ندارید',refresh:'تازه‌سازی',
  error:'ارسال سفارش تأیید نشد. می‌توانید همان سفارش را دوباره ارسال کنید.',
  success:'درخواست سفارش به رستوران فرستاده شد',needAddress:'نشانی کامل و شماره تماس معتبر وارد کنید.',
  item:'قلم',notPaid:'پرداخت نشده؛ قیمت نهایی و موجودی نیازمند تأیید است',
  remove:'حذف',add:'افزودن',pending:'منتظر بررسی',ready:'آماده',completed:'تکمیل',
  unavailable:'مسیر تأیید مدیر برای دلیوری هنوز فعال نیست.',
 },
};
const uuid=()=>typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():'';
export default function CustomerOrderEntry({account,lang='en'}){
 const t=language[lang]||language.en;
 const qc=useQueryClient();
 const [branch,setBranch]=useState('');
 const [fulfillment,setFulfillment]=useState('pickup');
 const [category,setCategory]=useState('');
 const [search,setSearch]=useState('');
 const [cart,setCart]=useState({});
 const [address,setAddress]=useState('');
 const [phone,setPhone]=useState('');
 const [notes,setNotes]=useState('');
 const [error,setError]=useState('');
 const [receipt,setReceipt]=useState(null);
 const requestId=useRef(uuid());
 const q=useQuery({
  queryKey:['customer-portal','order-context',account?.id,branch],
  queryFn:()=>customerPortalRpc('erp_customer_portal_order_context',{
   p_customer_id:account.id,p_branch_id:branch||null,
  }),
  enabled:Boolean(account?.id),retry:1,refetchInterval:12000,refetchOnWindowFocus:true,
 });
 const data=q.data;
 const allowed=Boolean(data?.can_manager||data?.can_kitchen);
 const deliveryAllowed=Boolean(data?.can_manager);
 const catalog=Array.isArray(data?.catalog)?data.catalog:[];
 const groups=portalOrderCategories(catalog,lang);
 const activeCategory=selectedPortalCategory(groups,category);
 const displayed=filterPortalOrderProducts(catalog,activeCategory,search);
 const selected=customerOrderCart(catalog,cart);
 const count=selected.reduce((sum,line)=>sum+line.quantity,0);
 const quote=customerOrderCartTotal(selected);
 const enabled=allowed&&(fulfillment==='pickup'||deliveryAllowed);
 const deliveryValid=customerOrderDeliveryValid(fulfillment,address,phone);
 const canSend=enabled&&selected.length>0&&selected.length<=25&&count<=100&&deliveryValid&&!!requestId.current;
 const mutate=useMutation({
  mutationFn:()=>customerPortalRpc('erp_customer_portal_order_submit',{
   p_customer_id:account.id,p_branch_id:data.branch_id,p_request_id:requestId.current,
   p_fulfillment:fulfillment,p_delivery_address:fulfillment==='delivery'?address.trim():'',
   p_contact_phone:fulfillment==='delivery'?phone.trim():'',
   p_items:selected.map(x=>({id:x.id,quantity:x.quantity})),p_notes:notes.trim(),
  }),
  onSuccess:res=>{
   setReceipt(res);setError('');setCart({});setNotes('');setAddress('');setPhone('');
   requestId.current=uuid();
   qc.invalidateQueries({queryKey:['customer-portal','order-context',account.id]});
  },
  onError:err=>setError(err?.message||t.error),
 });
 const modify=callback=>{setReceipt(null);setError('');requestId.current=uuid();callback();};
 const add=(id,step)=>{if(mutate.isPending)return;modify(()=>setCart(prev=>({...prev,
  [id]:Math.max(0,Math.min(20,(prev[id]||0)+step)),
 })));};
 const changeBranch=id=>modify(()=>{setBranch(id);setCategory('');setSearch('');setCart({});});
 const status=order=>{
  const map={awaiting_manager:t.pending,queued:t.pending,preparing:t.pending,
   ready:t.ready,accepted:t.pending,completed:t.completed};
  return map[order.status]||order.status;
 };
 return <section data-testid="customer-order-entry" dir={lang==='en'?'ltr':'rtl'}
  className="space-y-4 rounded-2xl border border-teal-200 bg-white p-3 shadow-sm print:hidden sm:p-5">
  <header><h2 className="text-xl font-black text-teal-950">{t.title}</h2><p className="mt-1 text-sm text-slate-600">{t.hint}</p></header>
  {q.isPending&&<p role="status" className="rounded-lg bg-slate-50 p-3">{t.waiting}…</p>}
  {q.isError&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-800">{t.error}
   <Button type="button" variant="outline" className="ms-2" onClick={()=>q.refetch()}>{t.refresh}</Button></p>}
  {data&&<div className="space-y-4">
   {!allowed&&<p data-testid="customer-order-disabled" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t.disabled}</p>}
   {allowed&&<>
    {Array.isArray(data.branches)&&data.branches.length>1&&<label className="block text-sm font-semibold">
      {t.branch}<select aria-label={t.branch} value={data.branch_id||''} onChange={e=>changeBranch(e.target.value)}
       className="mt-1 h-12 w-full rounded-xl border bg-white px-3 text-base">
       {data.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
      </select></label>}
    <div className="grid grid-cols-2 gap-2" role="group" aria-label={t.hint}>
     {['pickup','delivery'].map(mode=><button key={mode} type="button"
      data-testid={'customer-order-'+mode} aria-pressed={fulfillment===mode}
      onClick={()=>modify(()=>setFulfillment(mode))}
      className={'min-h-16 rounded-xl border px-3 text-sm font-bold '+(fulfillment===mode?'border-teal-600 bg-teal-700 text-white':'border-slate-200 bg-slate-50 text-slate-900')}>
      {t[mode]}</button>)}
    </div>
    {fulfillment==='delivery'&&<div className="space-y-2">
      {!deliveryAllowed&&<p role="alert" className="text-sm text-amber-800">{t.unavailable}</p>}
      <label className="block text-sm font-semibold">{t.address}<textarea aria-label={t.address}
       value={address} maxLength={400} rows={3} onChange={e=>modify(()=>setAddress(e.target.value))}
       className="mt-1 min-h-24 w-full rounded-xl border p-3 text-base"/></label>
      <label className="block text-sm font-semibold">{t.phone}<Input aria-label={t.phone}
       type="tel" autoComplete="tel" value={phone} maxLength={24}
       onChange={e=>modify(()=>setPhone(e.target.value))} className="mt-1 h-12 text-base"/></label>
      <p className="text-sm font-semibold text-amber-800">{t.fee}</p>
    </div>}
    {fulfillment==='pickup'&&<p className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">{t.noFee} · {data.branch_name}</p>}
    <label className="block text-sm font-semibold">{t.category}
     <select aria-label={t.category} data-testid="customer-order-category" value={activeCategory}
      onChange={e=>{setCategory(e.target.value);setSearch('');}}
      className="mt-1 h-12 w-full rounded-xl border bg-white px-3 text-base">
      <option value={PORTAL_ORDER_ALL}>{t.all} ({catalog.length})</option>
      {groups.map(g=><option key={g.key} value={g.key}>{g.label} ({g.count})</option>)}
     </select></label>
    <Input aria-label={t.search} placeholder={t.search} value={search}
     onChange={e=>setSearch(e.target.value)} className="h-12 text-base"/>
    <div data-testid="customer-order-catalog" className="grid max-h-[45dvh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
     {displayed.map(item=><div key={item.id} className="flex min-h-20 items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
      <div className="min-w-0"><strong className="block break-words text-sm text-slate-900">{item['name_'+lang]||item.name}</strong>
       <span dir="ltr" className="text-xs text-slate-600">{Number(item.price||0).toFixed(2)} {data.currency||''}</span></div>
      <div className="flex shrink-0 items-center gap-2">
       <button type="button" aria-label={t.remove+' '+item.name} onClick={()=>add(item.id,-1)}
        className="h-11 w-11 rounded-lg border text-lg font-black text-slate-900">−</button>
       <span className="min-w-5 text-center text-base font-black">{cart[item.id]||0}</span>
       <button type="button" aria-label={t.add+' '+item.name} onClick={()=>add(item.id,1)}
        className="h-11 w-11 rounded-lg bg-teal-700 text-lg font-black text-white">+</button>
      </div>
     </div>)}
    </div>
    {!catalog.length&&<p role="status" className="text-sm text-slate-500">{t.empty}</p>}
    {!!catalog.length&&!displayed.length&&<p role="status" className="text-sm text-slate-500">{t.noMatch}</p>}
    {selected.length>0&&<div data-testid="customer-order-cart" className="space-y-2 rounded-xl border border-teal-200 bg-teal-50 p-3">
     <h3 className="font-black">{t.selected} · {count} {t.item}</h3>
     {selected.map(row=><div key={row.id} className="flex items-center justify-between gap-2 text-sm">
      <span>{row['name_'+lang]||row.name} ×{row.quantity}</span>
      <button type="button" onClick={()=>add(row.id,-row.quantity)} className="h-10 w-10 rounded-lg border border-rose-200 text-lg font-black text-rose-700">×</button>
     </div>)}
    </div>}
    <label className="block text-sm font-semibold">{t.notes}<textarea aria-label={t.notes}
     value={notes} maxLength={500} onChange={e=>modify(()=>setNotes(e.target.value))}
     className="mt-1 min-h-20 w-full rounded-xl border p-3 text-base"/></label>
    <div className="space-y-2 rounded-xl bg-slate-50 p-3">
     <strong className="block text-lg tabular-nums text-slate-900">{t.quote}: {quote.toFixed(2)} {data.currency||''}</strong>
     <p className="text-xs font-semibold text-amber-800">{t.notPaid}</p>
     <Button type="button" className="min-h-12 w-full bg-teal-700 text-base text-white"
      disabled={!canSend||mutate.isPending}
      onClick={()=>{setError('');if(!deliveryValid){setError(t.needAddress);return;}mutate.mutate();}}>
      {mutate.isPending?t.sending:t.submit}</Button>
    </div>
   </>}
   {receipt&&<p data-testid="customer-order-success" role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 font-bold text-emerald-900">
    {t.success} · #{String(receipt.id||'').slice(0,8).toUpperCase()} · {status(receipt)}</p>}
   {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
   <div data-testid="customer-order-history" className="space-y-2">
    <div className="flex items-center justify-between"><h3 className="text-lg font-black">{t.history}</h3>
     <Button type="button" variant="outline" onClick={()=>q.refetch()}>{t.refresh}</Button></div>
    {(!Array.isArray(data.orders)||data.orders.length===0)&&<p className="text-sm text-slate-600">{t.emptyHistory}</p>}
    {(Array.isArray(data.orders)?data.orders:[]).map(order=><article key={order.id}
     className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
     <div><strong>#{String(order.id).slice(0,8).toUpperCase()}</strong>
      <p className="text-xs text-slate-600">{t[order.fulfillment]||order.fulfillment} · {new Date(order.created_at).toLocaleString()}</p></div>
     <div className="text-end"><strong>{status(order)}</strong><p className="text-xs tabular-nums">{Number(order.total_quote||0).toFixed(2)} {data.currency||''}</p></div>
    </article>)}
   </div>
  </div>}
 </section>;
}
