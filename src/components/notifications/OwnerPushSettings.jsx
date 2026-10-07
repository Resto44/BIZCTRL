import { Link } from 'react-router-dom';
import { notificationTarget } from '../../../supabase/functions/owner-push/navigation.ts';
import React, { useEffect, useState } from 'react';
import { BellRing, Smartphone } from 'lucide-react';
import { DEFAULT_PREFERENCES, renderNotification, resolveBranch } from '../../../supabase/functions/owner-push/preferences.ts';
import PushCustomization from './PushCustomization';
import { Button } from '@/components/ui/button';
import { useRole } from '@/lib/RoleContext';
import { useTenant } from '@/lib/TenantContext';
import { useLanguage } from '@/lib/LanguageContext';
import { supabase } from '@/api/supabaseClient';
import { applicationKey, currentPushSubscription, disableDevicePush, pushRequest, pushSupported } from '@/lib/ownerPush';

export default function OwnerPushSettings() {
 const {role}=useRole();
 const {activeRestaurant,allBranches}=useTenant();
 const {lang}=useLanguage();
 const rtl=['ar','fa','ps','ur'].includes(lang);
 const tr=(en,fa)=>rtl?fa:en;
 const [key,setKey]=useState(null),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[events,setEvents]=useState([]);
 const restaurantId=activeRestaurant?.id;
 const supported=pushSupported();
 useEffect(()=>{
  if(role!=='owner' || !restaurantId) return;
  let live=true;
  setEnabled(false); setEvents([]); setMessage('');
  const load=async()=>{
   const {data,error}=await supabase.from('owner_record_events').select('id,entity,action,reference,branch,created_at,context').eq('restaurant_id',restaurantId).order('created_at',{ascending:false}).limit(30);
   if(live && !error) setEvents(data || []);
  };
  load(); const timer=setInterval(load,30000);
  if(supported) {
   pushRequest('config').then(v=>{if(live)setKey(v.publicKey);}).catch(e=>{if(live)setMessage(e.message);});
   currentPushSubscription().then(async sub=>{
    if(!sub)return;
    const {data}=await supabase.from('owner_push_devices').select('id').eq('endpoint',sub.endpoint).eq('restaurant_id',restaurantId).eq('enabled',true).maybeSingle();
    if(live)setEnabled(Boolean(data));
   }).catch(()=>{});
  }
  return()=>{live=false;clearInterval(timer);};
 },[role,restaurantId,supported]);
 if(role!=='owner') return null;
 const enable=async()=>{
  setBusy(true);setMessage('');
  try {
   // Request permission directly from the click, before network/registration awaits (iOS requirement).
   const permission=await Notification.requestPermission();
   if(permission!=='granted') throw new Error(tr('Allow notifications in your device settings, then try again.','اجازهٔ اعلان را در تنظیمات دستگاه فعال کنید و دوباره تلاش کنید.'));
   await navigator.serviceWorker.register('/sw.js');
   const reg=await navigator.serviceWorker.ready;
   let sub=await reg.pushManager.getSubscription();
   if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(key)});
   await pushRequest('subscribe',{restaurantId,language:lang,subscription:sub.toJSON()});
   setEnabled(true);setMessage(tr('This device will receive new business records while BizCTRL is closed.','این دستگاه رویدادهای جدید کسب‌وکار را حتی هنگام بسته‌بودن BizCTRL دریافت می‌کند.'));
  }catch(e){setMessage(e.message);}finally{setBusy(false);}
 };
 const act=async(test,sample)=>{
  setBusy(true);setMessage('');
  try{
   if(test){const sub=await currentPushSubscription();await pushRequest('test',{restaurantId,language:lang,endpoint:sub?.endpoint,sample});setMessage(tr('Test accepted by the push service. Check your device notifications.','اعلان آزمایشی ارسال شد. اعلان‌های دستگاه را بررسی کنید.'));}
   else{await disableDevicePush();setEnabled(false);}
  }catch(e){setMessage(e.message);}finally{setBusy(false);}
 };
 return <section className="rounded-2xl border bg-card p-4 sm:p-5 space-y-4" aria-label="Background notifications">
  <div className="flex gap-3 items-start"><div className="rounded-xl bg-blue-50 p-3 text-blue-600"><BellRing className="size-5"/></div><div className="min-w-0"><h2 className="font-bold">{tr('Owner notifications on your device','اعلان‌های مالک روی موبایل و کمپیوتر')}</h2><p className="text-sm text-muted-foreground mt-1">{tr('Receive new, updated and deleted business records, even when BizCTRL is closed. Each device follows the business selected when enabled.','ثبت، تغییر و حذف رکوردهای کسب‌وکار را حتی وقتی برنامه بسته است دریافت کنید. هر دستگاه اعلان‌های کسب‌وکار انتخاب‌شده هنگام فعال‌سازی را می‌گیرد.')}</p></div></div>
  <div className="rounded-xl bg-muted/50 p-3 text-sm flex gap-2"><Smartphone className="size-5 shrink-0"/><p>{tr('iPhone / iPad: Safari → Share → Add to Home Screen. Open BizCTRL from its icon, then enable notifications here (iOS 16.4+). Delivery depends on internet and device notification settings.','آیفون / آیپد: در Safari گزینهٔ Share سپس Add to Home Screen را انتخاب کنید. برنامه را از آیکون آن باز کرده و اعلان را اینجا فعال کنید (iOS 16.4 یا جدیدتر). دریافت اعلان به اینترنت و تنظیمات دستگاه بستگی دارد.')}</p></div>
  <p className="text-sm">{enabled?tr('● Enabled on this device','● در این دستگاه فعال است'):tr('Not enabled on this device','در این دستگاه فعال نیست')}</p>
  <div className="flex flex-wrap gap-2">{enabled?<><Button disabled={busy} onClick={()=>act(true)}>{tr('Send test notification','ارسال اعلان آزمایشی')}</Button><Button variant="outline" disabled={busy} onClick={()=>act(false)}>{tr('Turn off on this device','خاموش‌کردن در این دستگاه')}</Button></>:<Button disabled={busy || !supported || !key || !restaurantId} onClick={enable}>{busy?tr('Connecting…','در حال اتصال…'):tr('Enable notifications','فعال‌کردن اعلان‌ها')}</Button>}</div>
  {!supported&&<p className="text-sm text-amber-700">{tr('Background notifications are not available in this browser. On iPhone, open the Home Screen app first.','این مرورگر فعلاً اعلان پس‌زمینه را پشتیبانی نمی‌کند. در آیفون ابتدا برنامه را از صفحهٔ اصلی باز کنید.')}</p>}
  {message&&<p role="status" className="text-sm break-words">{message}</p>}
  {restaurantId && <PushCustomization key={restaurantId} restaurant={activeRestaurant} branches={allBranches || []} onTest={sample=>act(true,sample)} testEnabled={enabled} testing={busy} />}
  <details className="border-t pt-3"><summary className="cursor-pointer font-medium">{tr('Recent business records · last 30 days','رویدادهای اخیر کسب‌وکار · ۳۰ روز اخیر')}</summary><div className="mt-3 max-h-80 overflow-y-auto divide-y">{events.length?events.map(e=>{
   const rendered=renderNotification({...DEFAULT_PREFERENCES,language:lang,financial_summary:false,body_template:'{branch} · {time}'},e,activeRestaurant,resolveBranch(e,allBranches || []));
   return <Link key={e.id} to={notificationTarget(e)} className="block py-2 text-sm whitespace-pre-wrap break-words hover:underline">{rendered.body}</Link>;
  }):<p className="text-sm text-muted-foreground">{tr('New business activity will appear here.','رویدادهای جدید کسب‌وکار اینجا نمایش داده می‌شود.')}</p>}</div></details>
 </section>;
}
