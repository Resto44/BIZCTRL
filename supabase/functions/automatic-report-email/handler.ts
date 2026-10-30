const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const equalSecret=(a,b)=>{if(!a||!b||a.length!==b.length)return false;let delta=0;for(let i=0;i<a.length;i++)delta|=a.charCodeAt(i)^b.charCodeAt(i);return delta===0;};

export function createAutomaticReportHandler({db,env,buildPdf,fetchImpl=fetch}) {
 return async req=>{
  if(req.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
  const supplied=req.headers.get('x-dispatch-secret');
  if(!supplied||supplied.length!==64)return reply(401,{error:'UNAUTHORIZED'});
  const {data:secret,error:secretError}=await db.rpc('report_email_dispatch_secret');
  if(secretError||!equalSecret(supplied,secret))return reply(401,{error:'UNAUTHORIZED'});
  const key=env('RESEND_API_KEY'),from=env('REPORT_EMAIL_FROM');
  if(!key||!from)return reply(503,{error:'EMAIL_NOT_CONFIGURED'});
  const {data:jobs,error:claimError}=await db.rpc('report_email_claim');
  if(claimError)return reply(503,{error:'CLAIM_FAILED'});
  const job=jobs?.[0];
  if(!job)return reply(200,{ok:true,processed:0});
  async function context(stock=false){
   const {data,error}=await db.rpc('report_email_context',{p_delivery:job.id,p_lease:job.lease,p_stock:stock});
   if(error||!data?.email)throw new Error('REPORT_DELIVERY_DENIED');
   return data;
  }
  async function save(values){
   const {data,error}=await db.from('report_email_deliveries').update(values).eq('id',job.id).eq('lease',job.lease).eq('state','sending').select('id').single();
   if(error||!data)throw new Error('DELIVERY_SAVE_FAILED');
  }
  try {
   let payload=job.payload;
   if(!payload){
    const scope=await context(true);
    const pdf=await buildPdf({db,job,context:scope});
    if(!pdf?.startsWith('JVBERi0')||pdf.length>6000000)throw new Error('INVALID_PDF');
    payload={from,to:[scope.email],subject:`BizCTRL ${job.frequency||'daily'} report — ${job.period_start||job.report_date} to ${job.report_date}`,
     text:`Your organization's ${job.frequency||'daily'} report for ${job.period_start||job.report_date} to ${job.report_date} (Asia/Riyadh) is attached. Manage reports: https://mybizctrl.site/scheduled-reports`,
     attachments:[{filename:`BizCTRL-${job.frequency||'daily'}-${job.period_start||job.report_date}-${job.report_date}.pdf`,content:pdf}]};
    // Freeze the exact provider request before sending. Retrying a newly rendered
    // PDF could conflict with provider idempotency when records changed meanwhile.
    await save({payload});
   }
   const scope=await context();
   if(payload.to.length!==1||payload.to[0]!==scope.email)throw new Error('REPORT_DELIVERY_DENIED');
   const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',
    headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`daily-report-${job.id}`},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
   const result=await response.json();
   if(!response.ok||!result.id)throw new Error('EMAIL_PROVIDER_REJECTED');
   await save({state:'accepted',provider_id:result.id,last_error:null,payload:null});
   const {error}=await db.from('organization_report_email').update({last_accepted_at:new Date().toISOString(),last_report_date:job.report_date}).eq('restaurant_id',job.restaurant_id);
   return reply(200,{ok:true,processed:1,accepted:true,status_saved:!error});
  } catch(error){
   const denied=error.message==='REPORT_DELIVERY_DENIED'||error.message==='REPORT_FREQUENCY_REVOKED';
   // Never log provider bodies, recipient addresses, keys or financial payloads.
   const code=['REPORT_DELIVERY_DENIED','REPORT_FREQUENCY_REVOKED','EMAIL_PROVIDER_REJECTED','INVALID_PDF','DELIVERY_SAVE_FAILED'].includes(error.message)?error.message:'REPORT_BUILD_OR_NETWORK_FAILED';
   try {await save({state:denied?'cancelled':'pending',last_error:code,available_at:new Date(Date.now()+10*60*1000).toISOString(),...(denied?{payload:null}:{})});}catch{/* lease recovery retries with the same persisted payload/key */}
   return reply(503,{error:code});
  }
 };
}
