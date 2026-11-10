import React,{useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Monitor,RefreshCw,CheckCircle2} from 'lucide-react';
import {restaurantRpc} from '@/lib/restaurantPOS';

const COPY={
 en:{
  title:'Customer Screen · Kitchen follow',
  hint:'Automatically follows the oldest active kitchen ticket from this cashier device and open shift. A new empty cashier order cannot replace it.',
  auto:'Follow Kitchen Display automatically (recommended)',cart:'Current cashier order (manual)',
  choose:'Screen follows',apply:'Apply screen mode',active:'Now showing',paired:'Pair the customer screen first.',kitchen:'Kitchen',
  empty:'Waiting for a kitchen order',queued:'Received',preparing:'Preparing',ready:'Ready',paid:'Paid',held:'On hold',open:'Open',
  saved:'Customer screen updated',error:'Could not change the screen mode. Refresh and retry.',
  pending:'Applying...',returned:'Show current cashier order',none:'No sent kitchen orders for this device and shift.',
 },
 fa:{
  title:'نمایشگر مشتری · تعقیب مطبخ',
  hint:'قدیمی‌ترین سفارش فعال مطبخِ همین دستگاه و شیفت را به‌صورت خودکار دنبال می‌کند؛ سفارش جدید و خالی جای آن را نمی‌گیرد.',
  auto:'تعقیب خودکار مطبخ (پیشنهادی)',cart:'سفارش جاری کاشیر (دستی)',
  choose:'نمایشگر تعقیب کند',apply:'اعمال حالت نمایش',active:'در حال نمایش',paired:'اول نمایشگر مشتری را وصل کنید.',kitchen:'مطبخ',
  empty:'در انتظار سفارش مطبخ',queued:'دریافت‌شده',preparing:'آماده‌سازی',ready:'آماده',paid:'پرداخت‌شده',held:'نگهداری',open:'باز',
  saved:'نمایشگر مشتری آپدیت شد',error:'تغییر نمایشگر ناموفق شد؛ تازه‌سازی و دوباره کوشش کنید.',
  pending:'در حال تغییر...',returned:'نمایش سفارش جاری کاشیر',none:'سفارش ارسال‌شده‌ای از همین دستگاه و شیفت نیست.',
 },
 ar:{
  title:'شاشة العميل · متابعة المطبخ',
  hint:'تتابع تلقائياً أقدم طلب مطبخ نشط لنفس جهاز الكاشير ووردية العمل. الطلب الجديد الفارغ لا يحل محله.',
  auto:'متابعة المطبخ تلقائياً (موصى بها)',cart:'طلب الكاشير الحالي (يدوياً)',
  choose:'الشاشة تتابع',apply:'تطبيق وضع الشاشة',active:'يعرض الآن',paired:'اربط شاشة العميل أولاً.',kitchen:'المطبخ',
  empty:'بانتظار طلب من المطبخ',queued:'تم الاستلام',preparing:'قيد التحضير',ready:'جاهز',paid:'مدفوع',held:'معلّق',open:'مفتوح',
  saved:'تم تحديث شاشة العميل',error:'تعذر تغيير وضع الشاشة. حدث الصفحة وحاول مجدداً.',
  pending:'جارٍ التحديث...',returned:'عرض طلب الكاشير الحالي',none:'لا توجد طلبات مطبخ من هذا الجهاز والوردية.',
 }
};
export const kitchenFocusValue=data=>data?.display_mode==='pin'&&data?.pinned_order_id
  ?'pin:'+data.pinned_order_id:data?.display_mode==='cart'?'cart':'kitchen';
export const kitchenFocusRequest=value=>{
  const v=String(value||'kitchen');
  if(v.startsWith('pin:')&&v.length>4)return {p_action:'pin',p_order_id:v.slice(4)};
  if(v==='cart')return {p_action:'cart',p_order_id:null};
  return {p_action:'auto',p_order_id:null};
};

