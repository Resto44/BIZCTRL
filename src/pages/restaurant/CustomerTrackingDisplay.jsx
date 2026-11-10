import React,{useEffect,useMemo,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {createClient} from '@supabase/supabase-js';
import {
  ChefHat,Monitor,Wifi,WifiOff,RefreshCw,Maximize2,Minimize2,
  Clock3,CheckCircle2,ShieldCheck
} from 'lucide-react';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from '@/api/supabaseClient';
import {restaurantRpc} from '@/lib/restaurantPOS';
import {subscribeCashierBroadcast} from '@/lib/cashierBroadcast';
import {useLanguage} from '@/lib/LanguageContext';

const L={
  en:{
    title:'Follow your order',subtitle:'Live updates from our kitchen',
    queued:'Order received',preparing:'Being prepared',ready:'Ready for pickup',
    noOrders:'No orders in this stage',invalid:'This display link has expired or been replaced. Ask staff to pair the customer TV again.',
    offline:'Connection interrupted · waiting for an update',sync:'Live from Kitchen',stale:'Updating connection',
    updated:'Updated',more:'More orders are being prepared',number:'ORDER',screen:'Customer order tracking',
    tv:'Full screen',leave:'Exit full screen',privacy:'Only order numbers are shown. Customer and payment information stays private.',
    wait:'Waiting for new orders',refresh:'Refresh',expires:'This link expires automatically after 8 hours',
  },
  fa:{
    title:'سفارش خود را تعقیب کنید',subtitle:'وضعیت زنده از داخل مطبخ',
    queued:'سفارش دریافت شد',preparing:'در حال آماده‌سازی',ready:'آمادهٔ تحویل',
    noOrders:'در این مرحله سفارشی نیست',invalid:'لینک تلویزیون منقضی یا تبدیل شده؛ از مسئول شعبه لینک تازه بگیرید.',
    offline:'ارتباط قطع است · در انتظار تازه‌سازی',sync:'وصل به مطبخ',stale:'در حال تازه‌سازی',
    updated:'آخرین آپدیت',more:'سفارش‌های بیشتر هم موجود است',number:'سفارش نمبر',screen:'تعقیب سفارش مشتری',
    tv:'تمام صفحه',leave:'خروج از تمام صفحه',privacy:'فقط نمبر سفارش دیده می‌شود؛ معلومات مشتری و پرداخت خصوصی می‌ماند.',
    wait:'در انتظار سفارش جدید',refresh:'تازه‌سازی',expires:'لینک بعد از ۸ ساعت خودکار منقضی می‌شود',
  },
  ar:{
    title:'تابع طلبك',subtitle:'تحديثات مباشرة من المطبخ',
    queued:'تم استلام الطلب',preparing:'جاري التحضير',ready:'جاهز للاستلام',
    noOrders:'لا توجد طلبات في هذه المرحلة',invalid:'انتهت صلاحية رابط الشاشة أو تم تغييره. اطلب رابطاً جديداً من مسؤول الفرع.',
    offline:'انقطع الاتصال · بانتظار التحديث',sync:'متصل بالمطبخ',stale:'جارٍ إعادة الاتصال',
    updated:'آخر تحديث',more:'توجد طلبات أخرى قيد التجهيز',number:'رقم الطلب',screen:'متابعة طلبات العملاء',
    tv:'ملء الشاشة',leave:'الخروج من ملء الشاشة',privacy:'تظهر أرقام الطلبات فقط. بيانات العملاء والدفع تبقى خاصة.',
    wait:'بانتظار الطلبات الجديدة',refresh:'تحديث',expires:'تنتهي صلاحية الرابط تلقائياً بعد ٨ ساعات',
  }
};
const STAGES=['queued','preparing','ready'];
const stageTheme={
  queued:{title:'text-amber-200',border:'border-amber-500/45',badge:'bg-amber-400 text-slate-950',card:'border-amber-400/25 bg-amber-400/10'},
  preparing:{title:'text-sky-200',border:'border-sky-400/45',badge:'bg-sky-400 text-slate-950',card:'border-sky-400/25 bg-sky-400/10'},
  ready:{title:'text-emerald-200',border:'border-emerald-400/45',badge:'bg-emerald-400 text-slate-950',card:'border-emerald-400/25 bg-emerald-400/10'},
};
const tokenValid=token=>/^[a-f0-9]{64}$/.test(token);
export const trackingGroup=(orders)=>{
  const input=Array.isArray(orders)?orders:[];
  return Object.fromEntries(STAGES.map(stage=>[stage,
    input.filter(row=>row.stage===stage&&row.number!=null)
      .sort((a,b)=>String(a.submitted_at||'').localeCompare(String(b.submitted_at||''))||Number(a.number)-Number(b.number))
  ]));
};

export default function CustomerTrackingDisplay(){
  const {hash}=useLocation();
  const token=hash.slice(1);
  const valid=tokenValid(token);
  const {lang:localLang}=useLanguage();
  const [data,setData]=useState(null);
  const lang=['en','ar','fa'].includes(data?.kitchen_language)?data.kitchen_language:localLang;
  const t=L[lang]||L.en;
  // Crucial: kiosk never uses a customer's or Owner's authenticated session.
  const client=useMemo(()=>createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,
      storageKey:'bizctrl-restaurant-customer-tracking'}
  }),[]);
  const [lastSync,setLastSync]=useState(0);
  const [now,setNow]=useState(Date.now());
  const [forbidden,setForbidden]=useState(false);
  const [tv,setTv]=useState(false);
  const [busy,setBusy]=useState(false);
  const area=useRef(null);
  const refreshRef=useRef(null);
  const online=typeof navigator==='undefined'||navigator.onLine!==false;
  const fresh=Boolean(valid&&!forbidden&&online&&lastSync&&now-lastSync<14000);
  const grouped=useMemo(()=>trackingGroup(data?.orders),[data?.orders]);
  const knownCounts=data?.counts||{};
  const total=STAGES.reduce((sum,stage)=>sum+Number(knownCounts[stage]||0),0);

  useEffect(()=>{
    setData(null);setLastSync(0);setForbidden(false);
    if(!valid)return;
    let closed=false,inFlight=false;
    const refresh=async()=>{
      if(closed||inFlight)return;
      inFlight=true;setBusy(true);
      try{
        const result=await restaurantRpc('customer_tracking_display',{p_token:token},client);
        if(closed)return;
        if(!result||!Array.isArray(result.orders)||typeof result.counts!=='object')
          throw new Error('Malformed tracking response');
        setData(result);setForbidden(false);setLastSync(Date.now());setNow(Date.now());
      }catch(e){
        if(closed)return;
        if(e?.code==='42501'){
          setData(null);setForbidden(true);setLastSync(0);
        }else setLastSync(0); // Never display stale numbers as live.
      }finally{inFlight=false;if(!closed)setBusy(false);}
    };
    refreshRef.current=refresh;
    void refresh();
    const timer=setInterval(()=>void refresh(),5000);
    const tick=setInterval(()=>setNow(Date.now()),1000);
    const onlineFn=()=>void refresh();
    const offlineFn=()=>setLastSync(0);
    const visibleFn=()=>{if(document.visibilityState==='visible')void refresh();};
    window.addEventListener('online',onlineFn);
    window.addEventListener('offline',offlineFn);
    document.addEventListener('visibilitychange',visibleFn);
    return()=>{
      closed=true;refreshRef.current=null;clearInterval(timer);clearInterval(tick);
      window.removeEventListener('online',onlineFn);
      window.removeEventListener('offline',offlineFn);
      document.removeEventListener('visibilitychange',visibleFn);
    };
  },[client,token,valid]);

  useEffect(()=>{
    if(!data?.topic||!valid)return;
    let timer;
    const stop=subscribeCashierBroadcast(client,'customer-tracking:'+data.topic,event=>{
      if(event==='changed'||event==='SUBSCRIBED'){
        clearTimeout(timer);
        timer=setTimeout(()=>void refreshRef.current?.(),120);
      }
    });
    return()=>{clearTimeout(timer);stop();};
  },[client,data?.topic,valid]);

  useEffect(()=>{
    const event=()=>{if(!document.fullscreenElement)setTv(false);};
    const escape=e=>{if(e.key==='Escape')setTv(false);};
    document.addEventListener('fullscreenchange',event);
    window.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('fullscreenchange',event);window.removeEventListener('keydown',escape);};
  },[]);
  const toggle=async()=>{
    if(tv){
      setTv(false);
      if(document.fullscreenElement&&document.exitFullscreen)await document.exitFullscreen().catch(()=>{});
    }else{
      setTv(true);
      if(area.current?.requestFullscreen)await area.current.requestFullscreen().catch(()=>{});
    }
  };

  return <main ref={area} dir={lang==='en'?'ltr':'rtl'} data-testid="customer-tracking-tv"
    className={'overflow-auto bg-slate-950 p-4 text-white sm:p-6 lg:p-8 '+
      (tv?'fixed inset-0 z-[120] h-dvh':'min-h-dvh')}>
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
      <div className="flex items-center gap-3">
        <span className="rounded-2xl bg-blue-600 p-3"><ChefHat className="h-9 w-9"/></span>
        <div className="min-w-0"><p className="text-xs font-black tracking-wide text-cyan-300">BIZCTRL · {t.screen}</p>
          <h1 className="text-2xl font-black sm:text-4xl">{data?.business_name||t.title}</h1>
          <p className="text-sm font-semibold text-slate-300 sm:text-lg">{data?.branch_name||t.subtitle}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="customer-tracking-live" className={'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold '+(fresh?'bg-emerald-900 text-emerald-100':'bg-amber-950 text-amber-100')}>
          {fresh?<Wifi className="h-5 w-5"/>:<WifiOff className="h-5 w-5"/>}{fresh?t.sync:t.stale}
        </span>
        <button type="button" disabled={!valid||forbidden} aria-label={t.refresh}
          onClick={()=>void refreshRef.current?.()} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/30 px-3 text-sm font-bold disabled:opacity-40">
          <RefreshCw className={'h-5 w-5 '+(busy?'animate-spin':'')}/>{t.refresh}</button>
        <button type="button" data-testid="customer-tracking-fullscreen" onClick={()=>void toggle()}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-bold">
          {tv?<Minimize2 className="h-5 w-5"/>:<Maximize2 className="h-5 w-5"/>}{tv?t.leave:t.tv}</button>
      </div>
    </header>
    {(!valid||forbidden)?<div role="alert" className="rounded-3xl border border-rose-500/50 bg-rose-900/30 px-6 py-16 text-center text-xl font-bold text-rose-100">
      <Monitor className="mx-auto mb-5 h-12 w-12"/>{t.invalid}
    </div>:!fresh?<div role="status" className="rounded-3xl border border-amber-400/40 bg-amber-950/30 px-6 py-16 text-center text-2xl font-bold text-amber-100">
      <WifiOff className="mx-auto mb-4 h-12 w-12"/>{t.offline}
    </div>:<>
      <p className="mb-5 text-center text-lg font-bold text-cyan-200 sm:text-2xl">{t.title}</p>
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
        {STAGES.map(stage=><section key={stage} data-testid={'customer-tracking-'+stage}
          className={'min-w-0 rounded-3xl border p-4 sm:p-5 '+stageTheme[stage].border}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className={'text-xl font-black sm:text-2xl xl:text-3xl '+stageTheme[stage].title}>{t[stage]}</h2>
            <span className={'rounded-xl px-3 py-1.5 text-xl font-black '+stageTheme[stage].badge}>{knownCounts[stage]??0}</span>
          </div>
          <div className="grid max-h-[64dvh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {grouped[stage].map((order,i)=><div key={stage+':'+order.number} data-testid="customer-tracking-ticket"
              className={'rounded-2xl border px-2 py-5 text-center '+stageTheme[stage].card}>
              <p className="text-xs font-bold text-slate-300">{t.number}</p>
              <p dir="ltr" className="mt-1 break-all text-3xl font-black tabular-nums sm:text-4xl xl:text-5xl">#{order.number}</p>
            </div>)}
          </div>
          {!grouped[stage].length&&<p className="py-10 text-center text-sm text-slate-400">{t.noOrders}</p>}
        </section>)}
      </div>
      {total===0&&<p className="mt-5 text-center text-lg font-bold text-slate-300">{t.wait}</p>}
      {Number(data?.overflow)>0&&<p role="status" className="mt-5 rounded-xl border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-center text-amber-100">{t.more}: {data.overflow}</p>}
    </>}
    <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs font-semibold text-slate-400">
      <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4"/>{t.privacy}</span>
      <span>{t.expires}</span>
      {fresh&&<span>{t.updated}: {new Date(lastSync).toLocaleTimeString(lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-US')}</span>}
    </footer>
  </main>;
}
