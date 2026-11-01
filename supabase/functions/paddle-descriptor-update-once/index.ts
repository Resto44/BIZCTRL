import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

// One-time merchant statement descriptor update requested by BizCTRL owner.
// Access: 256-bit expiring one-use token atomically claimed under service_role.
// Account credentials are only available in Supabase Edge Function secrets.
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{"content-type":"application/json","cache-control":"no-store"}
});
const expected="BIZCTRL";
const paddleURL="https://api.paddle.com/settings/statement-descriptor";
Deno.serve(async(request)=>{
 if(request.method!=="POST")return response({error:"method_not_allowed"},405);
 const body=await request.json().catch(()=>null);
 const token=typeof body?.token==="string"?body.token:"";
 if(token.length<60||token.length>120)return response({error:"unauthorized"},401);
 const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!serviceKey)return response({error:"service_config_missing"},503);
 const db=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:jobId,error:claimError}=await db.rpc("paddle_claim_descriptor_change",{p_token:token});
 if(claimError||!jobId)return response({error:"invalid_or_used_token"},401);
 let status="failed";
 let outcome:Record<string,unknown>={};
 try{
  const environment=Deno.env.get("PADDLE_ENVIRONMENT")??"production";
  if(environment!=="production")throw Error("PADDLE_LIVE_ENVIRONMENT_REQUIRED");
  const key=Deno.env.get("PADDLE_API_KEY");
  if(!key)throw Error("PADDLE_API_KEY_NOT_CONFIGURED");
  const headers={"authorization":`Bearer ${key}`,"content-type":"application/json"};
  // Update only this merchant account's card statement descriptor.
  const change=await fetch(paddleURL,{method:"PATCH",headers,body:JSON.stringify({name:expected})});
  const patch=await change.json().catch(()=>null);
  if(!change.ok){
   outcome={code:patch?.error?.code||"PADDLE_UPDATE_FAILED",http_status:change.status};
  } else if(patch?.data?.name!==expected){
   outcome={code:"PADDLE_UPDATE_RETURNED_WRONG_DESCRIPTOR"};
  }else {
   // Independent read-back if the key permits statement_descriptor.read.
   const get=await fetch(paddleURL,{headers});
   const latest=await get.json().catch(()=>null);
   if(get.ok && latest?.data?.name===expected){
    status="complete";
    outcome={
      name:latest.data.name,
      bank_preview:latest.data?.preview?.default||null,
      paypal_preview:latest.data?.preview?.paypal||null,
      verified_by:"PADDLE_GET_READBACK"
    };
   }else {
    // PATCH 200 is useful evidence, but don't claim independent verification.
    status="complete";
    outcome={
      name:patch.data.name,
      bank_preview:patch.data?.preview?.default||null,
      paypal_preview:patch.data?.preview?.paypal||null,
      verified_by:"PADDLE_PATCH_RESPONSE",
      readback_http_status:get.status
    };
   }
  }
 }catch(error){
  const raw=String((error as Error)?.message||"");
  outcome={code:/^[A-Z_]+$/.test(raw)?raw:"UNEXPECTED_ERROR"};
 }
 await db.from("paddle_descriptor_change_jobs").update({
   status,result:outcome,finished_at:new Date().toISOString()
 }).eq("id",jobId);
 return response({status,result:outcome},status==="complete"?200:409);
});
