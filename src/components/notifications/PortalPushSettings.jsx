import React,{useEffect,useState} from 'react';
import { BellRing,ChevronDown,Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { applicationKey,currentPushSubscription,pushRequest,pushSupported } from '@/lib/ownerPush';

const messages={
 en:{title:'Portal push notifications',on:'Enabled on this device',off:'Not enabled on this device',
  enable:'Enable notifications',disable:'Disable this portal',test:'Send test',
  sent:'Test accepted by the push provider. Check your device; delivery is not guaranteed.',
  enabled:'This portal is enrolled for relevant, authorized account updates.',
  disabled:'Push alerts are off for this portal on this device.',
  error:'Could not connect notifications. Please retry.',busy:'Connecting…',
  unsupported:'Push notifications are unavailable here. On iPhone, install BizControl to your Home Screen and open it from its app icon (iOS 16.4+).',
  denied:'Notification permission was not granted. Enable it in device settings.',
  how:'iPhone: Safari → Share → Add to Home Screen → open BizControl from its icon → tap Enable. Android/desktop: use a browser that supports Web Push.',
  privacy:'Notifications contain only a general event type; private transaction details stay inside your signed-in portal.',
  conflict:'This device is linked to another signed-in account. Sign out of the old account and refresh the app, then retry.',
  help:'Orders, invoices, payments, shifts and assignments are delivered only when relevant to your portal. Owner and Wallet notifications keep their existing controls.'},
 ar:{title:'إشعارات البوابة الفورية',on:'مفعّلة على هذا الجهاز',off:'غير مفعّلة على هذا الجهاز',
  enable:'تفعيل الإشعارات',disable:'إيقاف هذه البوابة',test:'إرسال اختبار',
  sent:'قبل مزوّد الإشعارات الاختبار. تحقق من جهازك؛ التسليم ليس مضموناً.',
  enabled:'تم تسجيل الجهاز لاستقبال تحديثات الحساب المصرّح بها.',
  disabled:'تم إيقاف الإشعارات لهذه البوابة على هذا الجهاز.',
  error:'تعذر الاتصال بالإشعارات. حاول مجدداً.',busy:'جارٍ الاتصال…',
  unsupported:'الإشعارات غير مدعومة هنا. في الآيفون ثبّت BizControl على الشاشة الرئيسية وافتحه من الأيقونة (iOS 16.4+).',
  denied:'لم تسمح بالإشعارات. فعّل الصلاحية من إعدادات الجهاز.',
  how:'آيفون: Safari ← مشاركة ← إضافة إلى الشاشة الرئيسية ← افتح الأيقونة ← تفعيل الإشعارات. على أندرويد والكمبيوتر استخدم متصفحاً يدعم Web Push.',
  privacy:'يعرض الإشعار نوع الحدث فقط؛ تفاصيل المعاملات الخاصة لا تظهر إلا بعد تسجيل الدخول.',
  conflict:'الجهاز مرتبط بحساب آخر. سجّل الخروج من الحساب السابق وافتح التطبيق من جديد ثم أعد المحاولة.',
  help:'تصل تحديثات الطلبات والفواتير والمدفوعات والحضور والتوصيل إلى البوابة المخوّلة فقط. إشعارات المالك والمحفظة لها إعداداتها الحالية.'},
 fa:{title:'پوش نوتیفیکیشن پورتل',on:'در این دستگاه فعال است',off:'در این دستگاه فعال نیست',
  enable:'فعال‌کردن اعلان‌ها',disable:'خاموش‌کردن این پورتل',test:'ارسال اعلان آزمایشی',
  sent:'سرویس پوش اعلان آزمایشی را پذیرفت. دستگاه را بررسی کنید؛ رسیدن اعلان تضمینی نیست.',
  enabled:'این دستگاه برای رویدادهای مجاز همین حساب ثبت شد.',
  disabled:'اعلان این پورتل در این دستگاه خاموش شد.',
  error:'اتصال اعلان ناموفق بود. دوباره امتحان کنید.',busy:'در حال اتصال…',
  unsupported:'در این محیط پوش پشتیبانی نمی‌شود. در آیفون BizControl را به صفحهٔ اصلی اضافه و از آیکون آن باز کنید (iOS 16.4+).',
  denied:'اجازهٔ اعلان داده نشده است. آن را از تنظیمات دستگاه فعال کنید.',
  how:'آیفون: Safari ← Share ← Add to Home Screen ← برنامه را از آیکون باز کنید ← فعال‌کردن اعلان. اندروید و کمپیوتر باید مرورگر پشتیبان Web Push داشته باشند.',
  privacy:'روی اعلان فقط نوع رویداد دیده می‌شود؛ جزئیات خصوصی تنها پس از ورود به پورتل نمایش می‌یابند.',
  conflict:'این دستگاه به حساب دیگری متصل است. از حساب قبلی خارج شوید، برنامه را تازه کنید و دوباره امتحان کنید.',
  help:'سفارش، فاکتور، پرداخت، حاضری و وظایف تحویل فقط برای پورتل مجاز فرستاده می‌شود. تنظیمات قبلی اعلان Owner و Wallet محفوظ است.'}
};
const ROLES=new Set(['owner','manager','employee','supplier','driver','customer']);

export default function PortalPushSettings({role,restaurantId=null,customerId=null,language='en'}){
 const t=messages[language]||messages.en;
 const supported=pushSupported();
 const isCustomer=role==='customer';
 const ready=ROLES.has(role)&&(isCustomer?Boolean(customerId):Boolean(restaurantId));
 const payload={role,...(!isCustomer?{restaurantId}:{customerId})};
 const [key,setKey]=useState(null),[enabled,setEnabled]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [refresh,setRefresh]=useState(0);
 useEffect(()=>{
  let active=true;setEnabled(false);setMessage('');setKey(null);
  if(!supported||!ready)return undefined;
  pushRequest('config',undefined,'erp-portal-push').then(r=>{
   if(active)setKey(r.publicKey);
  }).catch(()=>{if(active)setMessage(t.error);});
  currentPushSubscription().then(async sub=>{
   if(!sub)return;
   const data=await pushRequest('status',{...payload,endpoint:sub.endpoint},'erp-portal-push');
   if(active)setEnabled(Boolean(data.enabled)&&Notification.permission==='granted');
  }).catch(()=>{if(active)setMessage(t.error);});
  return()=>{active=false;};
 },[role,restaurantId,customerId,supported,refresh]);

 useEffect(()=>{
  if(!enabled||!ready)return;
  let active=true;
  currentPushSubscription().then(sub=>sub&&pushRequest('language',{
   ...payload,endpoint:sub.endpoint,language
  },'erp-portal-push')).catch(()=>{if(active)setMessage(t.error);});
  return()=>{active=false;};
 },[enabled,language,role,restaurantId,customerId]);

 async function enable(){
  if(!supported||!ready||!key||busy)return;
  // The permission dialog must be started synchronously from this click on iOS.
  const request=Notification.requestPermission();
  setBusy(true);setMessage('');
  try{
   const permission=await request;
   if(permission!=='granted'){setMessage(t.denied);return;}
   await navigator.serviceWorker.register('/sw.js');
   const reg=await navigator.serviceWorker.ready;
   let sub=await reg.pushManager.getSubscription();
   if(!sub)sub=await reg.pushManager.subscribe({
    userVisibleOnly:true,applicationServerKey:applicationKey(key)
   });
   await pushRequest('subscribe',{...payload,language,subscription:sub.toJSON()},'erp-portal-push');
   setEnabled(true);setMessage(t.enabled);
  }catch(error){
   setMessage(String(error?.message||'').includes('PUSH_DEVICE_ACCOUNT_CONFLICT')?t.conflict:t.error);
  }finally{setBusy(false);}
 }
 async function act(test){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const sub=await currentPushSubscription();
   if(!sub){setEnabled(false);setMessage(t.disabled);return;}
   const result=await pushRequest(test?'test':'unsubscribe',{
    ...payload,endpoint:sub.endpoint,language
   },'erp-portal-push');
   if(test)setMessage(result.accepted?t.sent:t.error);
   else{setEnabled(false);setMessage(t.disabled);}
  }catch{setMessage(t.error);}finally{setBusy(false);}
 }
 if(!ready)return null;
 return <details dir={language==='en'?'ltr':'rtl'} className="group w-full min-w-0 max-w-full rounded-xl border border-teal-100 bg-white text-sm print:hidden" aria-label={t.title}>
  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 [&::-webkit-details-marker]:hidden">
   <BellRing aria-hidden="true" className="size-4 shrink-0 text-teal-700"/>
   <span className="min-w-0 flex-1 font-semibold text-slate-900">{t.title}</span>
   <span className={'shrink-0 rounded-full px-2 py-1 text-xs font-medium '+(enabled?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600')}>{enabled?t.on:t.off}</span>
   <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-slate-500 group-open:rotate-180"/>
  </summary>
  <div className="space-y-3 border-t border-teal-100 p-3">
   <p className="text-xs leading-5 text-slate-600">{t.help}</p>
   <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-2 text-xs leading-5 text-slate-600">
    <Smartphone aria-hidden="true" className="mt-0.5 size-4 shrink-0"/><p>{t.how}</p>
   </div>
   {!supported&&<p role="status" className="text-amber-700">{t.unsupported}</p>}
   <div className="flex flex-wrap gap-2">
    {enabled?<><Button type="button" disabled={busy} onClick={()=>act(true)}>{t.test}</Button>
     <Button type="button" variant="outline" disabled={busy} onClick={()=>act(false)}>{t.disable}</Button></>:
     <Button type="button" disabled={busy||!supported||!key} onClick={enable}>{busy?t.busy:t.enable}</Button>}
    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>setRefresh(v=>v+1)}>↻</Button>
   </div>
   {message&&<p role="status" className="break-words text-xs text-slate-700">{message}</p>}
   <p className="text-xs leading-5 text-slate-500">{t.privacy}</p>
  </div>
 </details>;
}
