import React,{useState,useEffect} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {Button} from '@/components/ui/button';

const translations={
 en:{title:'Portal orders',empty:'No pending portal orders',note:'These requests do not record sales, payment or inventory. Use authorized POS for accounting.',approve:'Approve / To kitchen',reject:'Reject',prepare:'Start preparation',ready:'Mark ready',complete:'Complete',refresh:'Refresh',unavailable:'Order inbox unavailable',stale:'Offline or stale data: actions disabled'},
 ar:{title:'طلبات البوابات',empty:'لا توجد طلبات معلقة',note:'هذه طلبات غير محاسبية؛ سجل الدفع والمخزون عبر نقطة البيع.',approve:'موافقة / إلى المطبخ',reject:'رفض',prepare:'بدء التحضير',ready:'جاهز',complete:'مكتمل',refresh:'تحديث',unavailable:'تعذر تحميل الطلبات',stale:'انقطع الاتصال؛ الإجراءات متوقفة'},
 fa:{title:'سفارش‌های پورتل',empty:'سفارش منتظر وجود ندارد',note:'این درخواست‌ها فروش، پرداخت یا موجودی را ثبت نمی‌کنند. حسابداری فقط از POS مجاز انجام شود.',approve:'تأیید / ارسال مطبخ',reject:'رد',prepare:'شروع پخت',ready:'آماده',complete:'تکمیل',refresh:'تازه‌سازی',unavailable:'خواندن سفارش‌ها ناموفق بود',stale:'اتصال تازه نیست؛ تغییر وضعیت غیرفعال است'},
};
const rpc=async(name,args)=>{const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data;};
export default function PortalOrderInbox({restaurantId,branchId,lang='en',dark=false,kitchenOnly=false}){
 const t=translations[lang]||translations.en;
 const qc=useQueryClient();
 const [message,setMessage]=useState('');
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),2000);return()=>clearInterval(id);},[]);
 const q=useQuery({queryKey:['portal-order-inbox',restaurantId,branchId],
  queryFn:()=>rpc('erp_portal_order_inbox',{p_restaurant_id:restaurantId,p_branch_id:branchId}),
  enabled:Boolean(restaurantId&&branchId),refetchInterval:7000,refetchOnWindowFocus:true,retry:1});
 const action=useMutation({mutationFn:({id,command})=>rpc('erp_portal_order_action',{p_order_id:id,p_action:command}),
  onSuccess:()=>{setMessage('');qc.invalidateQueries({queryKey:['portal-order-inbox',restaurantId,branchId]});
   qc.invalidateQueries({queryKey:['portal-order-context']});},
  onError:e=>{setMessage(e?.message||t.unavailable);void q.refetch();}});
 const connected=(typeof navigator==='undefined'||navigator.onLine!==false)&&
  !q.isError&&!q.isPending&&Boolean(q.dataUpdatedAt)&&now-q.dataUpdatedAt<15000;
 const manager=q.data?.manager===true;
 const orders=(Array.isArray(q.data?.orders)?q.data.orders:[]).filter(o=>!kitchenOnly||
  (o.order_kind==='restaurant'&&['queued','preparing','ready'].includes(o.status)));
 // Avoid taking valuable TV space from the ordinary POS kitchen board when
 // the optional portal-order feature has no active requests.
 if(kitchenOnly&&connected&&orders.length===0)return null;
 const actionButton=(o,command,label,outline=false)=><Button type="button" size="sm" variant={outline?'outline':'default'}
  disabled={!connected||action.isPending} onClick={()=>action.mutate({id:o.id,command})}>{label}</Button>;
 return <section dir={lang==='en'?'ltr':'rtl'} data-testid="portal-order-inbox"
  className={'space-y-3 rounded-2xl border p-3 sm:p-4 '+(dark?'border-cyan-600 bg-slate-900 text-white':'border-blue-200 bg-white text-slate-950')}>
  <header className="flex flex-wrap items-center justify-between gap-2">
   <h2 className="text-lg font-black">{t.title} ({orders.length})</h2>
   <button type="button" className="rounded-lg border px-3 py-2 text-xs font-bold" onClick={()=>q.refetch()}>{t.refresh}</button>
  </header>
  <p className={'text-xs leading-5 '+(dark?'text-amber-200':'text-amber-800')}>{t.note}</p>
  {q.isError&&<p role="alert" className="rounded-lg bg-rose-900 p-3 text-sm text-white">{t.unavailable}</p>}
  {!connected&&!q.isError&&<p role="status" className="text-xs text-amber-500">{t.stale}</p>}
  {message&&<p role="alert" className="rounded-lg border border-rose-400 p-3 text-xs text-rose-500">{message}</p>}
  {connected&&orders.length===0&&<p className="rounded-xl border border-dashed p-4 text-sm opacity-70">{t.empty}</p>}
  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{orders.map(o=>
   <article key={o.id} data-testid="portal-order-ticket" className={'space-y-3 rounded-xl border p-3 '+(dark?'border-slate-600 bg-slate-800':'border-blue-100 bg-slate-50')}>
    <div className="flex flex-wrap items-center justify-between gap-2">
     <strong>#{String(o.id).slice(0,8).toUpperCase()} · {o.actor_role}</strong>
     <span className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-bold text-white">{o.status.replaceAll('_',' ')}</span>
    </div>
    <p className="text-xs opacity-75">{o.recipient} · {new Date(o.created_at).toLocaleString()}
     {manager&&o.customer_reference?' · '+o.customer_reference:''}</p>
    {o.fulfillment_mode&&<div className="rounded-xl border border-teal-400/40 p-2 text-sm font-bold"
       data-testid="portal-order-fulfillment">
      {o.fulfillment_mode==='delivery'?(lang==='ar'?'توصيل للعميل':lang==='fa'?'ارسال به مشتری':'Customer delivery'):
        (lang==='ar'?'استلام من المطعم':lang==='fa'?'تحویل از رستوران':'Customer pickup')}
      {o.fulfillment_mode==='delivery'&&manager&&<div className="mt-2 space-y-1 text-xs font-semibold">
       <p>{lang==='ar'?'العنوان':lang==='fa'?'نشانی':'Address'}: {o.delivery_address||'—'}</p>
       <p>{lang==='ar'?'الهاتف':lang==='fa'?'شماره تماس':'Phone'}: <span dir="ltr">{o.contact_phone||'—'}</span></p>
       <p className="text-amber-600">{lang==='ar'?'رسوم التوصيل غير مؤكدة':lang==='fa'?'هزینه دلیوری هنوز تأیید نشده':'Delivery fee pending manager confirmation'}</p>
      </div>}
     </div>}
    {(Array.isArray(o.items)?o.items:[]).map((line,i)=><div key={line.id||i}
     className="flex items-start justify-between gap-2 border-b border-slate-400/20 py-1 text-sm font-bold">
      <span className="min-w-0 break-words">{line['name_'+lang]||line.name}</span>
      <strong dir="ltr" className="text-lg">×{line.quantity}</strong>
     </div>)}
    {o.notes&&<p className="rounded-lg bg-amber-900/20 p-2 text-xs">{o.notes}</p>}
    {manager&&<p className="text-xs">Quoted: {Number(o.total_quote).toFixed(2)} (not paid)</p>}
    <div className="flex flex-wrap gap-2">
     {manager&&o.status==='awaiting_manager'&&<>{actionButton(o,'approve',t.approve)}{actionButton(o,'reject',t.reject,true)}</>}
     {o.order_kind==='restaurant'&&o.status==='queued'&&actionButton(o,'preparing',t.prepare)}
     {o.order_kind==='restaurant'&&o.status==='preparing'&&actionButton(o,'ready',t.ready)}
     {manager&&['ready','accepted'].includes(o.status)&&actionButton(o,'complete',t.complete)}
    </div>
   </article>)}</div>
 </section>;
}
