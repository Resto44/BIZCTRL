import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";

// Internal one-time catalog maintenance, *not* a customer checkout.
// JWT verification is replaced by an expiring single-use 256-bit token
// atomically claimed by an RPC callable only with the server role.
const API="https://api.paddle.com";
const ids=["starter_20","growth_40","enterprise_100"];
const pricePattern=/^pri_[a-z0-9]{26}$/i;
const productPattern=/^pro_[a-z0-9]{26}$/i;
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{"content-type":"application/json","cache-control":"no-store"}
});
async function paddle(path:string,key:string,init:RequestInit={}){
 const response=await fetch(API+path,{
  ...init,headers:{"authorization":`Bearer ${key}`,"content-type":"application/json"}
 });
 const json=await response.json().catch(()=>null);
 return {ok:response.ok,status:response.status,data:json?.data};
}
Deno.serve(async(req)=>{
 if(req.method!=="POST")return respond({error:"method_not_allowed"},405);
 const token=String((await req.json().catch(()=>null))?.token||"");
 if(token.length<30||token.length>120)return respond({error:"unauthorized"},401);
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!secret)return respond({error:"service_configuration"},503);
 const db=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:jobId,error:claimError}=await db.rpc("paddle_claim_annual_catalog_job",{p_token:token});
 if(claimError||!jobId)return respond({error:"unauthorized_or_already_used"},401);
 const result:{plan:string;status:string;price_id?:string;code?:string}[]=[];
 let status="failed";
 try{
  if(Deno.env.get("PADDLE_ENVIRONMENT")!=="production")throw Error("LIVE_ENVIRONMENT_REQUIRED");
  const key=Deno.env.get("PADDLE_API_KEY");
  if(!key)throw Error("PADDLE_API_KEY_NOT_CONFIGURED");
  const {data:plans,error:dbError}=await db.from("subscription_plans")
   .select("id,monthly_price_cents,paddle_price_id,paddle_annual_price_id")
   .in("id",ids).eq("is_active",true);
  if(dbError||plans?.length!==3)throw Error("PLAN_CATALOG_UNAVAILABLE");
  for(const id of ids){
   const p=plans.find(x=>x.id===id);
   if(!p){result.push({plan:id,status:"failed",code:"PLAN_MISSING"});continue;}
   const annual=Math.round(Number(p.monthly_price_cents)*12*.7);
   if(!Number.isInteger(annual)||annual<=0||!pricePattern.test(p.paddle_price_id)){
    result.push({plan:id,status:"failed",code:"PRICE_QUOTE_INVALID"});continue;
   }
   const monthly=await paddle(`/prices/${p.paddle_price_id}`,key);
   if(!monthly.ok){
    result.push({plan:id,status:"failed",code:`MONTHLY_FETCH_HTTP_${monthly.status}`});continue;
   }
   const m=monthly.data;
   if(!productPattern.test(m?.product_id||"")||m?.billing_cycle?.interval!=="month"||
     Number(m?.billing_cycle?.frequency)!==1||m?.unit_price?.currency_code!=="USD"||
     Number(m?.unit_price?.amount)!==p.monthly_price_cents){
      result.push({plan:id,status:"failed",code:"MONTHLY_CATALOG_MISMATCH"});continue;
   }
   let annualId=p.paddle_annual_price_id;
   if(!annualId){
    const created=await paddle("/prices",key,{
     method:"POST",body:JSON.stringify({
      description:`BizCTRL ${id} yearly 30 percent off existing monthly price`,
      name:"Annual · 30% off",product_id:m.product_id,
      unit_price:{amount:String(annual),currency_code:"USD"},
      billing_cycle:{interval:"year",frequency:1},
      quantity:{minimum:1,maximum:1},tax_mode:"account_setting"
     })
    });
    if(!created.ok||!pricePattern.test(created.data?.id||"")){
     result.push({plan:id,status:"failed",code:`ANNUAL_CREATE_HTTP_${created.status}`});continue;
    }
    const registered=await db.rpc("paddle_register_annual_price",{
     p_plan_id:id,p_monthly_price_id:p.paddle_price_id,
     p_annual_price_id:created.data.id,p_amount_cents:annual
    });
    if(registered.error||!pricePattern.test(registered.data||"")){
     result.push({plan:id,status:"failed",code:"ANNUAL_REGISTER_FAILED"});continue;
    }
    annualId=registered.data;
   }
   const current=await paddle(`/prices/${annualId}`,key);
   const x=current.data;
   if(!current.ok||x?.product_id!==m.product_id||x?.unit_price?.currency_code!=="USD"||
    Number(x?.unit_price?.amount)!==annual||x?.billing_cycle?.interval!=="year"||
    Number(x?.billing_cycle?.frequency)!==1||x?.status!=="active"){
      result.push({plan:id,status:"failed",code:"ANNUAL_CATALOG_READBACK_MISMATCH"});continue;
   }
   result.push({plan:id,status:"verified",price_id:annualId});
  }
  status=result.every(x=>x.status==="verified")?"complete":result.some(x=>x.status==="verified")?"partial":"failed";
 }catch(e){
  status="failed";
  result.push({plan:"catalog",status:"failed",
   code:/^[A-Z_]+$/.test(String((e as Error)?.message||""))?String((e as Error).message):"UNEXPECTED_ERROR"});
 }
 await db.from("paddle_annual_catalog_provision_jobs")
  .update({status,result:{plans:result},finished_at:new Date().toISOString()}).eq("id",jobId);
 return respond({status,plans:result},status==="complete"?200:409);
});
