import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/api/supabaseClient';

export function pushSupported() {
 return typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
export function applicationKey(value) {
 const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'='));
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
export async function pushRequest(action, body) {
 const {data:{session}}=await supabase.auth.getSession();
 const res=await fetch(`${SUPABASE_URL}/functions/v1/owner-push/${action}`,{
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
