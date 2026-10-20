import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/api/supabaseClient';

export function pushSupported() {
 return typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
export function applicationKey(value) {
 const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'='));
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
export async function pushRequest(action, body, service='owner-push') {
 const {data:{session}}=await supabase.auth.getSession();
 const res=await fetch(`${SUPABASE_URL}/functions/v1/${service}/${action}`,{
  method:body?'POST':'GET',headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,'Content-Type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),
 });
 const data=await res.json();
 if(!res.ok) throw new Error(data.error || 'Notification request failed');
 return data;
}
export async function currentPushSubscription() {
 if(!pushSupported()) return null;
 const reg=await navigator.serviceWorker.getRegistration('/');
 return reg?.pushManager.getSubscription() || null;
}
export async function disableDevicePush() {
 const sub=await currentPushSubscription();
 if(!sub) return;
 // Revoke the provider immediately; a slow network must not delay sign-out.
 try { await sub.unsubscribe(); } finally {
  await supabase.from('owner_push_devices').delete().eq('endpoint',sub.endpoint).abortSignal(AbortSignal.timeout(3000));
 }
}

let walletLanguageQueue=Promise.resolve();
export function syncWalletPushLanguage(endpoint,language) {
 walletLanguageQueue=walletLanguageQueue.catch(()=>{}).then(()=>pushRequest('language',{endpoint,language:['en','ar','fa'].includes(language)?language:'en'},'wallet-push'));
 return walletLanguageQueue;
}

// Serialize changes so a slow previous-language request cannot win a later change.
let languageQueue=Promise.resolve();
export function syncPushLanguage(language) {
 languageQueue=languageQueue.catch(()=>{}).then(async()=>{
  if(!pushSupported()) return;
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return;
  const sub=await currentPushSubscription();
  if(sub){const results=await Promise.allSettled([pushRequest('language',{endpoint:sub.endpoint,language:['en','ar','fa'].includes(language)?language:'en'},'owner-push'),syncWalletPushLanguage(sub.endpoint,language)]);const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;}
 });
 return languageQueue;
}
export function watchPushLanguage(language) {
 let stopped=false;
 const sync=()=>{if(!stopped)void syncPushLanguage(language).catch(()=>{});};
 const visible=()=>{if(document.visibilityState==='visible')sync();};
 // Defer auth callbacks to avoid awaiting Supabase auth inside its own lock.
 const {data}=supabase.auth.onAuthStateChange(()=>{setTimeout(sync,0);});
 window.addEventListener('online',sync);
 document.addEventListener('visibilitychange',visible);
 sync();
 return()=>{stopped=true;data?.subscription?.unsubscribe();window.removeEventListener('online',sync);document.removeEventListener('visibilitychange',visible);};
}
