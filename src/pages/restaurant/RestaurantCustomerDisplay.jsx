import React,{useEffect,useMemo,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {createClient} from '@supabase/supabase-js';
import {ChefHat,UtensilsCrossed,Clock3,CheckCircle2,Wifi,RefreshCw,Monitor,ReceiptText,PackageCheck} from 'lucide-react';
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
  fresh:'Live',stale:'Updating quietly · last checked below',connecting:'Preparing the display…',invalid:'This display has expired or was re-paired. Ask the cashier to pair it again.',
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
  fresh:'زنده',stale:'تازه‌سازی آرام در پس‌زمینه',connecting:'آماده‌سازی نمایشگر…',invalid:'لینک نمایشگر منقضی یا دوباره وصل شده؛ از کاشیر لینک تازه بگیرید.',
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
  fresh:'مباشر',stale:'تحديث هادئ في الخلفية',connecting:'جارٍ تجهيز الشاشة…',invalid:'انتهت صلاحية الرابط أو أعيد إقران الشاشة. اطلب رابطاً جديداً من الكاشير.',
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
// A short, bounded grace window prevents a failed fetch from blanking a TV,
// without exposing old customer totals indefinitely during a long outage.
export const customerSnapshotVisible=(lastSync,now,ttlMs=120000)=>
 Boolean(lastSync>0&&now>=lastSync&&now-lastSync<=ttlMs);
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
 const snapshotVisible=Boolean(!invalid&&customerSnapshotVisible(lastSync,now));
 const active=snapshotVisible&&restaurantCustomerHasOrder(data);
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
    // Keep last successful snapshot and timestamp on transient network errors.
    // Expired/revoked tokens above still discard data immediately.
    setNow(Date.now());
   }finally{busy=false;}
  };
  refreshRef.current=refresh;void refresh();
  const polling=setInterval(()=>void refresh(),5000);
  const clock=setInterval(()=>setNow(Date.now()),1000);
  const reconnect=()=>void refresh();
  const offline=()=>setNow(Date.now());
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

 // The public TV is a fixed viewport, not a vertically scrolling document.
 // Large orders rotate a bounded number of lines; the customer never needs
 // a touch/scroll gesture to read their order.
 const [visibleSlots,setVisibleSlots]=useState(3);
 const [itemPage,setItemPage]=useState(0);
 useEffect(()=>{
  const recalc=()=>{
   const height=window.innerHeight||700,width=window.innerWidth||400;
   setVisibleSlots(height<620?2:width>=1200?7:width>=768?5:height<850?3:4);
  };
  recalc();window.addEventListener('resize',recalc);
  return()=>window.removeEventListener('resize',recalc);
 },[]);
 const itemPages=Math.max(1,Math.ceil(lines.length/visibleSlots));
 useEffect(()=>{setItemPage(0);},[data?.number,lines.length,visibleSlots]);
 useEffect(()=>{
  if(itemPages<=1)return;
  const id=setInterval(()=>setItemPage(previous=>(previous+1)%itemPages),6000);
  return()=>clearInterval(id);
 },[itemPages]);
 const currentItemPage=Math.min(itemPage,itemPages-1);
 const visibleLines=lines.slice(currentItemPage*visibleSlots,(currentItemPage+1)*visibleSlots);
 const stateText=stage===3?c.served:stage>=0?c[STAGES[stage]]:c.draft;

 return <main dir={lang==='en'?'ltr':'rtl'} data-testid="restaurant-customer-display"
  className="fixed inset-0 z-[120] h-[100dvh] w-screen overflow-hidden overscroll-none bg-[#f3f7fd] text-slate-950">
  <div data-testid="restaurant-customer-tv-viewport"
   className="mx-auto grid h-full min-h-0 w-full max-w-[1800px] grid-rows-[auto_minmax(0,1fr)_auto] gap-2 overflow-hidden p-2 sm:gap-3 sm:p-4 lg:p-5">

   <header className="flex min-w-0 items-center justify-between gap-2 rounded-2xl border border-blue-100 bg-white px-3 py-2 shadow-sm sm:rounded-3xl sm:px-5 sm:py-3">
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
     <span className="shrink-0 rounded-xl bg-blue-600 p-2 text-white sm:rounded-2xl sm:p-3">
      <ChefHat className="h-5 w-5 sm:h-7 sm:w-7"/>
     </span>
     <div className="min-w-0 flex-1">
      <p className="truncate text-[10px] font-black tracking-wide text-blue-600 sm:text-xs">{c.eyebrow}</p>
      <h1 className="truncate text-base font-black sm:text-2xl lg:text-3xl">{data?.business_name||c.title}</h1>
      <p className="truncate text-[11px] font-semibold text-slate-500 sm:text-sm">
       {data?.branch_name||c.subtitle}{data?.device_code?' · '+data.device_code:''}
      </p>
     </div>
    </div>
    <div data-testid="restaurant-display-status" role="status"
     className={'flex max-w-[35%] shrink-0 items-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] font-semibold sm:px-3 sm:py-2 sm:text-sm '+(fresh?'bg-emerald-100 text-emerald-800':'bg-slate-100 text-slate-600')}>
     {fresh?<Wifi className="h-4 w-4 shrink-0"/>:<RefreshCw className="h-4 w-4 shrink-0 motion-safe:animate-spin motion-reduce:animate-none"/>}
     <span className="min-w-0 truncate">{fresh?c.fresh:lastSync?c.stale:c.connecting}</span>
    </div>
   </header>

   {(!valid||invalid)?<section role="alert" className="grid min-h-0 place-content-center gap-3 rounded-2xl border border-rose-200 bg-white p-4 text-center text-base font-bold text-rose-700 sm:text-xl">
    <Monitor className="mx-auto text-rose-400" size={42}/>{c.invalid}
   </section>:
   <div data-testid="restaurant-customer-tv-content" className="grid min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)] gap-2 overflow-hidden sm:gap-3">
    <section className="grid min-w-0 grid-cols-[minmax(110px,0.37fr)_minmax(0,1fr)] items-stretch gap-2 rounded-2xl bg-gradient-to-r from-[#0e234b] to-[#174e9d] p-2 text-white shadow-lg sm:gap-4 sm:rounded-3xl sm:p-3 lg:p-4">
     <div className="grid min-w-0 place-content-center rounded-xl bg-white/10 px-2 py-2 text-center sm:rounded-2xl sm:px-4 sm:py-3">
      <p className="text-[11px] font-bold text-blue-100 sm:text-base">{c.ticket}</p>
      <p dir="ltr" data-testid="restaurant-order-number"
       className="mt-0.5 truncate text-[clamp(1.7rem,4.7vmin,5rem)] font-black leading-tight tracking-tight">
       {active?'#'+data.number:'—'}
      </p>
     </div>
     <div className="flex min-w-0 flex-col justify-center gap-1 px-1 sm:px-3">
      <p className="text-[11px] font-semibold text-blue-200 sm:text-sm">{c.progress}</p>
      <h2 data-testid="restaurant-kitchen-state" className="line-clamp-2 text-[clamp(1rem,2.5vmin,2rem)] font-black leading-tight">
       {active?stateText:c.waiting}
      </h2>
      {active&&<p className="truncate text-[11px] text-blue-100 sm:text-sm">
       {c[data?.order_type]||''}{data?.table_label?' · '+c.table+': '+data.table_label:''}
      </p>}
     </div>
    </section>

    <section data-testid="restaurant-customer-thank-you" className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-sky-200 bg-white px-3 py-2 text-center shadow-sm sm:rounded-3xl sm:px-5 sm:py-3">
     <div className="min-w-0">
      <h2 className="line-clamp-2 text-[clamp(1rem,2.4vmin,2.4rem)] font-black leading-tight text-blue-900">{c.thanksTitle}</h2>
      <p className="mt-1 line-clamp-2 text-[clamp(0.7rem,1.35vmin,1.15rem)] font-semibold leading-snug text-slate-600">
       {!active?c.thanksIdle:stage>=2?c.thanksReady:c.thanksBody}
      </p>
     </div>
     {isWaiting&&waitingClock!==null&&<div data-testid="restaurant-waiting-panel"
       className="shrink-0 rounded-xl bg-gradient-to-br from-[#0e234b] to-[#2254a0] px-2 py-2 text-center text-white sm:px-4">
       <p className="max-w-36 text-[10px] font-bold text-blue-100 sm:max-w-none sm:text-sm">{c.waitElapsed}</p>
       <p dir="ltr" role="timer" aria-live="off" data-testid="restaurant-waiting-clock"
        className="mt-1 whitespace-nowrap text-[clamp(1.5rem,4vmin,4rem)] font-black leading-none tabular-nums motion-safe:animate-pulse motion-reduce:animate-none">
        {waitingClock}
       </p>
       <p className="mt-0.5 text-[9px] text-blue-100 sm:text-xs">{c.waitUnits}</p>
       <p className="sr-only">{c.waitNote}</p>
      </div>}
    </section>

    {active?<section aria-label={c.progress} data-testid="restaurant-kitchen-progress"
     className="grid min-w-0 grid-cols-3 gap-1.5 rounded-xl border border-blue-100 bg-white p-1.5 sm:gap-3 sm:rounded-2xl sm:p-2">
     {STAGES.map((value,index)=><div key={value}
      className={'flex min-w-0 items-center justify-center gap-1 rounded-lg px-1 py-1.5 sm:gap-2 sm:py-2 '+(stage>=index?'bg-emerald-50 text-emerald-800':'bg-slate-50 text-slate-400')}>
      {stage>=index?<CheckCircle2 className="h-4 w-4 shrink-0 sm:h-6 sm:w-6"/>:<Clock3 className="h-4 w-4 shrink-0 sm:h-6 sm:w-6"/>}
      <span className="truncate text-[11px] font-black sm:text-base">{index===0?c.received:index===1?c.cooking:c.finished}</span>
     </div>)}
    </section>:<div className="hidden" aria-hidden="true"/>}

    <div data-testid="restaurant-customer-tv-bottom"
     className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(180px,0.34fr)] md:grid-rows-1 sm:gap-3">
     <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:rounded-3xl">
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 sm:px-5 sm:py-3">
       <h2 className="flex min-w-0 items-center gap-2 truncate text-base font-black sm:text-2xl">
        <UtensilsCrossed className="h-5 w-5 shrink-0 text-blue-600"/>{c.items}
       </h2>
       <div className="flex shrink-0 items-center gap-2 text-xs font-bold text-blue-700 sm:text-base">
        {active&&<span>{data.units??0} {c.qty}</span>}
        {itemPages>1&&<span dir="ltr" data-testid="restaurant-items-pagination" className="rounded-lg bg-blue-50 px-2 py-1 tabular-nums">
         {currentItemPage+1}/{itemPages}
        </span>}
       </div>
      </div>
      {!active||!lines.length?<div className="grid min-h-0 place-content-center gap-1 px-3 text-center">
       <ChefHat className="mx-auto h-8 w-8 text-blue-200 sm:h-12 sm:w-12"/>
       <h3 className="text-sm font-black text-slate-600 sm:text-lg">{c.waiting}</h3>
       <p className="line-clamp-2 text-[11px] text-slate-500 sm:text-sm">{c.waitingHint}</p>
      </div>:<div data-testid="restaurant-visible-item-lines" aria-live="off"
       className="grid min-h-0 content-start auto-rows-min gap-1 overflow-hidden px-2 py-1 sm:gap-2 sm:px-4 sm:py-2">
       {visibleLines.map((line,i)=><div key={currentItemPage+':'+i}
        className="flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 sm:gap-3 sm:py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-black text-blue-700 sm:h-10 sm:w-10 sm:text-lg">
         {line.quantity}×
        </span>
        <strong className="min-w-0 flex-1 truncate text-sm sm:text-lg">{restaurantProductName(line,lang)||'—'}</strong>
        <span className="shrink-0 whitespace-nowrap text-xs font-black tabular-nums sm:text-base" dir="ltr">{money(line.line_total,currency)}</span>
       </div>)}
      </div>}
     </section>

     <aside className="flex min-h-0 min-w-0 items-center justify-between gap-3 overflow-hidden rounded-2xl bg-[#0e234b] px-3 py-2 text-white shadow-sm md:flex-col md:items-stretch md:justify-between md:rounded-3xl md:p-5">
      <div className="min-w-0">
       <p className="text-[11px] font-semibold text-blue-200 sm:text-sm">{c.amount}</p>
       <p dir="ltr" data-testid="restaurant-order-total"
        className="truncate text-[clamp(1.2rem,3vmin,3rem)] font-black tabular-nums">
        {active?money(data.net_total,currency):'—'}
       </p>
       {active&&<div className="hidden gap-2 border-t border-white/20 pt-3 text-sm text-blue-100 lg:grid">
        <div className="flex justify-between gap-2"><span>{c.subtotal}</span><span dir="ltr">{money(data.subtotal,currency)}</span></div>
        <div className="flex justify-between gap-2"><span>{c.tax}</span><span dir="ltr">{money(data.tax_total,currency)}</span></div>
       </div>}
      </div>
      <div className={'flex max-w-[52%] shrink-0 items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-black md:max-w-none md:px-3 md:py-2 md:text-base '+(data?.status==='paid'?'bg-emerald-700 text-white':'bg-amber-100 text-amber-950')}>
       {data?.status==='paid'?<PackageCheck className="h-5 w-5 shrink-0"/>:<ReceiptText className="h-5 w-5 shrink-0"/>}
       <span className="line-clamp-2">{active?(data?.status==='paid'?c.paid:c.unpaid):c.waiting}</span>
      </div>
     </aside>
    </div>
   </div>}

   <footer className="flex min-w-0 items-center justify-between gap-2 overflow-hidden px-1 text-[10px] font-semibold text-slate-500 sm:text-xs">
    <span className="min-w-0 truncate">{c.privacy}</span>
    {lastSync>0&&<span className="shrink-0 whitespace-nowrap">{c.updated}: {new Date(lastSync).toLocaleTimeString(lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-US')}</span>}
   </footer>
  </div>
 </main>;
}
