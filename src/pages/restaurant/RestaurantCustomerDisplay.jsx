import React,{useEffect,useMemo,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {createClient} from '@supabase/supabase-js';
import {ChefHat,UtensilsCrossed,Clock3,CheckCircle2,Wifi,WifiOff,Monitor,ReceiptText,PackageCheck} from 'lucide-react';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from '@/api/supabaseClient';
import {restaurantRpc,restaurantProductName} from '@/lib/restaurantPOS';
import {money} from '@/lib/retailCashier';
import {subscribeCashierBroadcast} from '@/lib/cashierBroadcast';
import {useLanguage} from '@/lib/LanguageContext';

const COPY={
 en:{
  eyebrow:'BIZCTRL · RESTAURANT',title:'Your order',subtitle:'Your order, direct from our kitchen',
  ticket:'Order number',items:'Ordered meals',qty:'items',waiting:'Waiting for your order',
  waitingHint:'Your meals and order number will appear here as the cashier adds them.',
  draft:'Being entered',queued:'Received by kitchen',preparing:'Preparing',ready:'Ready for pickup',served:'Handed over',
  progress:'Kitchen progress',received:'Received',cooking:'Preparing',finished:'Ready',
  service:'Type',dine_in:'Dine in',takeaway:'Takeaway',delivery:'Delivery',table:'Table / pickup',
  amount:'Order total',subtotal:'Before tax',tax:'Included tax',paid:'Payment received',unpaid:'Payment pending',
  fresh:'Live',stale:'Connection lost · refreshing',invalid:'This display has expired or was re-paired. Ask the cashier to pair it again.',
  noData:'Checking your order…',updated:'Last updated',privacy:'Your order only · No other customer information',
  thanksTitle:'Thank you for your patience!',thanksBody:'Your order is being prepared in our kitchen. We appreciate your patience.',
  thanksIdle:'Thank you for visiting! Your next order will appear here automatically.',
  thanksReady:'Thank you! Your order is ready for pickup.',
  waitElapsed:'Time waiting for your order',waitUnits:'minutes : seconds',
  waitNote:'Time elapsed since the kitchen received your order · not an estimated completion time',
 },
 fa:{
  eyebrow:'BIZCTRL · رستورانت',title:'سفارش شما',subtitle:'سفارش شما، مستقیم از داخل مطبخ',
  ticket:'نمبر سفارش',items:'غذاهای سفارش‌شده',qty:'قلم',waiting:'در انتظار سفارش شما',
  waitingHint:'وقتی کاشیر غذاها را درج کند، همین‌جا نمبر و جزئیات سفارش نشان داده می‌شود.',
  draft:'در حال ثبت',queued:'دریافت در مطبخ',preparing:'در حال آماده‌سازی',ready:'آمادهٔ تحویل',served:'تحویل داده شد',
  progress:'وضعیت مطبخ',received:'دریافت شد',cooking:'آماده‌سازی',finished:'آماده',
  service:'نوع سفارش',dine_in:'حضوری',takeaway:'بیرون‌بر',delivery:'دلیوری',table:'میز / تحویل',
  amount:'مجموع سفارش',subtotal:'قبل از مالیات',tax:'مالیات شامل',paid:'پرداخت دریافت شد',unpaid:'پرداخت باقی است',
  fresh:'زنده',stale:'ارتباط قطع است · در حال تازه‌سازی',invalid:'لینک نمایشگر منقضی یا دوباره وصل شده؛ از کاشیر لینک تازه بگیرید.',
  noData:'در حال بررسی سفارش…',updated:'آخرین تازه‌سازی',privacy:'فقط سفارش شما · بدون معلومات مشتریان دیگر',
  thanksTitle:'تشکر از صبر و حوصلهٔ شما!',thanksBody:'سفارش شما در مطبخ آماده می‌شود. از شکیبایی شما سپاسگزاریم.',
  thanksIdle:'تشکر از تشریف‌آوری شما! سفارش بعدی همین‌جا خودکار نشان داده می‌شود.',
  thanksReady:'تشکر! سفارش شما آمادهٔ تحویل است.',
  waitElapsed:'مدت انتظار سفارش شما',waitUnits:'دقیقه : ثانیه',
  waitNote:'زمان سپری‌شده از ارسال سفارش به مطبخ؛ نه زمان تخمینی تحویل',
 },
 ar:{
  eyebrow:'BIZCTRL · المطعم',title:'طلبك',subtitle:'طلبك مباشرة من المطبخ',
  ticket:'رقم الطلب',items:'الوجبات المطلوبة',qty:'صنف',waiting:'بانتظار طلبك',
  waitingHint:'ستظهر هنا الوجبات ورقم الطلب بمجرد أن يضيفها الكاشير.',
  draft:'قيد الإدخال',queued:'وصل إلى المطبخ',preparing:'قيد التحضير',ready:'جاهز للاستلام',served:'تم التسليم',
  progress:'حالة الطلب في المطبخ',received:'تم الاستلام',cooking:'التحضير',finished:'جاهز',
  service:'نوع الطلب',dine_in:'محلي',takeaway:'سفري',delivery:'توصيل',table:'الطاولة / الاستلام',
  amount:'إجمالي الطلب',subtotal:'قبل الضريبة',tax:'الضريبة المشمولة',paid:'تم استلام الدفع',unpaid:'بانتظار الدفع',
  fresh:'مباشر',stale:'الاتصال منقطع · إعادة التحديث',invalid:'انتهت صلاحية الرابط أو أعيد إقران الشاشة. اطلب رابطاً جديداً من الكاشير.',
  noData:'جارٍ التحقق من طلبك…',updated:'آخر تحديث',privacy:'طلبك فقط · دون بيانات العملاء الآخرين',
  thanksTitle:'شكرًا على صبركم!',thanksBody:'طلبكم قيد التجهيز في المطبخ. نقدّر انتظاركم.',
  thanksIdle:'شكرًا لزيارتكم! سيظهر الطلب التالي هنا تلقائيًا.',
  thanksReady:'شكرًا لكم! طلبكم جاهز للاستلام.',
  waitElapsed:'مدة انتظار طلبكم',waitUnits:'دقيقة : ثانية',
  waitNote:'الوقت المنقضي منذ إرسال الطلب للمطبخ وليس موعدًا متوقعًا للتسليم',
 }
};
const STAGES=['queued','preparing','ready'];
export const restaurantCustomerStage=status=>STAGES.indexOf(status)==-1?status==='served'?3:-1:STAGES.indexOf(status);
export const restaurantCustomerHasOrder=data=>Boolean(data&&data.number!==null&&data.number!==undefined);
export const restaurantWaitElapsedSeconds=(submittedAt,serverTime,elapsedLocalMs=0)=>{
  const submitted=Date.parse(submittedAt||'');
  const server=Date.parse(serverTime||'');
  if(!Number.isFinite(submitted)||!Number.isFinite(server))return null;
  // Calculate against the backend clock so a TV's wrong local clock
  // cannot make the timer jump or go negative.
  const elapsed=Math.max(0,Number(elapsedLocalMs)||0);
  return Math.max(0,Math.floor((server-submitted+elapsed)/1000));
};
export const restaurantWaitClock=seconds=>{
  if(!Number.isFinite(seconds)||seconds<0)return null;
  const m=Math.floor(seconds/60),s=Math.floor(seconds%60);
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
};
const validToken=token=>/^[a-f0-9]{64}$/.test(token);

export default function RestaurantCustomerDisplay(){
 const {hash}=useLocation();
 const token=hash.slice(1);
 const valid=validToken(token);
 const {lang:localLang}=useLanguage();
 const [data,setData]=useState(null);
 const lang=['en','ar','fa'].includes(data?.kitchen_language)?data.kitchen_language:localLang;
 const c=COPY[lang]||COPY.en;
 // Public screen deliberately NEVER inherits the cashier/Owner's auth session.
 const client=useMemo(()=>createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,
   storageKey:'bizctrl-restaurant-single-order-display'}
 }),[]);
 const [invalid,setInvalid]=useState(false);
 const [lastSync,setLastSync]=useState(0);
 const [now,setNow]=useState(Date.now());
 const refreshRef=useRef(null);
 const isOnline=typeof navigator==='undefined'||navigator.onLine!==false;
 const fresh=Boolean(valid&&!invalid&&isOnline&&lastSync&&now-lastSync<14000);
 const active=restaurantCustomerHasOrder(data);
 const stage=restaurantCustomerStage(data?.kitchen_status);
 const currency=data?.currency||'SAR';
 const lines=Array.isArray(data?.lines)?data.lines:[];
 const isWaiting=active&&(data?.kitchen_status==='queued'||data?.kitchen_status==='preparing');
 const elapsedSeconds=isWaiting?restaurantWaitElapsedSeconds(data?.submitted_at,data?.server_time,now-lastSync):null;
 const waitingClock=elapsedSeconds===null?null:restaurantWaitClock(elapsedSeconds);

 useEffect(()=>{
  setData(null);setInvalid(false);setLastSync(0);
  if(!valid)return;
  let stopped=false,busy=false;
  const refresh=async()=>{
   if(stopped||busy)return;
   busy=true;
   try{
    const result=await restaurantRpc('customer_display',{p_token:token},client);
    if(stopped)return;
    if(!result||!Array.isArray(result.lines)||typeof result.topic!=='string')
      throw new Error('Invalid restaurant display response');
    setData(result);setInvalid(false);setLastSync(Date.now());setNow(Date.now());
   }catch(err){
    if(stopped)return;
    if(err?.code==='42501'){setInvalid(true);setData(null);}
    setLastSync(0);
   }finally{busy=false;}
  };
  refreshRef.current=refresh;void refresh();
  const polling=setInterval(()=>void refresh(),5000);
  const clock=setInterval(()=>setNow(Date.now()),1000);
  const reconnect=()=>void refresh();
  const offline=()=>setLastSync(0);
  const visible=()=>{if(document.visibilityState==='visible')void refresh();};
  window.addEventListener('online',reconnect);
  window.addEventListener('offline',offline);
  document.addEventListener('visibilitychange',visible);
  return()=>{
   stopped=true;refreshRef.current=null;clearInterval(polling);clearInterval(clock);
   window.removeEventListener('online',reconnect);
   window.removeEventListener('offline',offline);
   document.removeEventListener('visibilitychange',visible);
  };
 },[client,token,valid]);

 useEffect(()=>{
  if(!data?.topic||!valid)return;
  let timer;
  const off=subscribeCashierBroadcast(client,'customer-display:'+data.topic,event=>{
   if(event==='changed'||event==='SUBSCRIBED'){
    clearTimeout(timer);timer=setTimeout(()=>void refreshRef.current?.(),120);
   }
  });
  return()=>{clearTimeout(timer);off();};
 },[client,data?.topic,valid]);

 const stateText=stage===3?c.served:stage>=0?c[STAGES[stage]]:c.draft;
 return <main dir={lang==='en'?'ltr':'rtl'} data-testid="restaurant-customer-display"
  className="min-h-dvh bg-[#f3f7fd] px-3 py-5 text-slate-950 sm:px-6 sm:py-8 xl:px-12">
  <div className="mx-auto max-w-[1500px]">
   <header className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-blue-100 bg-white px-4 py-4 shadow-sm sm:px-6">
    <div className="flex items-center gap-3">
     <span className="rounded-2xl bg-blue-600 p-3 text-white"><ChefHat size={30}/></span>
     <div><p className="text-[11px] font-black tracking-wide text-blue-600 sm:text-sm">{c.eyebrow}</p>
      <h1 className="text-xl font-black sm:text-3xl">{data?.business_name||c.title}</h1>
      <p className="text-xs font-semibold text-slate-500 sm:text-base">{data?.branch_name||c.subtitle}{data?.device_code?' · '+data.device_code:''}</p>
     </div>
    </div>
    <div data-testid="restaurant-display-status" role="status"
      className={'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold '+(fresh?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-900')}>
      {fresh?<Wifi size={18}/>:<WifiOff size={18}/>}
      {fresh?c.fresh:c.stale}
    </div>
   </header>
   {(!valid||invalid)?<section role="alert" className="rounded-3xl border border-rose-200 bg-white p-12 text-center text-xl font-bold text-rose-700">
    <Monitor className="mx-auto mb-4 text-rose-400" size={46}/>{c.invalid}
   </section>:!fresh?<section role="status" className="rounded-3xl border bg-white px-5 py-16 text-center text-xl font-bold text-amber-800">
    <WifiOff className="mx-auto mb-4" size={48}/>{c.stale}
   </section>:<>
    <section className="mb-5 grid gap-3 rounded-3xl bg-gradient-to-r from-[#0e234b] to-[#174e9d] px-4 py-5 text-white shadow-lg sm:grid-cols-[auto_1fr] sm:gap-6 sm:px-7">
     <div className="rounded-2xl bg-white/10 px-5 py-3 text-center sm:min-w-52 sm:py-5">
      <p className="text-sm font-bold text-blue-100">{c.ticket}</p>
      <p dir="ltr" data-testid="restaurant-order-number" className="mt-1 text-4xl font-black tracking-tight sm:text-6xl">{active?'#'+data.number:'—'}</p>
     </div>
     <div className="flex min-w-0 flex-col justify-center">
      <p className="text-xs font-semibold text-blue-200">{c.progress}</p>
      <h2 data-testid="restaurant-kitchen-state" className="mt-1 text-xl font-black sm:text-3xl">{active?stateText:c.waiting}</h2>
      {active&&<p className="mt-2 text-sm text-blue-100">{c[data?.order_type]||''}{data?.table_label?' · '+c.table+': '+data.table_label:''}</p>}
     </div>
    </section>
    <section data-testid="restaurant-customer-thank-you"
      className="mb-5 rounded-3xl border border-sky-200 bg-white px-4 py-6 text-center shadow-sm sm:px-8 sm:py-8">
      <h2 className="text-2xl font-black text-blue-900 sm:text-4xl">{c.thanksTitle}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-base font-semibold text-slate-600 sm:text-xl">
        {!active?c.thanksIdle:stage>=2?c.thanksReady:c.thanksBody}
      </p>
      {isWaiting&&waitingClock!==null&&<div data-testid="restaurant-waiting-panel" className="mt-5 rounded-3xl border border-blue-200 bg-gradient-to-br from-[#0e234b] to-[#2254a0] px-4 py-6 text-white sm:px-6">
        <p className="text-base font-bold text-blue-100 sm:text-2xl">{c.waitElapsed}</p>
        <p dir="ltr" role="timer" aria-live="off" data-testid="restaurant-waiting-clock"
          className="mt-2 font-black leading-none tracking-tight tabular-nums text-6xl sm:text-8xl lg:text-9xl motion-safe:animate-pulse motion-reduce:animate-none">{waitingClock}</p>
        <p className="mt-2 text-sm font-semibold text-blue-100 sm:text-lg">{c.waitUnits}</p>
        <p className="mt-3 text-xs text-blue-100/80 sm:text-sm">{c.waitNote}</p>
      </div>}
    </section>
    {active&&<section aria-label={c.progress} data-testid="restaurant-kitchen-progress"
      className="mb-5 grid grid-cols-3 gap-2 rounded-2xl border border-blue-100 bg-white p-3 sm:gap-4 sm:p-5">
     {STAGES.map((value,index)=><div key={value} className={'flex min-w-0 items-center gap-2 rounded-xl px-2 py-3 sm:px-4 '+(stage>=index?'bg-emerald-50 text-emerald-800':'bg-slate-50 text-slate-400')}>
      {stage>=index?<CheckCircle2 className="h-5 w-5 shrink-0 sm:h-7 sm:w-7"/>:<Clock3 className="h-5 w-5 shrink-0 sm:h-7 sm:w-7"/>}
      <span className="text-xs font-black sm:text-lg">{index===0?c.received:index===1?c.cooking:c.finished}</span>
     </div>)}
    </section>}
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
     <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-5">
       <h2 className="flex items-center gap-2 text-xl font-black sm:text-2xl"><UtensilsCrossed size={23} className="text-blue-600"/>{c.items}</h2>
       {active&&<span className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">{data.units??0} {c.qty}</span>}
      </div>
      {(!active||!lines.length)?<div className="px-6 py-16 text-center">
        <ChefHat size={56} className="mx-auto text-blue-200"/>
        <h3 className="mt-4 text-lg font-black text-slate-600">{c.waiting}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{c.waitingHint}</p>
       </div>:<div aria-live="polite" className="divide-y divide-slate-100 px-4 sm:px-6">
        {lines.map((line,i)=><div key={i} className="flex items-center gap-3 py-4 sm:gap-4 sm:py-5">
         <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-xl font-black text-blue-700">{line.quantity}×</span>
         <strong className="min-w-0 flex-1 break-words text-base sm:text-xl">{restaurantProductName(line,lang)||'—'}</strong>
         <span className="shrink-0 text-sm font-black tabular-nums sm:text-lg" dir="ltr">{money(line.line_total,currency)}</span>
        </div>)}
       </div>}
     </section>
     <aside className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
      <div className="bg-[#0e234b] p-5 text-white sm:p-7">
       <p className="text-sm font-semibold text-blue-200">{c.amount}</p>
       <p dir="ltr" data-testid="restaurant-order-total" className="mt-2 text-4xl font-black tabular-nums sm:text-5xl">
        {active?money(data.net_total,currency):'—'}
       </p>
       {active&&<div className="mt-5 space-y-2 border-t border-white/20 pt-4 text-sm text-slate-200">
        <div className="flex justify-between gap-3"><span>{c.subtotal}</span><span dir="ltr">{money(data.subtotal,currency)}</span></div>
        <div className="flex justify-between gap-3"><span>{c.tax}</span><span dir="ltr">{money(data.tax_total,currency)}</span></div>
       </div>}
      </div>
      <div className={'flex items-center gap-2 px-5 py-5 font-black '+(data?.status==='paid'?'bg-emerald-100 text-emerald-800':'bg-amber-50 text-amber-900')}>
       {data?.status==='paid'?<PackageCheck size={24}/>:<ReceiptText size={24}/>}
       {active?(data?.status==='paid'?c.paid:c.unpaid):c.waiting}
      </div>
     </aside>
    </div>
   </>}
   <footer className="mt-5 flex flex-wrap justify-between gap-2 px-2 text-xs font-semibold text-slate-500">
    <span>{c.privacy}</span>
    {fresh&&<span>{c.updated}: {new Date(lastSync).toLocaleTimeString(lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-US')}</span>}
   </footer>
  </div>
 </main>;
}
