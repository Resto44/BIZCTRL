import React,{useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Monitor,RefreshCw,CheckCircle2} from 'lucide-react';
import {restaurantRpc} from '@/lib/restaurantPOS';

const COPY={
 en:{
  title:'Show an order on Customer Screen',hint:'Follow one active kitchen order, even after opening another cashier order. Only this cashier device and shift are available.',
  cart:'Current cashier order (automatic)',choose:'Kitchen order',apply:'Show selected order',active:'Now showing',paired:'Pair the customer screen first.',kitchen:'Kitchen',
  saved:'Customer screen updated',error:'Could not change the selected order. Refresh and try again.',pending:'Applying...',returned:'Return to cashier order',none:'No sent kitchen orders on this cashier shift.',
 },
 fa:{
  title:'انتخاب سفارش برای نمایشگر مشتری',hint:'سفارش فعال مطبخ را انتخاب کنید؛ بازشدن سفارش جدید کاشیر آن را عوض نمی‌کند. فقط سفارش‌های همین دستگاه و شیفت موجود اند.',
  cart:'سفارش جاری کاشیر (خودکار)',choose:'سفارش مطبخ',apply:'نمایش سفارش انتخاب‌شده',active:'در حال نمایش',paired:'اول نمایشگر مشتری را وصل کنید.',kitchen:'مطبخ',
  saved:'نمایشگر مشتری آپدیت شد',error:'تغییر سفارش نمایشگر ناموفق شد؛ تازه‌سازی و دوباره کوشش کنید.',pending:'در حال تغییر...',returned:'برگشت به سفارش کاشیر',none:'سفارش ارسال‌شده‌ای از همین شیفت نیست.',
 },
 ar:{
  title:'تحديد الطلب على شاشة العميل',hint:'اختر طلب المطبخ ليبقى ظاهراً حتى عند فتح طلب كاشير جديد. الخيارات تخص نفس الجهاز والوردية فقط.',
  cart:'طلب الكاشير الحالي (تلقائي)',choose:'طلب المطبخ',apply:'عرض الطلب المحدد',active:'يعرض الآن',paired:'اربط شاشة العميل أولاً.',kitchen:'المطبخ',
  saved:'تم تحديث شاشة العميل',error:'تعذر تغيير الطلب. حدث الصفحة وحاول مجدداً.',pending:'جارٍ التحديث...',returned:'العودة لطلب الكاشير',none:'لا توجد طلبات مرسلة من هذه الوردية.',
 }
};
export default function RestaurantDisplayFocus({deviceId,allowed,lang='en'}){
 const c=COPY[lang]||COPY.en;
 const q=useQuery({
   queryKey:['restaurant-customer-display-focus',deviceId],
   queryFn:()=>restaurantRpc('pos_display_focus',{
     p_device_id:deviceId,p_action:'list',p_order_id:null,
   }),
   enabled:Boolean(deviceId&&allowed),staleTime:2000,refetchInterval:5000,retry:1,
 });
 const [selection,setSelection]=useState('');
 const [dirty,setDirty]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 useEffect(()=>{
   if(!dirty)setSelection(q.data?.pinned_order_id||'');
 },[dirty,q.data?.pinned_order_id]);
 useEffect(()=>{setSelection('');setDirty(false);setError('');setMessage('');},[deviceId]);
 const commit=async(value=selection)=>{
   if(!allowed||busy||!q.data?.paired)return;
   setBusy(true);setError('');setMessage('');
   try{
     const next=await restaurantRpc('pos_display_focus',{
       p_device_id:deviceId,p_action:value?'pin':'cart',p_order_id:value||null,
     });
     setDirty(false);setSelection(next.pinned_order_id||'');
     await q.refetch();
     setMessage(c.saved);
   }catch(e){setError(e?.message||c.error);}
   finally{setBusy(false);}
 };
 if(!allowed)return null;
 return <section data-testid="restaurant-display-focus" className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 text-slate-950 shadow-sm dark:border-blue-900 dark:bg-slate-900 dark:text-white">
   <div className="flex items-center gap-2"><Monitor size={21} className="text-blue-600"/>
     <h3 className="text-base font-black sm:text-lg">{c.title}</h3></div>
   <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">{c.hint}</p>
   {!q.data?.paired&&<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{c.paired}</p>}
   <div className="mt-3 flex flex-wrap gap-3">
     <label className="min-w-52 flex-1 text-sm font-bold">
       {c.choose}
       <select data-testid="restaurant-display-order-select" value={selection} disabled={busy||!q.data?.paired}
         onChange={e=>{setSelection(e.target.value);setDirty(true);setMessage('');}}
         className="mt-1 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 disabled:opacity-50">
         <option value="">{c.cart}</option>
         {(q.data?.orders||[]).map(row=><option key={row.id} value={row.id}>
           #{row.number} · {c.kitchen}: {row.kitchen_status} · {row.status}
         </option>)}
         {q.data?.pinned_order_id&&!q.data?.orders?.some(o=>o.id===q.data.pinned_order_id)&&
          <option value={q.data.pinned_order_id}>#{q.data?.pinned_order_number||'—'} · {c.active}</option>}
       </select>
     </label>
     <button type="button" data-testid="restaurant-display-apply-order"
       disabled={busy||!q.data?.paired||(!dirty&&selection===(q.data?.pinned_order_id||''))}
       onClick={()=>void commit()}
       className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white disabled:opacity-45">
       {busy?<RefreshCw size={18} className="animate-spin"/>:<CheckCircle2 size={18}/>}
       {busy?c.pending:c.apply}
     </button>
     {q.data?.pinned_order_id&&<button type="button" data-testid="restaurant-display-follow-cart"
       disabled={busy||!q.data?.paired} onClick={()=>void commit('')}
       className="mt-5 min-h-12 rounded-xl border border-blue-300 bg-white px-4 text-sm font-black text-blue-700 disabled:opacity-45">
       {c.returned}
     </button>}
   </div>
   {q.data?.paired&&<p className="mt-2 text-sm font-semibold text-blue-800 dark:text-blue-200" data-testid="restaurant-display-selected-mode">
     {c.active}: {q.data?.pinned_order_id?'#'+(q.data?.pinned_order_number||q.data.orders?.find(o=>o.id===q.data.pinned_order_id)?.number||'—'):c.cart}
   </p>}
   {!!q.data?.paired&&!(q.data?.orders||[]).length&&<p className="mt-1 text-xs text-slate-500">{c.none}</p>}
   {(error||q.error)&&<p role="alert" className="mt-2 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error||q.error.message}</p>}
   {message&&<p role="status" className="mt-2 text-sm font-semibold text-emerald-700">{message}</p>}
 </section>;
}
