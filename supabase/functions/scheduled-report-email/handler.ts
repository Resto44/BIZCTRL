import {validPDF, validRecipients} from './policy.ts';
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
export function createEmailHandler({createClient, env, fetchImpl = fetch}: {createClient: any, env: (name: string) => string | undefined, fetchImpl?: typeof fetch}) {
return async(req: Request) => {
  if(req.method === 'OPTIONS') return new Response('ok',{headers:cors});
  if(req.method !== 'POST') return reply({error:'METHOD_NOT_ALLOWED'},405);
  try {
    const authorization = req.headers.get('Authorization') || '';
    const db = createClient(env('SUPABASE_URL')!,env('SUPABASE_ANON_KEY')!,{
      auth:{persistSession:false},global:{headers:{Authorization:authorization}},
    });
    const {data:{user},error:authError} = await db.auth.getUser();
    if(authError || !user) return reply({error:'UNAUTHORIZED'},401);
    if(Number(req.headers.get('content-length')) > 6_100_000) return reply({error:'PDF_TOO_LARGE'},413);
    const raw = await req.text();
    if(raw.length > 6_100_000) return reply({error:'PDF_TOO_LARGE'},413);
    let body;
    try { body = JSON.parse(raw); } catch { return reply({error:'INVALID_REQUEST'},400); }
    const key = env('RESEND_API_KEY'), from = env('REPORT_EMAIL_FROM');
    if(body.action === 'status') return reply({ok:true,configured:Boolean(key && from),automatic:false});
    if(body.action !== 'send' || typeof body.schedule_id !== 'string' || !validPDF(body.pdf)) return reply({error:'INVALID_REQUEST'},400);
    // Caller-scoped client preserves tenant, branch and subscription RLS.
    const {data:schedule,error} = await db.from('scheduled_reports').select('*').eq('id',body.schedule_id).single();
    if(error || !schedule) return reply({error:'REPORT_FORBIDDEN'},403);
    const {data:canWrite,error:scopeError} = await db.rpc('erp_can_write_scope_text',{
      p_restaurant_id:schedule.restaurant_id,p_branch_id:schedule.branch_id,
    });
    if(scopeError || !canWrite) return reply({error:'REPORT_FORBIDDEN'},403);
    if(!validRecipients(schedule.recipients)) return reply({error:'INVALID_RECIPIENTS'},400);
    if(!key || !from) return reply({error:'EMAIL_NOT_CONFIGURED'},503);
    if(schedule.last_sent_at && Date.now()-Date.parse(schedule.last_sent_at)<60_000) return reply({error:'EMAIL_RATE_LIMIT'},429);
    // Provider idempotency prevents duplicate delivery from concurrent clicks/retries.
    const slot = Math.floor(Date.now()/300_000);
    const response = await fetchImpl('https://api.resend.com/emails',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
      headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`report-${schedule.id}-${slot}`},
      body:JSON.stringify({from,to:schedule.recipients,subject:`BizCTRL — ${String(schedule.name).replace(/[\r\n]/g,' ').slice(0,150)}`,
        text:'BizCTRL ERP report / تقرير الأعمال / گزارش کسب‌وکار\nPDF attached.',
        attachments:[{filename:'BizCTRL-report.pdf',content:body.pdf}]}),
    });
    const result = await response.json();
    if(!response.ok || !result.id) return reply({error:'EMAIL_PROVIDER_REJECTED'},502);
    const {data:updated,error:saveError} = await db.from('scheduled_reports').update({last_sent_at:new Date().toISOString()}).eq('id',schedule.id).select('id').single();
    // Provider acceptance is distinct from inbox delivery and from status persistence.
    return reply({ok:true,accepted:true,status_saved:!saveError && Boolean(updated),message_id:result.id});
  } catch { return reply({error:'EMAIL_UNAVAILABLE'},502); }
};
}
