import {createClient} from 'npm:@supabase/supabase-js@2.106.1';
import webpush from 'npm:web-push@3.6.7';
import {validSubscription} from '../owner-push/policy.ts';
import {isWalletId,walletLanguage,walletMessage,walletTestMessage,walletDeliveryAllowed} from './messages.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
async function config(){const {data,error}=await db.rpc('owner_push_config',{p_keys:webpush.generateVAPIDKeys()});if(error||!data)throw Error('Push unavailable');return data;}
async function owner(user:string,tenant:string){const {data,error}=await db.from('erp_memberships').select('id').eq('user_id',user).eq('restaurant_id',tenant).eq('role','owner').eq('status','approved').limit(1);if(error)throw error;return !!data?.length;}
async function send(device:any,payload:any,keys:any){
 if(!validSubscription({endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth_key}}))throw Error('Invalid subscription');
 const details=webpush.generateRequestDetails({endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth_key}},JSON.stringify(payload),{vapidDetails:{subject:'https://mybizctrl.site',publicKey:keys.publicKey,privateKey:keys.privateKey},TTL:86400,urgency:'normal'});
 const result=await fetch(details.endpoint,{method:'POST',headers:details.headers,body:details.body,redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!result.ok){const error:any=new Error('Push provider error');error.statusCode=result.status;throw error;}
}
async function dispatch(keys:any){
 const {data:jobs,error}=await db.rpc('wallet_push_claim');if(error)throw error;let sent=0;
 for(let i=0;i<(jobs||[]).length;i+=8)await Promise.all(jobs.slice(i,i+8).map(async(job:any)=>{
  let state='sent',last_error:string|null=null;
  try{
   const [{data:device,error:de},{data:event,error:ee}]=await Promise.all([db.from('wallet_push_devices').select('*').eq('id',job.device_id).maybeSingle(),db.from('wallet_push_events').select('*').eq('id',job.event_id).maybeSingle()]);if(de||ee)throw Error('Read failed');
   if(!device?.enabled||!event)state='cancelled';
   else{
    const {data:request,error:re}=await db.from('erp_bank_wallet_requests').select('id,person_id,restaurant_id,kind,amount,currency,status').eq('id',event.request_id).maybeSingle();if(re)throw re;
    if(!request)state='cancelled';else{
     const [{data:person,error:pe},{data:business,error:be},isOwner]=await Promise.all([db.from('business_partners').select('id,restaurant_id,user_id,is_active,name').eq('id',request.person_id).maybeSingle(),db.from('restaurants').select('name,is_active').eq('id',request.restaurant_id).maybeSingle(),event.recipient_role==='owner'?owner(event.recipient_id,event.restaurant_id):Promise.resolve(false)]);if(pe||be)throw Error('Read failed');
     if(!walletDeliveryAllowed(device,event,request,person,business,isOwner))state='cancelled';
     else{await send(device,walletMessage(event,request,person,business,device.language),keys);sent++;}
    }
   }
  }catch(err:any){last_error=err.statusCode?`Push provider HTTP ${err.statusCode}`:'Temporary delivery failure';if([404,410].includes(err.statusCode)){await db.from('wallet_push_devices').update({enabled:false}).eq('id',job.device_id);state='cancelled';}else state=job.attempts>=8?'failed':'pending';}
  const {error}=await db.from('wallet_push_deliveries').update({state,last_error,available_at:new Date(Date.now()+Math.min(3600,30*2**job.attempts)*1000).toISOString()}).eq('id',job.id).eq('attempts',job.attempts);if(error)console.error('Wallet delivery status update failed');
 }));
 return {processed:jobs?.length||0,sent};
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 const action=new URL(req.url).pathname.split('/').pop();
 try{
  if(req.method==='GET'&&action==='config')return reply({publicKey:(await config()).publicKey});
  if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  if(action==='dispatch'){const keys=await config();if(req.headers.get('x-dispatch-secret')!==keys.dispatchSecret)return reply({error:'UNAUTHORIZED'},401);return reply(await dispatch(keys));}
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');if(!token)return reply({error:'SIGN_IN_REQUIRED'},401);
  const {data:{user},error}=await db.auth.getUser(token);if(error||!user)return reply({error:'SIGN_IN_REQUIRED'},401);
  const raw=await req.text();if(raw.length>16000)return reply({error:'INVALID_REQUEST'},400);const body=JSON.parse(raw);
  if(action==='language'||action==='unsubscribe'){
   if(typeof body.endpoint!=='string'||body.endpoint.length>4096)return reply({error:'INVALID_REQUEST'},400);
   if(action==='language'&&!['en','ar','fa'].includes(body.language))return reply({error:'INVALID_LANGUAGE'},400);
   let update=db.from('wallet_push_devices').update(action==='language'?{language:body.language}:{enabled:false}).eq('user_id',user.id);
   if(action==='unsubscribe')update=update.eq('endpoint',body.endpoint);
   if(action==='unsubscribe'&&body.restaurantId)update=update.eq('restaurant_id',body.restaurantId);
   const {error}=await update;if(error)throw error;return reply({ok:true});
  }
  if(!isWalletId(body.restaurantId))return reply({error:'INVALID_REQUEST'},400);
  const {data:access,error:ae}=await db.rpc('wallet_push_can_access',{p_user:user.id,p_restaurant:body.restaurantId});if(ae)throw ae;if(!access)return reply({error:'WALLET_ACCESS_DENIED'},403);
  if(action==='subscribe'){
   if(!validSubscription(body.subscription))return reply({error:'INVALID_SUBSCRIPTION'},400);
   const {error}=await db.rpc('wallet_push_register',{p_user:user.id,p_restaurant:body.restaurantId,p_subscription:body.subscription,p_language:walletLanguage(body.language)});
   if(error){if(error.code==='42501')return reply({error:'PUSH_DEVICE_ACCOUNT_CONFLICT'},409);throw error;}
   return reply({enabled:true});
  }
  if(typeof body.endpoint!=='string'||body.endpoint.length>4096)return reply({error:'INVALID_REQUEST'},400);
  const {data:device,error:de}=await db.from('wallet_push_devices').select('*').eq('user_id',user.id).eq('restaurant_id',body.restaurantId).eq('endpoint',body.endpoint).eq('enabled',true).maybeSingle();if(de)throw de;
  if(action==='status')return reply({enabled:!!device});
  if(action==='test'){
   if(!device)return reply({error:'ENABLE_DEVICE_FIRST'},400);
   await send(device,walletTestMessage(body.language||device.language,await owner(user.id,body.restaurantId)),await config());return reply({accepted:true});
  }
  return reply({error:'NOT_FOUND'},404);
 }catch{console.error('Wallet push operation failed');return reply({error:'PUSH_UNAVAILABLE'},503);}
});
