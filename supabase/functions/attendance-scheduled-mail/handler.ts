const equalSecret=(a,b)=>{if(!a||!b||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export function createAttendanceMailHandler({db,env,fetchImpl=fetch}) {
 return async req=>{
  if(req.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
  const supplied=req.headers.get('x-dispatch-secret');
  if(!supplied||supplied.length!==64)return reply(401,{error:'UNAUTHORIZED'});
  const {data:secret,error}=await db.rpc('erp_attendance_dispatch_secret');
  if(error||!equalSecret(supplied,secret))return reply(401,{error:'UNAUTHORIZED'});
  const key=env('RESEND_API_KEY'),from=env('ATTENDANCE_EMAIL_FROM')||env('REPORT_EMAIL_FROM');
  if(!key||!from)return reply(503,{error:'EMAIL_NOT_CONFIGURED'});
  let processed=0,accepted=0;
  // Bounded concurrency in the database via SKIP LOCKED + leases. Provider
  // idempotency is tied to the challenge and a stable payload across retries.
  for(let i=0;i<10;i++){
   const {data:job,error:claimError}=await db.rpc('erp_attendance_claim_mail');
   if(claimError)return reply(503,{error:'CLAIM_FAILED',processed,accepted});
   if(!job)break;
   let ok=false;
   try{
    const kind=job.action==='in'?'Check In / ورود / الدخول':'Check Out / خروج / الخروج';
    const response=await fetchImpl('https://api.resend.com/emails',{
     method:'POST',redirect:'error',signal:AbortSignal.timeout(4000),
     headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`attendance-scheduled-${job.id}`},
     body:JSON.stringify({from,to:[job.recipient],subject:`BizCTRL — ${kind}`,
      text:`BizCTRL\n${kind}\n\n${job.code}\n\nValid until / اعتبار تا / صالح حتى: ${job.expires_at} (UTC).\nSingle use, 30 minutes from issue. / یک‌بار مصرف، اعتبار ۳۰ دقیقه از صدور. / يستخدم مرة واحدة، صالح ٣٠ دقيقة من الإصدار.\nOpen your employee dashboard and enable precise location at your assigned branch.\nhttps://mybizctrl.site/erp-login\nDo not forward this code.`}),
    });
    const result=await response.json();ok=response.ok&&!!result.id;
   }catch{ok=false;}
   const {error:finishError}=await db.rpc('erp_attendance_finish_mail',{p_id:job.id,p_lease:job.lease,p_accepted:ok});
   if(finishError)return reply(503,{error:'DELIVERY_COMMIT_FAILED',processed,accepted});
   processed++;if(ok)accepted++;
  }
  return reply(200,{ok:true,processed,accepted});
 };
}
