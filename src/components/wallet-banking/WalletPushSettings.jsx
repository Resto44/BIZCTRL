import React,{useEffect,useState} from 'react';
import {BellRing} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {applicationKey,currentPushSubscription,pushRequest,pushSupported,syncWalletPushLanguage} from '@/lib/ownerPush';
const stages={
 en:{before:'Before approval',beforeHelp:'An alert opens the exact request for review.',after:'After approval or rejection',afterHelp:'Both parties receive the final result.',language:'Notification language',sync:'Language syncing…',ready:'Follows your app language'},
 ar:{before:'قبل الموافقة',beforeHelp:'إشعار يفتح طلب التحويل مباشرة للمراجعة.',after:'بعد الموافقة أو الرفض',afterHelp:'تصل النتيجة النهائية إلى طرفي المعاملة.',language:'لغة الإشعارات',sync:'جارٍ مزامنة اللغة…',ready:'تتبع لغة التطبيق'},
 fa:{before:'پیش از تأیید',beforeHelp:'اعلان، همان درخواست را برای بررسی باز می‌کند.',after:'پس از تأیید یا رد',afterHelp:'نتیجۀ نهایی به هر دو طرف معامله می‌رسد.',language:'زبان اعلان',sync:'در حال هماهنگی زبان…',ready:'مطابق زبان انتخاب‌شدۀ برنامه'}
};
const copy={
 en:{title:'Wallet push notifications',on:'Enabled on this device',off:'Not enabled on this device',enable:'Enable notifications',disable:'Turn off wallet alerts',test:'Send test',busy:'Connecting…',help:'Approval requests and transaction results, even when the app is closed. iPhone: add BizCTRL to Home Screen, open its icon, then enable notifications.',blocked:'Allow notifications in device settings, then try again.',unsupported:'Open the installed Home Screen app or a browser supporting Web Push.',error:'Could not connect wallet notifications. Please retry.',sent:'Test accepted by the push provider. Check device notifications.',retry:'Refresh status'},
 ar:{title:'إشعارات المحفظة الفورية',on:'مفعلة على هذا الجهاز',off:'غير مفعلة على هذا الجهاز',enable:'تفعيل الإشعارات',disable:'إيقاف إشعارات المحفظة',test:'إرسال اختبار',busy:'جارٍ الاتصال…',help:'طلبات الموافقة ونتائج المعاملات حتى والتطبيق مغلق. آيفون: أضف BizCTRL للشاشة الرئيسية وافتحه من الأيقونة ثم فعّل الإشعارات.',blocked:'اسمح بالإشعارات في إعدادات الجهاز ثم أعد المحاولة.',unsupported:'افتح التطبيق من الشاشة الرئيسية أو متصفحاً يدعم الإشعارات الفورية.',error:'تعذر ربط إشعارات المحفظة. أعد المحاولة.',sent:'قبلت خدمة الإشعارات الاختبار. تحقق من إشعارات جهازك.',retry:'تحديث الحالة'},
 fa:{title:'پوش نوتیفیکیشن والت',on:'در این دستگاه فعال است',off:'در این دستگاه فعال نیست',enable:'فعال‌کردن اعلان‌ها',disable:'خاموش‌کردن اعلان والت',test:'ارسال اعلان آزمایشی',busy:'در حال اتصال…',help:'درخواست تأیید و نتیجۀ معاملات، حتی وقتی برنامه بسته است. آیفون: BizCTRL را به صفحۀ اصلی اضافه کنید، از آیکون آن باز کنید و اعلان را فعال بسازید.',blocked:'اجازۀ اعلان را در تنظیمات دستگاه فعال کنید و دوباره تلاش کنید.',unsupported:'برنامه را از صفحۀ اصلی یا مرورگر پشتیبان پوش باز کنید.',error:'اتصال اعلان والت ناموفق بود. دوباره تلاش کنید.',sent:'سرویس پوش اعلان آزمایشی را پذیرفت؛ اعلان‌های دستگاه را بررسی کنید.',retry:'تازه‌سازی وضعیت'}
};
export default function WalletPushSettings({restaurantId,lang='en'}){
 const t=copy[lang]||copy.en,s=stages[lang]||stages.en,supported=pushSupported();
 const [languageReady,setLanguageReady]=useState(false);
 const [key,setKey]=useState(null),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{
  let live=true;setLanguageReady(false);setEnabled(false);setMessage('');setKey(null);
  if(supported&&restaurantId){
   pushRequest('config',undefined,'wallet-push').then(data=>{if(live)setKey(data.publicKey);}).catch(()=>{if(live)setMessage(t.error);});
   currentPushSubscription().then(async sub=>{if(!sub)return;const data=await pushRequest('status',{restaurantId,endpoint:sub.endpoint},'wallet-push');if(live)setEnabled(data.enabled&&Notification.permission==='granted');if(data.enabled&&live){await syncWalletPushLanguage(sub.endpoint,lang);if(live)setLanguageReady(true);}}).catch(()=>{if(live)setMessage(t.error);});
  }
  return()=>{live=false;};
 },[restaurantId,lang,supported,version,t.error]);
 async function enable(){
  setBusy(true);setMessage('');
  try{
   const permission=await Notification.requestPermission(); // Must remain directly in the user's click gesture.
   if(permission!=='granted'){setMessage(t.blocked);return;}
   await navigator.serviceWorker.register('/sw.js');const reg=await navigator.serviceWorker.ready;
   const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(key)});
   await pushRequest('subscribe',{restaurantId,language:lang,subscription:sub.toJSON()},'wallet-push');setEnabled(true);await syncWalletPushLanguage(sub.endpoint,lang);setLanguageReady(true);
  }catch{setMessage(t.error);}finally{setBusy(false);}
 }
 async function action(test){
  setBusy(true);setMessage('');
  try{const sub=await currentPushSubscription();if(!sub){setEnabled(false);return;}
   await pushRequest(test?'test':'unsubscribe',{restaurantId,endpoint:sub.endpoint,language:lang},'wallet-push');
   if(test)setMessage(t.sent);else setEnabled(false);
  }catch{setMessage(t.error);}finally{setBusy(false);}
 }
 return <section dir={lang==='en'?'ltr':'rtl'} aria-label={t.title} className="min-w-0 overflow-hidden rounded-2xl border border-blue-100 bg-white p-4 text-sm shadow-sm">
  <div className="flex flex-wrap items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-950 text-white"><BellRing aria-hidden="true" className="size-5"/></span><div className="min-w-0 flex-1"><h2 className="text-base font-black text-slate-950">{t.title}</h2><p role="status" className={'mt-1 text-xs font-bold '+(enabled?'text-emerald-700':'text-slate-500')}>{enabled?t.on:t.off}</p></div></div>
  <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2"><p className="flex flex-wrap justify-between gap-2 text-xs"><span className="text-slate-600">{s.language}</span><b>{lang==='ar'?'العربية':lang==='fa'?'فارسی':'English'}</b></p>{enabled&&<p className={'mt-1 text-xs '+(languageReady?'text-emerald-700':'text-amber-800')}>{languageReady?s.ready:s.sync}</p>}</div>
  <div className="mt-3 grid gap-2 sm:grid-cols-2">{[[s.before,s.beforeHelp],[s.after,s.afterHelp]].map(([title,help],i)=><div key={title} className="rounded-xl border border-slate-100 p-3"><p className="font-bold text-blue-950"><span className="me-2 text-blue-600">{i===0?'01':'02'}</span>{title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{help}</p></div>)}</div>
  <p className="my-3 text-xs leading-6 text-slate-600">{t.help}</p>
  <div className="flex flex-wrap gap-2">{enabled?<><Button type="button" disabled={busy} onClick={()=>action(true)}>{t.test}</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>action(false)}>{t.disable}</Button></>:<Button type="button" disabled={busy||!supported||!key||!restaurantId} onClick={enable}>{busy?t.busy:t.enable}</Button>}<Button type="button" variant="ghost" disabled={busy} onClick={()=>setVersion(v=>v+1)}>{t.retry}</Button></div>
  {!supported&&<p className="mt-2 text-xs text-amber-800">{t.unsupported}</p>}{message&&<p role="status" className="mt-2 text-xs">{message}</p>}
 </section>;
}
