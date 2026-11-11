import { createClient } from 'npm:@supabase/supabase-js@2.106.1';
import webpush from 'npm:web-push@3.6.7';
import { validSubscription } from '../owner-push/policy.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{
 auth:{persistSession:false,autoRefreshToken:false}
});
const cors = {
 'Access-Control-Allow-Origin':'https://mybizctrl.site',
 'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
 'Access-Control-Allow-Methods':'GET,POST,OPTIONS'
};
const json = (value:unknown,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}
});
const roles=['owner','manager','employee','supplier','driver','customer'] as const;
type Role=(typeof roles)[number];
const rolePath:Record<Role,string>={
 owner:'/owner-command-center',manager:'/manager-dashboard',
 employee:'/employee-dashboard',supplier:'/supplier-portal',
 driver:'/driver-dashboard',customer:'/customer-portal'
};
const words:Record<string,Record<string,string>>={
 en:{notice:'A new business notification is available.',order:'An order has been updated.',
   invoice:'An invoice was updated.',payment:'A payment has been recorded.',
   shift:'Your shift attendance was updated.',delivery:'A delivery assignment was updated.',
   test:'This is a test notification from BizControl.'},
 ar:{notice:'لديك إشعار جديد في النظام.',order:'تم تحديث طلب.',
   invoice:'تم تحديث فاتورة.',payment:'تم تسجيل دفعة.',
   shift:'تم تحديث حضور ورديتك.',delivery:'تم تحديث مهمة توصيل.',
   test:'هذا إشعار تجريبي من BizControl.'},
 fa:{notice:'یک اعلان تازه در سیستم دارید.',order:'یک سفارش به‌روزرسانی شد.',
   invoice:'یک فاکتور به‌روزرسانی شد.',payment:'یک پرداخت ثبت شد.',
   shift:'حاضری شیفت شما به‌روزرسانی شد.',delivery:'وظیفهٔ تحویل به‌روزرسانی شد.',
   test:'این اعلان آزمایشی BizControl است.'}
};
const isUuid=(v:unknown):v is string=>typeof v==='string'&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const supportedRole=(v:unknown):v is Role=>typeof v==='string'&&roles.includes(v as Role);
const normalizedLanguage=(v:unknown)=>['en','ar','fa'].includes(String(v))?String(v):'en';
const notification=(category:string,role:Role,lang:string,tag?:string)=>({
 title:'BizControl',
 body:words[normalizedLanguage(lang)][category]||words.en.notice,
 tag:tag||undefined,
 eventId:tag||undefined,
 lang:normalizedLanguage(lang),
 dir:normalizedLanguage(lang)==='en'?'ltr':'rtl',
 url:rolePath[role]
});
async function config(){
 const {data,error}=await db.rpc('owner_push_config',{p_keys:webpush.generateVAPIDKeys()});
 if(error||!data?.publicKey||!data?.privateKey||!data?.dispatchSecret)throw Error('PUSH_CONFIG_UNAVAILABLE');
 return data;
}
async function allowed(userId:string,restaurantId:string,role:Role,customerId:string|null){
 const {data,error}=await db.rpc('erp_portal_push_can_access',{
  p_user:userId,p_restaurant:restaurantId,p_role:role,p_customer:customerId
 });
 if(error)throw error;
 return data===true;
}
async function identity(userId:string,body:Record<string,unknown>){
 if(!supportedRole(body.role))return null;
 const role:Role=body.role;
 if(role==='customer'){
  if(!isUuid(body.customerId))return null;
  const {data:c,error}=await db.from('customers')
   .select('id,restaurant_id,branch_id,is_active').eq('id',body.customerId).maybeSingle();
  if(error||!c?.is_active||!await allowed(userId,c.restaurant_id,'customer',c.id))return null;
  return {restaurantId:c.restaurant_id,role,customerId:c.id,branchId:c.branch_id||null};
 }
 if(!isUuid(body.restaurantId))return null;
 const {data:m,error}=await db.from('erp_memberships')
  .select('id,restaurant_id,branch_id,role,status,selected_branch_ids')
  .eq('user_id',userId).eq('restaurant_id',body.restaurantId)
  .eq('role',role).eq('status','approved').maybeSingle();
 if(error||!m||!await allowed(userId,m.restaurant_id,role,null))return null;
 const multi=Array.isArray(m.selected_branch_ids)&&m.selected_branch_ids.length>1;
 return {restaurantId:m.restaurant_id,role,customerId:null,branchId:role==='owner'||multi?null:m.branch_id||null};
}
async function send(device:any,payload:unknown,keys:any){
 const subscription={endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth_key}};
 if(!validSubscription(subscription))throw Error('INVALID_SUBSCRIPTION');
 const details=webpush.generateRequestDetails(subscription,JSON.stringify(payload),{
  vapidDetails:{subject:'https://mybizctrl.site',publicKey:keys.publicKey,privateKey:keys.privateKey},
  TTL:3600,urgency:'normal'
 });
 const result=await fetch(details.endpoint,{
  method:'POST',headers:details.headers,body:details.body,redirect:'error',
  signal:AbortSignal.timeout(10000)
 });
 if(!result.ok){
  const e:any=new Error('PROVIDER_ERROR');e.statusCode=result.status;throw e;
 }
}
async function stillAuthorized(device:any,event:any){
 if(!device?.enabled||!event||device.user_id!==event.recipient_id||
    device.restaurant_id!==event.restaurant_id||device.role!==event.role)return false;
 if(!await allowed(device.user_id,device.restaurant_id,device.role,device.customer_id||null))return false;
 if(device.role==='customer'){
  const {data:c,error}=await db.from('customers').select('branch_id,restaurant_id,is_active')
   .eq('id',device.customer_id).maybeSingle();
  return !error&&c?.is_active&&c.restaurant_id===event.restaurant_id&&
    (!c.branch_id||c.branch_id===event.branch_id);
 }
 const {data:m,error}=await db.from('erp_memberships')
  .select('branch_id,selected_branch_ids').eq('user_id',device.user_id)
  .eq('restaurant_id',event.restaurant_id).eq('role',device.role)
  .eq('status','approved').maybeSingle();
 if(error||!m)return false;
 return !event.branch_id||device.role==='owner'||
   (!device.branch_id||device.branch_id===event.branch_id)&&
   (!m.branch_id||m.branch_id===event.branch_id||
     (Array.isArray(m.selected_branch_ids)&&m.selected_branch_ids.includes(event.branch_id)));
}
async function dispatch(keys:any){
 const {data:jobs,error}=await db.rpc('erp_portal_push_claim');
 if(error)throw error;
 let sent=0;
 for(let i=0;i<(jobs||[]).length;i+=8){
  await Promise.all(jobs.slice(i,i+8).map(async(job:any)=>{
   let state='sent',last_error:string|null=null;
   try{
    const [{data:device,error:de},{data:event,error:ee}]=await Promise.all([
     db.from('erp_portal_push_devices').select('*').eq('id',job.device_id).maybeSingle(),
     db.from('erp_portal_push_events').select('*').eq('id',job.event_id).maybeSingle()
    ]);
    if(de||ee)throw Error('EVENT_READ_FAILED');
    if(!await stillAuthorized(device,event))state='cancelled';
    else{
     await send(device,notification(event.category,event.role,device.language,event.id),keys);
     sent++;
    }
   }catch(e:any){
    last_error=e?.statusCode?('Provider HTTP '+e.statusCode):'Delivery temporarily unavailable';
    if([404,410].includes(e?.statusCode)){
     await db.from('erp_portal_push_devices').update({enabled:false}).eq('id',job.device_id);
     state='cancelled';
    }else state=job.attempts>=8?'failed':'pending';
   }
   const {error:updateError}=await db.from('erp_portal_push_deliveries')
    .update({state,last_error,available_at:new Date(Date.now()+
      Math.min(3600,30*2**job.attempts)*1000).toISOString()})
    .eq('id',job.id).eq('attempts',job.attempts);
   if(updateError)console.error('Portal push delivery status unavailable');
  }));
 }
 return {processed:jobs?.length||0,sent};
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 const action=new URL(req.url).pathname.split('/').pop();
 try{
  if(req.method==='GET'&&action==='config')return json({publicKey:(await config()).publicKey});
  if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  const raw=await req.text();
  if(raw.length>16384)return json({error:'INVALID_REQUEST'},400);
  let body:Record<string,unknown>={};
  try{body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return json({error:'INVALID_REQUEST'},400);}
  if(action==='dispatch'){
   const keys=await config();
   if(req.headers.get('x-dispatch-secret')!==keys.dispatchSecret)return json({error:'UNAUTHORIZED'},401);
   return json(await dispatch(keys));
  }
  const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)return json({error:'SIGN_IN_REQUIRED'},401);
  const {data:{user},error}=await db.auth.getUser(token);
  if(error||!user)return json({error:'SIGN_IN_REQUIRED'},401);
  const access=await identity(user.id,body);
  if(!access)return json({error:'PORTAL_ACCESS_DENIED'},403);
  if(action==='subscribe'){
   if(!validSubscription(body.subscription))return json({error:'INVALID_SUBSCRIPTION'},400);
   const sub=body.subscription as any;
   const [{data:current,error:ce},{data:oldOwner},{data:oldWallet}]=await Promise.all([
    db.from('erp_portal_push_devices').select('user_id').eq('endpoint',sub.endpoint).maybeSingle(),
    db.from('owner_push_devices').select('user_id').eq('endpoint',sub.endpoint).eq('enabled',true).maybeSingle(),
    db.from('wallet_push_devices').select('user_id').eq('endpoint',sub.endpoint).eq('enabled',true).maybeSingle()
   ]);
   if(ce)throw ce;
   if([current,oldOwner,oldWallet].some(x=>x&&x.user_id!==user.id))return json({error:'PUSH_DEVICE_ACCOUNT_CONFLICT'},409);
   const record={user_id:user.id,restaurant_id:access.restaurantId,role:access.role,
    customer_id:access.customerId,branch_id:access.branchId,endpoint:sub.endpoint,
    p256dh:sub.keys.p256dh,auth_key:sub.keys.auth,language:normalizedLanguage(body.language),
    enabled:true,updated_at:new Date().toISOString()};
   const {error:saveError}=await db.from('erp_portal_push_devices')
    .upsert(record,{onConflict:'endpoint'});
   if(saveError)throw saveError;
   return json({enabled:true,role:access.role});
  }
  if(typeof body.endpoint!=='string'||body.endpoint.length>4096)return json({error:'INVALID_ENDPOINT'},400);
  const {data:device,error:de}=await db.from('erp_portal_push_devices').select('*')
   .eq('user_id',user.id).eq('restaurant_id',access.restaurantId)
   .eq('role',access.role).eq('endpoint',body.endpoint).eq('enabled',true)
   .maybeSingle();
  if(de)throw de;
  if(action==='status')return json({enabled:!!device});
  if(action==='unsubscribe'){
   const {error:e}=await db.from('erp_portal_push_devices')
    .update({enabled:false,updated_at:new Date().toISOString()})
    .eq('user_id',user.id).eq('restaurant_id',access.restaurantId)
    .eq('role',access.role).eq('endpoint',body.endpoint);
   if(e)throw e;return json({enabled:false});
  }
  if(action==='language'){
   if(!['en','ar','fa'].includes(String(body.language)))return json({error:'INVALID_LANGUAGE'},400);
   if(device){
    const {error:e}=await db.from('erp_portal_push_devices').update({language:body.language})
     .eq('id',device.id).eq('user_id',user.id);if(e)throw e;
   }
   return json({synced:!!device});
  }
  if(action==='test'){
   if(!device)return json({error:'ENABLE_DEVICE_FIRST'},400);
   await send(device,notification('test',device.role,normalizedLanguage(body.language)),await config());
   return json({accepted:true,delivery_confirmed:false});
  }
  return json({error:'NOT_FOUND'},404);
 }catch(e){
  console.error('ERP portal push request failed',e instanceof Error?e.name:'Error');
  return json({error:'PUSH_UNAVAILABLE'},503);
 }
});
