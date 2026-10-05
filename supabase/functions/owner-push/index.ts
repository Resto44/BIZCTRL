import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import webpush from 'npm:web-push@3.6.7';
import { validSubscription } from './policy.ts';
import { DEFAULT_PREFERENCES, renderNotification, shouldDeliver, resolveBranch, needsFinancialSummary } from './preferences.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
async function config() {
 const { data, error } = await db.rpc('owner_push_config', { p_keys: webpush.generateVAPIDKeys() });
 if (error || !data) throw new Error('Push configuration unavailable');
 return data;
}
async function owner(userId: string, restaurantId: string) {
 const { data, error } = await db.from('erp_memberships').select('id').eq('user_id', userId).eq('restaurant_id', restaurantId).eq('role', 'owner').eq('status', 'approved').limit(1);
 return !error && Boolean(data?.length);
}
async function presentation(restaurantId: string) {
 const [settings, business, branches] = await Promise.all([
  db.from('owner_push_preferences').select('*').eq('restaurant_id',restaurantId).maybeSingle(),
  db.from('restaurants').select('name,timezone,currency').eq('id',restaurantId).single(),
  db.from('branches').select('id,name,branch_key').eq('restaurant_id',restaurantId),
 ]);
 if(settings.error || business.error || branches.error) throw new Error('Notification settings unavailable');
 return {settings:settings.data || DEFAULT_PREFERENCES,business:business.data,branches:branches.data || []};
}
async function financialSummary(restaurantId: string, view: any, branch: any, event: any) {
 if(!needsFinancialSummary(view.settings)) return null;
 // Never substitute another branch or business-wide totals for an unresolved branch.
 if(!branch) return null;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:view.business.timezone || 'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const day=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 const date=`${day.year}-${day.month}-${day.day}`;
 const {data,error}=await db.rpc('owner_push_financial_summary',{p_restaurant_id:restaurantId,p_branch_id:branch?.id || null,p_date:date});
 if(error) throw new Error('Financial summary unavailable');
 return data;
}
async function send(device: any, payload: any, keys: any) {
 if (!validSubscription({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth_key } })) throw new Error('Invalid push provider');
 // Generate encrypted Web Push bytes with the audited library; fetch forbids redirects.
 const details = webpush.generateRequestDetails({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth_key } }, JSON.stringify(payload), {
  vapidDetails: { subject: 'https://mybizctrl.site', publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 86400, urgency: 'normal',
 });
 const res = await fetch(details.endpoint, { method: 'POST', headers: details.headers, body: details.body, redirect: 'error', signal: AbortSignal.timeout(10000) });
 if (!res.ok) { const err: any = new Error(`Push provider HTTP ${res.status}`); err.statusCode = res.status; throw err; }
}
async function dispatch(keys: any) {
 const { data: jobs, error } = await db.rpc('owner_push_claim');
 if (error) throw error;
 let sent = 0;
 for (let i=0; i<(jobs || []).length; i+=8) {
  await Promise.all(jobs.slice(i,i+8).map(async (job: any) => {
   let state = 'sent', last_error: string | null = null;
   try {
    const { data: device } = await db.from('owner_push_devices').select('*').eq('id',job.device_id).single();
    const { data: event } = await db.from('owner_record_events').select('*').eq('id',job.event_id).single();
    if (!device?.enabled || !event || device.restaurant_id!==event.restaurant_id || !await owner(device.user_id,event.restaurant_id)) state='cancelled';
    else {
     const view=await presentation(event.restaurant_id);
     const branch=resolveBranch(event,view.branches);
     if(!shouldDeliver(view.settings,event,branch)) state='cancelled';
     else {
      await send(device,{...renderNotification(view.settings,event,view.business,branch,await financialSummary(event.restaurant_id,view,branch,event)),tag:event.id,url:'/notifications',eventId:event.id},keys);
      sent++;
     }
    }
   } catch (err: any) {
    last_error = err.statusCode ? `Push provider HTTP ${err.statusCode}` : 'Push delivery temporarily unavailable';
    if ([404,410].includes(err.statusCode)) {
     await db.from('owner_push_devices').update({enabled:false}).eq('id',job.device_id);
     state='cancelled';
    } else state=job.attempts>=8?'failed':'pending';
   }
   const { error } = await db.from('owner_push_deliveries').update({ state,last_error,available_at:new Date(Date.now()+Math.min(3600,30*2**job.attempts)*1000).toISOString() }).eq('id',job.id).eq('attempts',job.attempts);
   if(error) console.error('Push delivery status write failed');
  }));
 }
 return { processed:jobs?.length || 0,sent };
}
Deno.serve(async (req) => {
 if(req.method==='OPTIONS') return new Response(null,{headers:cors});
 const action=new URL(req.url).pathname.split('/').pop();
 try {
  if(req.method==='GET' && action==='config') return reply({publicKey:(await config()).publicKey});
  if(req.method!=='POST') return reply({error:'Method not allowed'},405);
  if(action==='dispatch') {
   const keys=await config();
   if(req.headers.get('x-dispatch-secret')!==keys.dispatchSecret) return reply({error:'Unauthorized'},401);
   return reply(await dispatch(keys));
  }
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token) return reply({error:'Sign in required'},401);
  const {data:{user},error}=await db.auth.getUser(token);
  if(error || !user) return reply({error:'Sign in required'},401);
  const body=await req.json();
  if(!body.restaurantId || !await owner(user.id,body.restaurantId)) return reply({error:'Owner access required'},403);
  if(action==='subscribe') {
   if(!validSubscription(body.subscription)) return reply({error:'Invalid browser subscription'},400);
   const sub=body.subscription;
   const {data:existing}=await db.from('owner_push_devices').select('user_id').eq('endpoint',sub.endpoint).maybeSingle();
   if(existing && existing.user_id!==user.id) return reply({error:'Disable notifications for the previous account on this device first'},409);
   const {error}=await db.from('owner_push_devices').upsert({user_id:user.id,restaurant_id:body.restaurantId,endpoint:sub.endpoint,p256dh:sub.keys.p256dh,auth_key:sub.keys.auth,enabled:true},{onConflict:'endpoint'});
   if(error) throw error;
   return reply({enabled:true});
  }
  if(action==='test') {
   const {data:device}=await db.from('owner_push_devices').select('*').eq('user_id',user.id).eq('restaurant_id',body.restaurantId).eq('endpoint',body.endpoint).eq('enabled',true).maybeSingle();
   if(!device) return reply({error:'Enable this device first'},400);
   const view=await presentation(body.restaurantId);
   const branch=view.branches.find(b=>view.settings.branch_ids.includes(b.id)) || (view.settings.branch_ids.length ? undefined : view.branches[0]);
   const samples: Record<string,string>={sales:'sales_invoices',purchases:'purchases',inventory:'products',finance:'expenses',people:'employees',other:'tasks'};
   const sample={action:view.settings.actions[0] || 'insert',entity:samples[view.settings.modules[0]] || 'sales_invoices',reference:'TEST-001',created_at:new Date().toISOString()};
   await send(device,{...renderNotification(view.settings,sample,view.business,branch,await financialSummary(body.restaurantId,view,branch,sample)),tag:'bizctrl-push-test',url:'/notifications'},await config());
   return reply({accepted:true});
  }
  return reply({error:'Not found'},404);
 }catch(err){ console.error('Owner push request failed',err instanceof Error ? err.name : 'Error'); return reply({error:'Notification service unavailable. Please try again.'},503); }
});
