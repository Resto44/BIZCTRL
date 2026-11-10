import React, {useEffect,useMemo,useRef,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {
  ChefHat, Clock3, Maximize2, Minimize2, RefreshCw, Volume2, VolumeX,
  Wifi, WifiOff, Check, AlertTriangle, MonitorPlay, UtensilsCrossed, Link2, Copy, ExternalLink,
} from 'lucide-react';
import {useTenant} from '@/lib/TenantContext';
import {useRole} from '@/lib/RoleContext';
import {useLanguage} from '@/lib/LanguageContext';
import {supabase} from '@/api/supabaseClient';
import {subscribeCashierBroadcast} from '@/lib/cashierBroadcast';
import {
  isRestaurantPOSPortal,restaurantRpc,restaurantProductName,kitchenNextState,
} from '@/lib/restaurantPOS';

const WORDS={
  en:{
    title:'Kitchen Display',subtitle:'Live orders from Restaurant POS',
    all:'All stations',branch:'Branch',station:'Station',live:'Live',offline:'Disconnected',
    synced:'Last synchronized',refresh:'Refresh',tv:'TV mode',leave:'Exit TV mode',
    sound:'Sound on',muted:'Sound off',incoming:'New orders',making:'Preparing',ready:'Ready for pickup',
    queued:'New',preparing:'Preparing',readyState:'Ready',served:'Handed over',
    start:'Start cooking',finish:'Mark ready',handover:'Hand over',
    unpaid:'Payment pending',paid:'Paid',serviceHint:'Payment required before handover',
    empty:'No active orders in this column',noOrders:'No kitchen tickets yet',
    tooMany:'More active tickets exist. Clear completed tickets to show the rest.',
    stale:'Connection is stale. Status updates are disabled until the board refreshes.',
    failed:'Kitchen data could not be loaded. Retry. Existing tickets remain unchanged.',
    restaurantOnly:'Kitchen Display is for restaurant and café workspaces only.',
    choose:'Choose an authorized branch to start the kitchen screen.',
    dine_in:'Dine-in',takeaway:'Takeaway',delivery:'Delivery',
    age:'Elapsed',minutes:'min',orders:'Active tickets',unit:'×',
    error:'Order changed or the connection failed. The kitchen board has been refreshed.',
    stationOnly:'Select All stations to advance an order that has items for several stations.',
    languageSync:'Customer screens could not sync the Kitchen Display language. Retry by changing the language.',
    languageLabel:'Kitchen & customer screen language',languageSaving:'Saving language…',
    customerTv:'Customer Order Tracking TV',customerHelp:'Independent 8-hour pickup screen, showing only ticket numbers and stages. New pairing replaces the previous link; no cashier shift needed.',
    pairTv:'Create customer TV link',revokeTv:'Revoke link',openTv:'Open TV',copyTv:'Copy link',copiedTv:'Copied',
  },
  fa:{
    title:'نمایشگر مطبخ',subtitle:'سفارش‌های زنده از POS رستورانت',
    all:'تمام بخش‌ها',branch:'شعبه',station:'بخش آماده‌سازی',live:'وصل',offline:'قطع ارتباط',
    synced:'آخرین همگام‌سازی',refresh:'تازه‌سازی',tv:'حالت تلویزیون',leave:'خروج از تلویزیون',
    sound:'صدا روشن',muted:'صدا خاموش',incoming:'سفارش‌های جدید',making:'در حال آماده‌سازی',ready:'آمادهٔ تحویل',
    queued:'جدید',preparing:'آماده‌سازی',readyState:'آماده',served:'تحویل شد',
    start:'شروع پخت',finish:'آماده شد',handover:'تحویل سفارش',
    unpaid:'پرداخت نشده',paid:'پرداخت شده',serviceHint:'قبل از تحویل، پرداخت باید ثبت شود',
    empty:'در این بخش سفارشی نیست',noOrders:'هنوز سفارش به مطبخ نرسیده',
    tooMany:'سفارش‌های بیشتری موجود است؛ سفارش‌های آماده را تحویل بدهید تا باقی ظاهر شوند.',
    stale:'ارتباط تازه نیست؛ تغییر وضعیت تا همگام‌سازی مجدد غیرفعال است.',
    failed:'بارگذاری سفارش‌های مطبخ ناموفق شد. دوباره تلاش کنید؛ ریکوردها تغییر نکرده‌اند.',
    restaurantOnly:'پورتل مطبخ فقط برای رستورانت و کافه فعال است.',
    choose:'برای شروع نمایش مطبخ یک شعبهٔ مجاز انتخاب کنید.',
    dine_in:'داخل رستورانت',takeaway:'بیرون‌بر',delivery:'دلیوری',
    age:'مدت انتظار',minutes:'دقیقه',orders:'سفارش فعال',unit:'×',
    error:'سفارش تغییر کرده یا اتصال قطع شده است؛ فهرست مطبخ تازه‌سازی شد.',
    stationOnly:'این سفارش مربوط چند بخش است؛ برای تغییر وضعیت تمام بخش‌ها را انتخاب کنید.',
    languageSync:'زبان نمایشگر مشتری با مطبخ همگام نشد؛ لطفاً دوباره زبان را تغییر دهید.',
    languageLabel:'زبان مطبخ و نمایشگر مشتری',languageSaving:'ذخیرهٔ زبان…',
    customerTv:'تلویزیون تعقیب سفارش مشتری',customerHelp:'لینک مستقل ۸ساعته؛ فقط نمبر و وضعیت سفارش نشان داده می‌شود. ساخت لینک تازه، لینک قبلی را باطل می‌کند؛ به شیفت کاشیر نیاز ندارد.',
    pairTv:'ساخت لینک تلویزیون مشتری',revokeTv:'باطل‌کردن لینک',openTv:'بازکردن تلویزیون',copyTv:'کاپی لینک',copiedTv:'کاپی شد',
  },
  ar:{
    title:'شاشة المطبخ',subtitle:'الطلبات المباشرة من كاشير المطعم',
    all:'كل المحطات',branch:'الفرع',station:'محطة التحضير',live:'متصل',offline:'غير متصل',
    synced:'آخر تحديث',refresh:'تحديث',tv:'وضع التلفزيون',leave:'الخروج من وضع التلفزيون',
    sound:'الصوت يعمل',muted:'الصوت مغلق',incoming:'طلبات جديدة',making:'قيد التحضير',ready:'جاهز للاستلام',
    queued:'جديد',preparing:'قيد التحضير',readyState:'جاهز',served:'تم التسليم',
    start:'بدء التحضير',finish:'جاهز',handover:'تسليم الطلب',
    unpaid:'بانتظار الدفع',paid:'تم الدفع',serviceHint:'يجب تسجيل الدفع قبل التسليم',
    empty:'لا توجد طلبات في هذه المرحلة',noOrders:'لا توجد طلبات مطبخ حتى الآن',
    tooMany:'هناك طلبات إضافية. أنجز الطلبات الظاهرة لعرض البقية.',
    stale:'الاتصال غير محدث. تم إيقاف تغيير الحالة إلى حين استعادة الاتصال.',
    failed:'تعذر تحميل طلبات المطبخ. أعد المحاولة؛ لم تتغير أي بيانات.',
    restaurantOnly:'شاشة المطبخ متاحة للمطاعم والمقاهي فقط.',
    choose:'اختر الفرع المصرح لك به لفتح شاشة المطبخ.',
    dine_in:'محلي',takeaway:'سفري',delivery:'توصيل',
    age:'مدة الانتظار',minutes:'دقيقة',orders:'طلب نشط',unit:'×',
    error:'تغير الطلب أو انقطع الاتصال؛ تم تحديث لوحة المطبخ.',
    stationOnly:'الطلب يحتوي أصنافاً من عدة محطات؛ اختر كل المحطات لتغيير حالته.',
    languageSync:'تعذرت مزامنة لغة شاشة العملاء مع المطبخ. غيّر اللغة مرة أخرى.',
    languageLabel:'لغة المطبخ وشاشة العملاء',languageSaving:'جارٍ حفظ اللغة…',
    customerTv:'شاشة متابعة طلبات العملاء',customerHelp:'رابط مستقل صالح ٨ ساعات يعرض أرقام الطلبات ومراحلها فقط. إنشاء رابط جديد يبطل القديم ولا يتطلب وردية كاشير.',
    pairTv:'إنشاء رابط شاشة العملاء',revokeTv:'إلغاء الرابط',openTv:'فتح الشاشة',copyTv:'نسخ الرابط',copiedTv:'تم النسخ',
  },
};
const STAGES=['queued','preparing','ready'];
const tone={
  queued:{bg:'border-amber-400/45 bg-amber-400/10',badge:'bg-amber-400 text-slate-950',title:'text-amber-300'},
  preparing:{bg:'border-sky-400/45 bg-sky-400/10',badge:'bg-sky-400 text-slate-950',title:'text-sky-300'},
  ready:{bg:'border-emerald-400/45 bg-emerald-400/10',badge:'bg-emerald-400 text-slate-950',title:'text-emerald-300'},
};
export const kitchenMinutes=(submittedAt,now=Date.now())=>{
  const ms=Date.parse(submittedAt||'');
  return Number.isFinite(ms)?Math.max(0,Math.floor((now-ms)/60000)):null;
};
export const kitchenUrgency=minutes=>minutes==null?'normal':minutes>=20?'late':minutes>=10?'warning':'normal';
export const kitchenCanAdvance=(order,fresh,busy)=>Boolean(fresh&&!busy&&kitchenNextState(order?.kitchen_status)&&
  !(order?.kitchen_status==='ready'&&order?.status!=='paid'));
export const kitchenGroupOrders=(orders,station='')=>{
  const visible=(Array.isArray(orders)?orders:[]).filter(o=>!station||
    (Array.isArray(o.lines)&&o.lines.some(l=>l.station===station)));
  return Object.fromEntries(STAGES.map(stage=>[stage,visible.filter(o=>o.kitchen_status===stage)
    .sort((a,b)=>String(a.submitted_at||'').localeCompare(String(b.submitted_at||''))||String(a.id).localeCompare(String(b.id)))]));
};

function useKitchenLive(restaurantId,branchId,enabled){
  const q=useQuery({
    queryKey:['restaurant-kds',restaurantId,branchId],
    queryFn:()=>restaurantRpc('pos_kitchen_board',{p_restaurant_id:restaurantId,p_branch_id:branchId}),
    enabled:Boolean(enabled&&restaurantId&&branchId),
    staleTime:1500,refetchInterval:enabled?5000:false,refetchOnWindowFocus:true,retry:1,
  });
  const refreshRef=useRef(q.refetch);
  refreshRef.current=q.refetch;
  useEffect(()=>{
    if(!enabled||!restaurantId||!branchId)return;
    let timer;
    const notify=()=>{
      clearTimeout(timer);
      timer=setTimeout(()=>void refreshRef.current(),150);
    };
    const off=subscribeCashierBroadcast(supabase,'restaurant-pos:'+restaurantId,
      event=>{if(event==='changed'||event==='SUBSCRIBED')notify();});
    const onReconnect=()=>notify();
    const onVisibility=()=>{if(document.visibilityState==='visible')notify();};
    window.addEventListener('online',onReconnect);
    document.addEventListener('visibilitychange',onVisibility);
    return()=>{off();clearTimeout(timer);window.removeEventListener('online',onReconnect);
      document.removeEventListener('visibilitychange',onVisibility);};
  },[enabled,restaurantId,branchId]);
  return q;
}

function Ticket({order,stage,station,lang,t,now,advance,pending,fresh}){
  const elapsed=kitchenMinutes(order.submitted_at,now);
  const urgency=kitchenUrgency(elapsed);
  const done=stage==='ready'&&order.status!=='paid';
  const differentStations=new Set((order.lines||[]).map(l=>l.station||'Kitchen')).size>1;
  const stationBlocked=Boolean(station&&differentStations);
  const can=kitchenCanAdvance(order,fresh,Boolean(pending))&&!stationBlocked;
  return <article data-testid="kds-ticket" data-stage={stage} className={'rounded-2xl border p-4 shadow-lg '+tone[stage].bg}>
    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
      <div><strong className="text-3xl font-black tracking-tight">#{order.number}</strong>
        <p className="text-sm text-slate-300">{t[order.order_type]||order.order_type}
          {order.table_label?' · '+order.table_label:''}</p></div>
      <div className={'flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-black '+
        (urgency==='late'?'bg-red-500 text-white':urgency==='warning'?'bg-amber-300 text-slate-950':'bg-slate-800 text-slate-100')}>
        <Clock3 className="h-4 w-4"/>{elapsed==null?'—':elapsed+' '+t.minutes}
      </div>
    </div>
    <p className="mb-3 text-xs text-slate-400">{order.device_code||'POS'}</p>
    <div className="space-y-2 border-t border-white/10 pt-3">
      {(order.lines||[]).filter(line=>!station||line.station===station).map((line,i)=><div key={i} className="flex items-start gap-3 text-lg leading-snug">
        <strong className="min-w-12 shrink-0 text-right font-black text-cyan-300" dir="ltr">{line.quantity} {t.unit}</strong>
        <span className="font-bold">{restaurantProductName(line,lang)||line.name||'—'}</span>
      </div>)}
    </div>
    {order.notes&&<p className="mt-3 rounded-xl border border-amber-300/40 bg-amber-200/10 px-3 py-2 text-base font-semibold text-amber-100">{order.notes}</p>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <span className={'rounded-lg px-2 py-1 text-xs font-bold '+(order.status==='paid'?'bg-emerald-900 text-emerald-200':'bg-rose-950 text-rose-200')}>
        {order.status==='paid'?t.paid:t.unpaid}
      </span>
      {done&&<span className="text-xs font-semibold text-amber-200">{t.serviceHint}</span>}
    </div>
    {stationBlocked&&<p className="mt-3 text-xs font-bold text-amber-200">{t.stationOnly}</p>}
    <button type="button" data-testid="kds-advance" onClick={()=>advance(order)}
      disabled={!can} className={'mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-3 text-base font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-45 '+tone[stage].badge}>
      {pending?<RefreshCw className="h-5 w-5 animate-spin"/>:<Check className="h-5 w-5"/>}
      {stage==='queued'?t.start:stage==='preparing'?t.finish:t.handover}
    </button>
  </article>;
}

export default function KitchenDisplayERP(){
  const {activeRestaurant,branches=[]}=useTenant();
  const {can,role}=useRole();
  const {lang:appLang,setLang}=useLanguage();
  const [params,setParams]=useSearchParams();
  const validPortal=isRestaurantPOSPortal(activeRestaurant);
  const id=activeRestaurant?.id;
  const requested=params.get('branch')||'';
  const selected=branches.find(b=>String(b.id)===requested)||branches[0]||null;
  const branchId=selected?.id||null;
  const allowed=Boolean(validPortal&&can.viewOrders);
  const [screenLangOverride,setScreenLangOverride]=useState(null);
  const [languageSyncError,setLanguageSyncError]=useState('');
  const [languageSaving,setLanguageSaving]=useState(false);
  const initializingLanguage=useRef(new Set());
  const lastAppLang=useRef(appLang);
  const languagePreference=useQuery({
    queryKey:['restaurant-kds-display-language',id,branchId],
    queryFn:()=>restaurantRpc('kitchen_screen_language_get',{
      p_restaurant_id:id,p_branch_id:branchId,
    }),
    enabled:Boolean(allowed&&id&&branchId),
    staleTime:10000,refetchInterval:20000,retry:1,
  });
  const languageFromDB=languagePreference.data?.language;
  const lang=(screenLangOverride?.branchId===branchId?screenLangOverride.lang:null)
     || (['en','ar','fa'].includes(languageFromDB)?languageFromDB:appLang);
  const t=WORDS[lang]||WORDS.en;
  const changeKitchenLanguage=async(next)=>{
    if(!allowed||!id||!branchId||!['en','ar','fa'].includes(next))return;
    const previous=lang;
    setLanguageSyncError('');setLanguageSaving(true);
    lastAppLang.current=next;
    setScreenLangOverride({branchId,lang:next});
    try{
      await restaurantRpc('kitchen_screen_language',{
        p_restaurant_id:id,p_branch_id:branchId,p_language:next,
      });
      setLang?.(next);
      await languagePreference.refetch();
      setScreenLangOverride(current=>current?.branchId===branchId&&current.lang===next?null:current);
    }catch{
      setScreenLangOverride({branchId,lang:previous});
      setLanguageSyncError('failed');
    }finally{setLanguageSaving(false);}
  };
  // Persist a never-configured branch once, without changing other TVs'
  // saved language on subsequent page openings or refreshes.
  useEffect(()=>{
    if(!allowed||!id||!branchId||!languagePreference.isSuccess)return;
    if(languagePreference.data?.configured)return;
    const scope=String(id)+':'+String(branchId);
    if(initializingLanguage.current.has(scope))return;
    initializingLanguage.current.add(scope);
    void changeKitchenLanguage(appLang);
  },[allowed,id,branchId,languagePreference.isSuccess,languagePreference.data?.configured]);
  // A deliberate header language change while KDS is open also syncs the branch.
  useEffect(()=>{
    const changed=lastAppLang.current!==appLang;
    lastAppLang.current=appLang;
    if(changed&&allowed&&languagePreference.isSuccess)
      void changeKitchenLanguage(appLang);
  },[appLang,allowed,languagePreference.isSuccess,id,branchId]);
  const q=useKitchenLive(id,branchId,allowed);
  const [station,setStation]=useState('');
  const [tv,setTv]=useState(false);
  const [sound,setSound]=useState(false);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [customerTvLink,setCustomerTvLink]=useState('');
  const [customerTvBusy,setCustomerTvBusy]=useState(false);
  const [customerTvCopied,setCustomerTvCopied]=useState(false);
  const canPairCustomerTv=(role==='owner'||role==='manager')&&can.viewOrders;
  const [now,setNow]=useState(Date.now());
  const boardRef=useRef(null);
  const soundRef=useRef(false);
  const seenRef=useRef(null);
  const pendingRef=useRef(false);
  const prevScope=useRef('');
  const currentScope=String(id||'')+':'+String(branchId||'');
  const data=q.data;
  const orders=Array.isArray(data?.orders)?data.orders:[];
  const stations=useMemo(()=>[...new Set(orders.flatMap(o=>(o.lines||[]).map(l=>l.station).filter(Boolean)))].sort(),[orders]);
  const groups=useMemo(()=>kitchenGroupOrders(orders,station),[orders,station]);
  const online=typeof navigator==='undefined'||navigator.onLine!==false;
  const fresh=Boolean(online&&!q.isError&&!q.isPending&&q.dataUpdatedAt&&now-q.dataUpdatedAt<15000);
  const counts=STAGES.map(stage=>groups[stage].length);

  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{if(!stations.includes(station))setStation('');},[stations,station]);
  useEffect(()=>{
    if(prevScope.current!==currentScope){
      prevScope.current=currentScope;seenRef.current=null;setError('');setStation('');setCustomerTvLink('');setCustomerTvCopied(false);
    }
  },[currentScope]);
  useEffect(()=>{
    if(!fresh)return;
    const next=new Set(orders.filter(o=>o.kitchen_status==='queued').map(o=>o.id));
    if(seenRef.current&&soundRef.current&&[...next].some(id=>!seenRef.current.has(id))){
      try{
        const AudioCtor=window.AudioContext||window.webkitAudioContext;
        if(AudioCtor){
          const ctx=new AudioCtor(),osc=ctx.createOscillator(),gain=ctx.createGain();
          osc.frequency.value=880;gain.gain.value=.045;
          osc.connect(gain);gain.connect(ctx.destination);
          osc.start();osc.stop(ctx.currentTime+.18);
          osc.onended=()=>void ctx.close();
        }
      }catch{/* visual state still updates when sound is blocked */}
    }
    seenRef.current=next;
  },[orders,fresh]);
  useEffect(()=>{soundRef.current=sound;},[sound]);
  useEffect(()=>{
    const onFullScreen=()=>{if(!document.fullscreenElement)setTv(false);};
    const escape=event=>{if(event.key==='Escape')setTv(false);};
    document.addEventListener('fullscreenchange',onFullScreen);
    window.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('fullscreenchange',onFullScreen);window.removeEventListener('keydown',escape);};
  },[]);
  const toggleTv=async()=>{
    if(tv){
      setTv(false);
      if(document.fullscreenElement&&document.exitFullscreen)await document.exitFullscreen().catch(()=>{});
    }else{
      setTv(true);
      if(boardRef.current?.requestFullscreen)await boardRef.current.requestFullscreen().catch(()=>{});
    }
  };
  const advance=async order=>{
    if(!kitchenCanAdvance(order,fresh,pendingRef.current)||!id||!branchId ||
      (station&&new Set((order.lines||[]).map(l=>l.station||'Kitchen')).size>1))return;
    const next=kitchenNextState(order.kitchen_status);
    if(!next)return;
    pendingRef.current=true;setBusy(order.id);setError('');
    try{
      await restaurantRpc('pos_kitchen',{p_order_id:order.id,p_revision:order.revision,p_status:next});
    }catch(err){
      setError((err?.message||'')+' · '+t.error);
    }finally{
      await q.refetch();
      pendingRef.current=false;setBusy('');
    }
  };
  const manageCustomerTv=async(action)=>{
    if(!canPairCustomerTv||!id||!branchId||customerTvBusy)return;
    setCustomerTvBusy(true);setError('');
    try{
      const result=await restaurantRpc('customer_tracking_manage',{
        p_restaurant_id:id,p_branch_id:branchId,p_action:action,
      });
      setCustomerTvLink(action==='pair'&&result?.token?
        window.location.origin+'/restaurant/customer-tracking#'+result.token:'');
      setCustomerTvCopied(false);
    }catch(e){setError(e?.message||t.failed);}finally{setCustomerTvBusy(false);}
  };
  if(!validPortal)return <div role="alert" className="rounded-xl bg-amber-50 p-5 text-amber-800">{t.restaurantOnly}</div>;
  if(!can.viewOrders)return <div role="alert" className="rounded-xl bg-red-50 p-5 text-red-800">{t.failed}</div>;
  if(!selected)return <div role="alert" className="rounded-xl bg-amber-50 p-5 text-amber-800">{t.choose}</div>;

  return <main ref={boardRef} dir={lang==='en'?'ltr':'rtl'} data-testid="kds-portal"
    className={'overflow-y-auto rounded-2xl bg-slate-950 p-3 text-white sm:p-5 '+
      (tv?'fixed inset-0 z-[110] h-dvh rounded-none sm:p-6':'min-h-[82dvh]')}>
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-blue-600 p-3"><ChefHat className="h-7 w-7"/></span>
        <div><h1 className="text-2xl font-black tracking-tight sm:text-3xl">{t.title}</h1>
          <p className="text-xs text-slate-400 sm:text-sm">{t.subtitle}</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="kds-connection" className={'flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold '+(fresh?'bg-emerald-800 text-emerald-100':'bg-rose-900 text-rose-100')}>
          {fresh?<Wifi className="h-4 w-4"/>:<WifiOff className="h-4 w-4"/>}{fresh?t.live:t.offline}</span>
        <button type="button" onClick={()=>{setSound(s=>!s);}} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-600 px-3 text-xs font-bold">
          {sound?<Volume2 className="h-4 w-4"/>:<VolumeX className="h-4 w-4"/>}{sound?t.sound:t.muted}
        </button>
        <button type="button" onClick={()=>void q.refetch()} aria-label={t.refresh} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-600 px-3 text-sm font-bold">
          <RefreshCw className={'h-4 w-4 '+(q.isFetching?'animate-spin':'')}/>{t.refresh}</button>
        <button type="button" data-testid="kds-tv-toggle" onClick={()=>void toggleTv()} className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-black">
          {tv?<Minimize2 className="h-4 w-4"/>:<Maximize2 className="h-4 w-4"/>}{tv?t.leave:t.tv}</button>
      </div>
    </header>
    {canPairCustomerTv&&!tv&&<details data-testid="kds-customer-tv-pair" className="mb-4 rounded-2xl border border-cyan-700/60 bg-cyan-950/30 px-4 py-3">
      <summary className="cursor-pointer text-sm font-black text-cyan-200 sm:text-base"><MonitorPlay className="me-2 inline h-5 w-5"/>{t.customerTv}</summary>
      <p className="mt-2 text-xs leading-5 text-slate-300">{t.customerHelp}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" data-testid="kds-pair-customer-tv" disabled={customerTvBusy} onClick={()=>void manageCustomerTv('pair')}
          className="flex min-h-10 items-center gap-2 rounded-xl bg-cyan-600 px-3 text-xs font-bold text-white disabled:opacity-50"><Link2 className="h-4 w-4"/>{t.pairTv}</button>
        <button type="button" data-testid="kds-revoke-customer-tv" disabled={customerTvBusy} onClick={()=>void manageCustomerTv('revoke')}
          className="min-h-10 rounded-xl border border-rose-500/60 px-3 text-xs font-bold text-rose-200 disabled:opacity-50">{t.revokeTv}</button>
      </div>
      {customerTvLink&&<div className="mt-3 space-y-2">
        <input aria-label={t.customerTv} readOnly value={customerTvLink} dir="ltr"
          className="h-10 w-full rounded-lg border border-cyan-700/40 bg-slate-950 px-3 text-xs text-white"/>
        <div className="flex flex-wrap gap-2">
          <a href={customerTvLink} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white"><ExternalLink className="h-4 w-4"/>{t.openTv}</a>
          <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(customerTvLink);setCustomerTvCopied(true);}catch(e){setError(e?.message||t.failed);}}}
            className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-600 px-3 text-xs font-bold"><Copy className="h-4 w-4"/>{customerTvCopied?t.copiedTv:t.copyTv}</button>
        </div>
      </div>}
    </details>}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-bold">{t.branch}
          <select value={branchId} aria-label={t.branch} onChange={e=>{
            const p=new URLSearchParams(params);p.set('branch',e.target.value);setParams(p);
          }} className="min-h-11 max-w-52 rounded-xl border border-slate-600 bg-slate-900 px-3 text-white">
            {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="flex flex-wrap items-center gap-2 text-sm font-bold" data-testid="kds-language-control">{t.languageLabel}
          <select data-testid="kds-screen-language" value={lang} disabled={languageSaving||languagePreference.isLoading}
            aria-label={t.languageLabel} onChange={e=>void changeKitchenLanguage(e.target.value)}
            className="min-h-11 max-w-44 rounded-xl border border-cyan-500/60 bg-slate-900 px-3 font-bold text-white disabled:opacity-50">
            <option value="ar">العربية</option>
            <option value="fa">فارسی دری</option>
            <option value="en">English</option>
          </select>
          {languageSaving&&<span role="status" className="text-xs text-cyan-300">{t.languageSaving}</span>}
        </label>
        <label className="flex items-center gap-2 text-sm font-bold">{t.station}
          <select value={station} aria-label={t.station} onChange={e=>setStation(e.target.value)}
            className="min-h-11 max-w-48 rounded-xl border border-slate-600 bg-slate-900 px-3 text-white">
            <option value="">{t.all}</option>{stations.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <UtensilsCrossed className="h-4 w-4"/>
        <strong className="text-lg text-white">{data?.total_active??'—'}</strong> {t.orders}
      </div>
    </div>
    {languageSyncError&&<div role="alert" data-testid="kds-language-sync-error" className="mb-4 rounded-xl border border-amber-500/50 bg-amber-950 px-4 py-3 text-sm text-amber-100">{t.languageSync}</div>}
    {!fresh&&<div data-testid="kds-stale" role="alert" className="mb-4 flex gap-2 rounded-xl border border-rose-600 bg-rose-950 px-4 py-3 text-sm font-bold text-rose-100">
      <AlertTriangle className="h-5 w-5 shrink-0"/>{q.isError?t.failed:t.stale}
    </div>}
    {error&&<div role="alert" className="mb-4 rounded-xl border border-amber-600 bg-amber-950 px-4 py-3 text-sm text-amber-100">{error}</div>}
    {data?.overflow>0&&<div role="alert" className="mb-4 rounded-xl border border-amber-600 bg-amber-950 p-3 text-sm text-amber-100">{t.tooMany} ({data.overflow})</div>}
    <div className="grid gap-3 lg:grid-cols-3 lg:gap-4">
      {STAGES.map((stage,i)=><section key={stage} data-testid={'kds-stage-'+stage}
        className={'min-w-0 rounded-2xl border p-3 sm:p-4 '+tone[stage].bg}>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className={'text-xl font-black sm:text-2xl '+tone[stage].title}>
            {stage==='queued'?t.incoming:stage==='preparing'?t.making:t.ready}
          </h2>
          <span className={'rounded-xl px-3 py-1 text-lg font-black '+tone[stage].badge}>{counts[i]}</span>
        </div>
        <div className="max-h-[70dvh] space-y-3 overflow-y-auto pe-1 lg:max-h-[calc(100dvh-275px)]">
          {groups[stage].map(order=><Ticket key={order.id} order={order} stage={stage} station={station}
            lang={lang} t={t} now={now} advance={o=>void advance(o)} pending={busy===order.id} fresh={fresh}/>)}
          {!groups[stage].length&&<p className="rounded-xl border border-dashed border-white/20 px-3 py-10 text-center text-sm text-slate-400">{t.empty}</p>}
        </div>
      </section>)}
    </div>
    {fresh&&orders.length===0&&<p className="mt-5 flex items-center justify-center gap-2 text-center text-sm text-slate-400">
      <MonitorPlay className="h-5 w-5"/>{t.noOrders}
    </p>}
    <footer className="mt-4 text-center text-xs text-slate-500">
      {t.synced}: {q.dataUpdatedAt?new Date(q.dataUpdatedAt).toLocaleTimeString(lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-US'):'—'} · {selected.name}
    </footer>
  </main>;
}
