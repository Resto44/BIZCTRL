import React,{useEffect,useMemo,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {createClient} from '@supabase/supabase-js';
import {ChefHat,UtensilsCrossed,Clock3,CheckCircle2,Wifi,RefreshCw,Monitor,ReceiptText,PackageCheck,ConciergeBell,ShieldCheck} from 'lucide-react';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from '@/api/supabaseClient';
import {restaurantRpc,restaurantProductName} from '@/lib/restaurantPOS';
import {money} from '@/lib/retailCashier';
import {subscribeCashierBroadcast} from '@/lib/cashierBroadcast';
import {useLanguage} from '@/lib/LanguageContext';
import './customerTicketGlow.css';

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

// All items remain mounted and visible: adapt the grid instead of cycling
// through pages (which previously caused food lines to appear/disappear).
export const restaurantCustomerItemColumns=(count,width=390,height=800)=>{
 // Full menu names are the priority: one readable row per item for the
 // common 1–6 item customer order, even on narrow mobile screens.
 // Larger orders use additional columns without hiding or paging items.
 if(width<650)return count<=6?1:Math.min(3,Math.max(2,Math.ceil(count/(height<700?7:9))));
 if(width<1100)return count<=8?1:Math.min(3,Math.ceil(count/9));
 return count<=10?1:Math.min(4,Math.ceil(count/10));
};
export const restaurantDishGlyph=name=>{
 const text=String(name||'').toLowerCase();
 if(/رز|برنج|rice|برياني|بریانی|كبسة|كبسه|كابلي|kabuli|biryani|كبسة/.test(text))return '🍛';
 if(/سلطة|سلطه|سالاد|salad|فتوش|تبوله/.test(text))return '🥗';
 if(/دجاج|مرغ|chicken|شواية|shawaya/.test(text))return '🍗';
 if(/شوربة|سوپ|شوربا|soup|مسقعة|مسقعه|مُسقعه/.test(text))return '🍲';
 return '🍽️';
};

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
 const lastOrderRef=useRef(false);
 const pendingEmptyRef=useRef({count:0,firstAt:0});
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
  lastOrderRef.current=false;pendingEmptyRef.current={count:0,firstAt:0};
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
    const receivedAt=Date.now();
    if(!restaurantCustomerHasOrder(result)&&lastOrderRef.current){
     // A single empty snapshot can be a temporary server transition.
     // Require two separated, verified empty reads before clearing the
     // current ticket, never stale customer data for the next shift.
     const pending=pendingEmptyRef.current;
     pendingEmptyRef.current={
       count:pending.count+1,
       firstAt:pending.firstAt||receivedAt,
     };
     if(pendingEmptyRef.current.count<2||receivedAt-pendingEmptyRef.current.firstAt<2500){
       setNow(receivedAt);
       return;
     }
    }
    pendingEmptyRef.current={count:0,firstAt:0};
    lastOrderRef.current=restaurantCustomerHasOrder(result);
    setData(result);setInvalid(false);setLastSync(receivedAt);setNow(receivedAt);
   }catch(err){
    if(stopped)return;
    if(err?.code==='42501'){setInvalid(true);setData(null);lastOrderRef.current=false;pendingEmptyRef.current={count:0,firstAt:0};}
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

 // Do not paginate/hide old items or flash between item batches.
 // Rows compress within the fixed TV viewport, switching to extra columns
 // only when needed; every line remains mounted between live refreshes.
 const [viewport,setViewport]=useState({width:390,height:800});
 useEffect(()=>{
  const measure=()=>setViewport({
   width:Math.max(280,window.innerWidth||390),
   height:Math.max(350,window.innerHeight||800),
  });
  measure();
  window.addEventListener('resize',measure);
  return()=>window.removeEventListener('resize',measure);
 },[]);
 const itemColumns=restaurantCustomerItemColumns(lines.length,viewport.width,viewport.height);
 const itemRows=Math.ceil(lines.length/itemColumns);
 const compactItems=itemRows>7;
 const denseItems=itemRows>11;
 const ticketLabel=active?'#'+String(data.number):'—';
 const longTicket=String(data?.number??'').length>5;
 const stateText=stage===3?c.served:stage>=0?c[STAGES[stage]]:c.draft;

 return <main dir={lang==='en'?'ltr':'rtl'} data-testid="restaurant-customer-display"
  className="fixed inset-0 z-[120] h-[100dvh] w-screen overflow-hidden overscroll-none bg-[#061938] text-slate-950">
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_5%,#1757a5_0%,transparent_52%)]"/>
  <div data-testid="restaurant-customer-tv-viewport"
   className="relative z-10 mx-auto grid h-full min-h-0 w-full max-w-[1800px] grid-rows-[auto_minmax(0,1fr)_auto] gap-1.5 overflow-hidden p-2 sm:gap-3 sm:p-4 lg:p-5">
   <div className="grid min-w-0 gap-1.5 sm:gap-3">
    <div className="flex min-w-0 items-center justify-between gap-2 px-1 text-white">
     <div className="flex min-w-0 items-center gap-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-blue-700 shadow-lg shadow-blue-500/30 sm:h-9 sm:w-9"><ChefHat className="h-5 w-5 sm:h-6 sm:w-6"/></span>
      <div className="min-w-0">
       <span className="block truncate text-sm font-black tracking-tight sm:text-xl">BizCTRL</span>
       <span className="block truncate text-[9px] font-semibold text-blue-200 sm:text-xs">{c.eyebrow}</span>
      </div>
     </div>
     <span className="max-w-[45%] truncate rounded-full border border-blue-400/50 bg-blue-400/10 px-3 py-1 text-[10px] font-semibold text-blue-100 sm:text-sm">{c.title} · ERP</span>
    </div>
    <header className="flex min-w-0 items-center justify-between gap-2 rounded-[20px] border border-blue-200 bg-gradient-to-b from-white to-[#e8f2ff] px-3 py-2 shadow-[0_4px_15px_rgba(18,91,207,0.18)] sm:rounded-3xl sm:px-6 sm:py-4">
     <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-800 text-white shadow-md sm:h-16 sm:w-16 sm:rounded-2xl">
       <ChefHat className="h-6 w-6 sm:h-9 sm:w-9" aria-hidden="true"/>
      </span>
      <div className="min-w-0 flex-1">
       <p className="truncate text-[10px] font-black text-blue-700 sm:text-sm">{c.eyebrow}</p>
       <h1 className="truncate text-[clamp(1rem,2.8vmin,2rem)] font-black leading-tight tracking-tight text-[#0b173a]">{data?.business_name||c.title}</h1>
       <p className="truncate text-[11px] font-bold text-slate-500 sm:text-base">
        {data?.branch_name||c.subtitle}{data?.device_code?' · '+data.device_code:''}
       </p>
      </div>
     </div>
     <div data-testid="restaurant-display-status" role="status"
      className={'flex max-w-[31%] shrink-0 items-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-extrabold sm:gap-2 sm:px-4 sm:py-2 sm:text-base '+(fresh?'bg-emerald-100 text-emerald-800':'bg-slate-100 text-slate-600')}>
      {fresh?<Wifi className="h-4 w-4 shrink-0 sm:h-5 sm:w-5"/>:<RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true"/>}
      <span className="min-w-0 truncate">{fresh?c.fresh:lastSync?c.stale:c.connecting}</span>
     </div>
    </header>
   </div>

   {(!valid||invalid)?<section role="alert" className="grid min-h-0 place-content-center gap-3 rounded-[22px] border border-rose-200 bg-white p-4 text-center text-base font-bold text-rose-700 sm:text-xl">
    <Monitor className="mx-auto text-rose-400" size={42}/>{c.invalid}
   </section>:
   <div data-testid="restaurant-customer-tv-content"
    className="grid min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] gap-1.5 overflow-hidden sm:gap-3">

    <section data-testid="restaurant-ticket-hero"
     className="relative grid min-w-0 grid-cols-[minmax(105px,0.39fr)_minmax(0,1fr)] items-stretch gap-2 overflow-hidden rounded-[22px] border border-cyan-300/70 bg-gradient-to-r from-[#102957] via-[#144ca5] to-[#0c2865] p-2.5 text-white shadow-[0_3px_20px_rgba(0,122,255,0.35)] sm:gap-5 sm:rounded-3xl sm:p-5">
     <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_100%,rgba(20,198,255,0.23),transparent_55%)]"/>
     <div className="relative grid min-w-0 place-content-center rounded-2xl border border-blue-300/40 bg-white/10 px-1 py-2 text-center shadow-inner sm:rounded-3xl sm:px-4">
      <p className="text-[11px] font-bold text-blue-100 sm:text-lg">{c.ticket}</p>
      <p dir="ltr" data-testid="restaurant-order-number"
       className="truncate text-[clamp(2.1rem,6.6vmin,6.3rem)] font-black leading-tight tabular-nums tracking-tight text-white drop-shadow-[0_0_12px_rgba(92,204,255,0.9)]">
       {active?'#'+data.number:'—'}
      </p>
     </div>
     <div className="relative flex min-w-0 items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
       <p className="text-[11px] font-bold text-blue-100 sm:text-base">{c.progress}</p>
       <h2 data-testid="restaurant-kitchen-state" className="line-clamp-2 text-[clamp(1.15rem,3.2vmin,3.1rem)] font-black leading-tight text-white">
        {active?stateText:c.waiting}
       </h2>
       {active&&<p className="mt-0.5 truncate text-[11px] font-semibold text-blue-100 sm:text-base">
        {c[data?.order_type]||''}{data?.table_label?' · '+c.table+': '+data.table_label:''}
       </p>}
      </div>
      <ConciergeBell aria-hidden="true" className="hidden h-12 w-12 shrink-0 text-blue-100/90 drop-shadow-[0_0_12px_rgba(132,202,255,0.65)] sm:block lg:h-24 lg:w-24"/>
     </div>
    </section>

    <section data-testid="restaurant-customer-thank-you" className="flex min-w-0 items-center justify-between gap-2 rounded-[20px] border border-blue-100 bg-gradient-to-b from-white to-[#e9f2ff] px-3 py-2 text-center shadow-md sm:rounded-3xl sm:px-6 sm:py-4">
     <div className="min-w-0 flex-1">
      <h2 className="line-clamp-2 text-[clamp(1rem,2.7vmin,2.5rem)] font-black leading-tight text-[#1145a4]">{c.thanksTitle}</h2>
      <p className="mt-0.5 line-clamp-2 text-[clamp(0.68rem,1.5vmin,1.3rem)] font-semibold leading-snug text-slate-600">
       {!active?c.thanksIdle:stage>=2?c.thanksReady:c.thanksBody}
      </p>
     </div>
     {isWaiting&&waitingClock!==null?<div data-testid="restaurant-waiting-panel" className="shrink-0 rounded-xl bg-[#0e2a5e] px-2 py-1.5 text-center text-white sm:rounded-2xl sm:px-4 sm:py-3">
      <p className="max-w-24 text-[9px] font-bold text-blue-100 sm:max-w-40 sm:text-sm">{c.waitElapsed}</p>
      <p dir="ltr" role="timer" aria-live="off" data-testid="restaurant-waiting-clock" className="text-[clamp(1.15rem,3.3vmin,3rem)] font-black leading-tight tabular-nums motion-reduce:animate-none">{waitingClock}</p>
      <span className="sr-only">{c.waitNote}</span>
     </div>:<CheckCircle2 aria-hidden="true" className="h-7 w-7 shrink-0 text-emerald-500 sm:h-11 sm:w-11"/>}
    </section>

    {active?<section aria-label={c.progress} data-testid="restaurant-kitchen-progress"
     className="relative grid min-w-0 grid-cols-3 gap-1 overflow-hidden rounded-[16px] border border-blue-100 bg-white p-1.5 shadow-sm sm:gap-3 sm:rounded-3xl sm:p-3">
     {STAGES.map((value,index)=><div key={value} className={'flex min-w-0 items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center sm:gap-3 sm:py-3 '+(stage>=index?'bg-emerald-50 text-emerald-800':'bg-slate-100 text-slate-500')}>
      {stage>=index?<CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 sm:h-8 sm:w-8"/>:<Clock3 className="h-4 w-4 shrink-0 sm:h-8 sm:w-8"/>}
      <span className="truncate text-[11px] font-black sm:text-lg">{index===0?c.received:index===1?c.cooking:c.finished}</span>
     </div>)}
    </section>:<div className="hidden" aria-hidden="true"/>}

    <section data-testid="restaurant-customer-tv-bottom"
     className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[20px] border border-blue-100 bg-gradient-to-b from-white to-[#e9f2ff] shadow-[0_3px_12px_rgba(25,98,180,0.15)] sm:rounded-3xl">
     <header className="flex min-w-0 items-center justify-between gap-2 border-b border-blue-100 px-3 py-2 sm:px-6 sm:py-4">
      <h2 className="flex min-w-0 items-center gap-2 truncate text-sm font-black text-[#0b173a] sm:text-2xl">
       <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-600 text-white sm:h-10 sm:w-10 sm:rounded-xl"><UtensilsCrossed className="h-4 w-4 sm:h-6 sm:w-6"/></span>
       {c.items}
      </h2>
      <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-black text-blue-800 sm:gap-3 sm:text-lg">
       {active&&<span className="rounded-xl bg-blue-50 px-2 py-1 text-center tabular-nums sm:px-3">{lines.length} {c.qty}</span>}
      </div>
     </header>
     {!active||lines.length===0?<div className="grid min-h-0 place-content-center gap-1 px-3 text-center">
      <ChefHat className="mx-auto h-8 w-8 text-blue-200 sm:h-12 sm:w-12"/>
      <h3 className="text-sm font-black text-slate-600 sm:text-lg">{c.waiting}</h3>
      <p className="line-clamp-2 text-[11px] text-slate-500 sm:text-sm">{c.waitingHint}</p>
     </div>:<div data-testid="restaurant-visible-item-lines" aria-live="off"
      data-all-items-visible="true"
      data-item-count={lines.length}
      className="grid min-h-0 gap-1 overflow-hidden p-2 sm:gap-2 sm:p-4"
      style={{gridTemplateColumns:'repeat('+itemColumns+',minmax(0,1fr))',
       gridTemplateRows:'repeat('+itemRows+',minmax(0,1fr))'}}>
      {lines.map((line,index)=><div key={String(data?.number)+'-'+index}
       data-testid="restaurant-visible-item" className={'flex min-h-0 min-w-0 items-center gap-1 overflow-hidden rounded-xl border border-blue-100/60 bg-white/70 shadow-sm sm:gap-2 '+(denseItems?'px-1 py-0':'px-2 py-1 sm:px-3 sm:py-1.5')}>
       <span className={'shrink-0 rounded-lg bg-blue-100 text-center font-extrabold text-blue-700 '+(denseItems?'px-1 text-[10px]':'px-1.5 py-1 text-xs sm:px-2 sm:text-lg')} dir="ltr">
        ×{line.quantity}
       </span>
       {!denseItems&&<span aria-hidden="true" className="shrink-0 text-base sm:text-2xl">{restaurantDishGlyph(restaurantProductName(line,lang))}</span>}
       <strong title={restaurantProductName(line,lang)||''} className={'min-w-0 flex-1 truncate font-extrabold text-slate-950 '+(denseItems?'text-[10px] sm:text-sm':compactItems?'text-xs sm:text-base':'text-sm sm:text-xl')}>
        {restaurantProductName(line,lang)||'—'}
       </strong>
       <span dir="ltr" className={'shrink-0 whitespace-nowrap rounded-lg bg-blue-50 px-1.5 py-1 text-end font-black tabular-nums text-blue-900 '+(denseItems?'text-[9px]':'text-[11px] sm:text-lg')}>
        {money(line.line_total,currency)}
       </span>
      </div>)}
     </div>}
    </section>

    <section className="flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded-[20px] border border-cyan-400/80 bg-gradient-to-r from-[#0b2a60] via-[#124a9b] to-[#073779] px-3 py-2 text-white shadow-[0_0_14px_rgba(35,151,255,0.42)] sm:rounded-3xl sm:px-6 sm:py-4">
     <div className="min-w-0 flex-1">
      <p className="truncate text-[11px] font-bold text-blue-100 sm:text-lg">{c.amount}</p>
      <p dir="ltr" data-testid="restaurant-order-total" className="truncate text-[clamp(1.4rem,4.2vmin,4.5rem)] font-black leading-tight tabular-nums tracking-tight text-white">
       {active?money(data.net_total,currency):'—'}
      </p>
     </div>
     <div className={'flex max-w-[47%] shrink-0 items-center gap-1.5 rounded-xl px-2 py-2 text-[11px] font-black sm:rounded-2xl sm:px-5 sm:py-3 sm:text-lg '+(active&&data?.status==='paid'?'bg-emerald-600 text-white shadow-[0_0_12px_rgba(30,212,119,0.45)]':'bg-amber-100 text-amber-950')}>
      {active&&data?.status==='paid'?<PackageCheck className="h-4 w-4 shrink-0 sm:h-6 sm:w-6"/>:<ReceiptText className="h-4 w-4 shrink-0 sm:h-6 sm:w-6"/>}
      <span className="line-clamp-2">{active?(data?.status==='paid'?c.paid:c.unpaid):c.waiting}</span>
     </div>
    </section>
   </div>}

   <footer className="flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded-xl border border-blue-200/40 bg-white/90 px-2 py-1.5 text-[9px] font-semibold text-slate-600 sm:rounded-2xl sm:px-4 sm:py-2 sm:text-sm">
    <span className="flex min-w-0 items-center gap-1 truncate">
     <ShieldCheck aria-hidden="true" className="h-3 w-3 shrink-0 text-blue-600 sm:h-4 sm:w-4"/>
     <span className="truncate">{c.privacy}</span>
    </span>
    {lastSync>0&&<span className="flex shrink-0 items-center gap-1 whitespace-nowrap" data-testid="restaurant-last-sync">
     <RefreshCw aria-hidden="true" className="h-3 w-3 sm:h-4 sm:w-4"/>
     {c.updated}: {new Date(lastSync).toLocaleTimeString(lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-US')}
    </span>}
   </footer>
  </div>
 </main>;
}