export default function RestaurantDisplayFocus({deviceId,allowed,linked=false,lang='en'}){
 const c=COPY[lang]||COPY.en;
 const q=useQuery({
   queryKey:['restaurant-customer-display-focus',deviceId,linked],
   queryFn:()=>restaurantRpc('pos_display_focus',{
     p_device_id:deviceId,p_action:'list',p_order_id:null,
   }),
   enabled:Boolean(deviceId&&allowed),staleTime:2000,refetchInterval:5000,retry:1,
 });
 const [selection,setSelection]=useState('kitchen');
 const [dirty,setDirty]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const savedValue=kitchenFocusValue(q.data);
 useEffect(()=>{if(!dirty)setSelection(savedValue);},[dirty,savedValue]);
 useEffect(()=>{setSelection('kitchen');setDirty(false);setError('');setMessage('');},[deviceId]);
 const commit=async(value=selection)=>{
   if(!allowed||busy||!q.data?.paired)return;
   setBusy(true);setError('');setMessage('');
   try{
     const next=await restaurantRpc('pos_display_focus',{
       p_device_id:deviceId,...kitchenFocusRequest(value),
     });
     setDirty(false);setSelection(kitchenFocusValue(next));
     await q.refetch();
     setMessage(c.saved);
   }catch(e){setError(e?.message||c.error);}
   finally{setBusy(false);}
 };
 if(!allowed)return null;
 return <section data-testid="restaurant-display-focus"
   className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 text-slate-950 shadow-sm dark:border-blue-900 dark:bg-slate-900 dark:text-white">
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
         <option value="kitchen">{c.auto}</option>
         <option value="cart">{c.cart}</option>
         {(q.data?.orders||[]).map(row=><option key={row.id} value={'pin:'+row.id}>
           #{row.number} · {c.kitchen}: {c[row.kitchen_status]||row.kitchen_status} · {c[row.status]||row.status}
         </option>)}
         {q.data?.pinned_order_id&&!q.data?.orders?.some(o=>o.id===q.data.pinned_order_id)&&
          <option value={'pin:'+q.data.pinned_order_id}>#{q.data?.pinned_order_number||'—'} · {c.active}</option>}
       </select>
     </label>
     <button type="button" data-testid="restaurant-display-apply-order"
       disabled={busy||!q.data?.paired||selection===savedValue}
       onClick={()=>void commit()}
       className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-black text-white disabled:opacity-45">
       {busy?<RefreshCw size={18} className="animate-spin"/>:<CheckCircle2 size={18}/>}
       {busy?c.pending:c.apply}
     </button>
     {savedValue!=='cart'&&<button type="button" data-testid="restaurant-display-follow-cart"
       disabled={busy||!q.data?.paired} onClick={()=>void commit('cart')}
       className="mt-5 min-h-12 rounded-xl border border-blue-300 bg-white px-4 text-sm font-black text-blue-700 disabled:opacity-45">
       {c.returned}
     </button>}
   </div>
   {q.data?.paired&&<p className="mt-2 text-sm font-semibold text-blue-800 dark:text-blue-200" data-testid="restaurant-display-selected-mode">
     {c.active}: {savedValue==='kitchen'?
       c.auto+' · '+(q.data?.effective_order_number?'#'+q.data.effective_order_number:c.empty)
       :savedValue==='cart'?c.cart:
       '#'+(q.data?.pinned_order_number||q.data.orders?.find(o=>o.id===q.data.pinned_order_id)?.number||'—')}
   </p>}
   {!!q.data?.paired&&!(q.data?.orders||[]).length&&<p className="mt-1 text-xs text-slate-500">{c.none}</p>}
   {(error||q.error)&&<p role="alert" className="mt-2 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error||q.error.message}</p>}
   {message&&<p role="status" className="mt-2 text-sm font-semibold text-emerald-700">{message}</p>}
 </section>;
}
