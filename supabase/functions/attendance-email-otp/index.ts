import { createClient } from 'npm:@supabase/supabase-js@2.106.1';

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'POST,OPTIONS',
};
const reply=(data: Record<string,unknown>,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'},
});
const isUuid=(v: unknown)=>typeof v==='string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);

/** Rejection sampling avoids leaking bias into a six-digit CSPRNG OTP. */
function generateCode(): string {
  const ceiling=Math.floor(0x1_0000_0000/1_000_000)*1_000_000;
  const buffer=new Uint32Array(1);
  do { crypto.getRandomValues(buffer); } while(buffer[0]>=ceiling);
  return String(buffer[0]%1_000_000).padStart(6,'0');
}
const respondError=(reason:string,status:number)=>reply({ok:false,error:reason},status);

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return respondError('METHOD_NOT_ALLOWED',405);
  if(Number(req.headers.get('content-length'))>4096)return respondError('REQUEST_TOO_LARGE',413);
  const url=Deno.env.get('SUPABASE_URL')||'';
  const anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  const resend=Deno.env.get('RESEND_API_KEY')||'';
  const from=Deno.env.get('ATTENDANCE_EMAIL_FROM')||Deno.env.get('REPORT_EMAIL_FROM')||'';
  if(!url||!anon||!service)return respondError('SERVER_NOT_CONFIGURED',503);
  const authorization=req.headers.get('Authorization')||'';
  if(!/^Bearer\s+\S+$/i.test(authorization))return respondError('AUTH_REQUIRED',401);
  const caller=createClient(url,anon,{auth:{persistSession:false},
    global:{headers:{Authorization:authorization}}});
  const {data:{user},error:userError}=await caller.auth.getUser();
  if(userError||!user)return respondError('AUTH_REQUIRED',401);
  let body: Record<string,unknown>;
  try {
    const raw=await req.text();
    if(raw.length>4096)return respondError('REQUEST_TOO_LARGE',413);
    body=JSON.parse(raw);
    if(!body||typeof body!=='object'||Array.isArray(body))return respondError('INVALID_REQUEST',400);
  } catch{return respondError('INVALID_REQUEST',400);}
  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  if(body?.action==='status'){
    const configured=Boolean(resend && from);
    const {data:members,error:memberError}=await admin.from('erp_memberships')
      .select('restaurant_id,branch_id,linked_entity_id,role')
      .eq('user_id',user.id).eq('status','approved').eq('role','employee').limit(3);
    if(memberError)return respondError('ATTENDANCE_STATUS_UNAVAILABLE',503);
    if(!members || members.length!==1 || !members[0].linked_entity_id)
      return reply({ok:true,configured,eligible:false,reason:'APPROVED_EMPLOYEE_LINK_REQUIRED',max_minutes:30});
    const m=members[0];
    const {data:employee,error:empError}=await admin.from('employees')
      .select('id,restaurant_id,branch_id,email,is_active')
      .eq('restaurant_id',m.restaurant_id).eq('id',m.linked_entity_id).maybeSingle();
    if(empError)return respondError('ATTENDANCE_STATUS_UNAVAILABLE',503);
    if(!employee?.is_active || !employee?.branch_id || employee.branch_id!==m.branch_id)
      return reply({ok:true,configured,eligible:false,reason:'ASSIGNMENT_INVALID',max_minutes:30});
    const mail=String(employee.email||'').trim().toLowerCase();
    if(!mail || mail!==String(user.email||'').trim().toLowerCase() || !user.email_confirmed_at)
      return reply({ok:true,configured,eligible:false,reason:'EMPLOYEE_EMAIL_MISMATCH',max_minutes:30});
    const {data:geofence,error:geoError}=await admin.from('attendance_branch_geofences')
      .select('branch_id').eq('branch_id',employee.branch_id)
      .eq('restaurant_id',m.restaurant_id).maybeSingle();
    if(geoError)return respondError('ATTENDANCE_STATUS_UNAVAILABLE',503);
    return reply({ok:true,configured,eligible:Boolean(geofence?.branch_id),
      reason:geofence?.branch_id?null:'BRANCH_GEOFENCE_REQUIRED',max_minutes:30});
  }
  if(body?.action!=='issue'||!['in','out'].includes(String(body?.phase)))
    return respondError('INVALID_REQUEST',400);
  if(!resend||!from)return respondError('EMAIL_NOT_CONFIGURED',503);
  let employeeId=body.employee_id;
  if(!employeeId){
    const {data,error}=await admin.from('erp_memberships')
      .select('linked_entity_id').eq('user_id',user.id).eq('status','approved')
      .eq('role','employee').not('linked_entity_id','is',null).limit(2);
    if(error||!data||data.length!==1)return respondError('APPROVED_EMPLOYEE_LINK_REQUIRED',403);
    employeeId=data[0].linked_entity_id;
  }
  if(!isUuid(employeeId))return respondError('INVALID_EMPLOYEE',400);
  const code=generateCode();
  const {data:issue,error:issueError}=await admin.rpc('erp_attendance_email_issue_admin',{
    p_actor:user.id,p_employee:employeeId,p_action:body.phase,p_code:code,
  });
  if(issueError||!issue?.challenge_id||!issue?.recipient){
    const message=issueError?.message||'OTP_ISSUE_FAILED';
    const limited=message.includes('RATE_LIMITED');
    // Do not echo internal SQL diagnostics, employee details or code.
    const reason=limited?'OTP_RATE_LIMITED':message.includes('EMPLOYEE_EMAIL_REQUIRED')?
      'EMPLOYEE_EMAIL_REQUIRED':message.includes('VERIFIED_EMAIL_MISMATCH')?
      'EMPLOYEE_VERIFIED_EMAIL_MISMATCH':message.includes('GEOFENCE')?
      'BRANCH_GEOFENCE_REQUIRED':message.includes('NO_OPEN_SHIFT')?
      'NO_OPEN_SHIFT':message.includes('ATTENDANCE_ALREADY_STARTED')?
      'ATTENDANCE_ALREADY_STARTED':'OTP_ISSUE_DENIED';
    return respondError(reason,limited?429:400);
  }
  const challenge=issue.challenge_id as string;
  const mark=async (accepted:boolean)=>{
    const {error}=await admin.rpc('erp_attendance_email_delivery_admin',{
      p_challenge:challenge,p_accepted:accepted,
    });
    return !error;
  };
  const kind=issue.action==='in'?'Check In':'Check Out';
  const subject='BizCTRL · '+kind+' verification code';
  const message=[
    'BizCTRL — Attendance verification / رمز تأیید حضور / رمز التحقق من الحضور',
    '',
    'Your six-digit '+kind+' code: '+code,
    'رمز شش‌رقمی ورود/خروج: '+code,
    'رمز الدخول / الخروج: '+code,
    '',
    'Expires in 30 minutes. Single use. Do not forward.',
    'اعتبار: ۳۰ دقیقه، فقط یک‌بار. / صالح لمدة ٣٠ دقيقة ولمرة واحدة.',
    'You must also be physically at the assigned branch with accurate GPS.',
    'If you did not request this, ignore it.',
  ].join('\n');
  try{
    const response=await fetch('https://api.resend.com/emails',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(18000),
      headers:{'Authorization':'Bearer '+resend,'Content-Type':'application/json',
        'Idempotency-Key':'attendance-'+challenge},
      body:JSON.stringify({from,to:[issue.recipient],subject,text:message}),
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.id){
      await mark(false);
      return respondError('EMAIL_PROVIDER_REJECTED',502);
    }
    if(!await mark(true))return respondError('OTP_DELIVERY_COMMIT_FAILED',503);
    return reply({ok:true,sent:true,masked_email:issue.masked_email,
      expires_at:issue.expires_at,valid_for_seconds:1800,
      provider_accepted:true,delivery_confirmed:false});
  }catch{
    await mark(false);
    return respondError('EMAIL_UNAVAILABLE',502);
  }
});
