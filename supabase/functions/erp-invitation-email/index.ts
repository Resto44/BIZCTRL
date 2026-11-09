import { createClient } from 'npm:@supabase/supabase-js@2.106.1';

// An owner-approved ERP invitation is not a Supabase signup confirmation.
// This function only delivers the original, expiring invitation URL by email.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};
const answer = (body: Record<string, unknown>, status=200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type':'application/json', 'Cache-Control':'no-store' },
});
const reject = (error: string, status: number) => answer({ ok:false, error }, status);
const uuid = (value: unknown) => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const tokenPattern = /^[0-9a-f]{64}$/i;

async function sha256Hex(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method==='OPTIONS') return new Response('ok', {headers:cors});
  if (req.method!=='POST') return reject('METHOD_NOT_ALLOWED',405);
  if (Number(req.headers.get('content-length')||0)>2048) return reject('REQUEST_TOO_LARGE',413);
  const authorization=req.headers.get('Authorization')||'';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return reject('AUTH_REQUIRED',401);

  const url=Deno.env.get('SUPABASE_URL')||'';
  const anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if (!url||!anon||!service) return reject('SERVER_NOT_CONFIGURED',503);
  const caller=createClient(url,anon,{
    auth:{persistSession:false,autoRefreshToken:false}, global:{headers:{Authorization:authorization}},
  });
  const {data:{user},error:userError}=await caller.auth.getUser();
  if (userError||!user) return reject('AUTH_REQUIRED',401);

  let body: Record<string, unknown>;
  try {
    const raw=await req.text();
    if (raw.length>2048) return reject('REQUEST_TOO_LARGE',413);
    body=JSON.parse(raw);
    if (!body || Array.isArray(body) || typeof body!=='object') throw Error();
  } catch { return reject('INVALID_REQUEST',400); }
  const invitationId=body.invitation_id;
  const token=body.token;
  if (!uuid(invitationId) || typeof token!=='string' || !tokenPattern.test(token))
    return reject('INVALID_INVITATION',400);

  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:invite,error:readError}=await admin.from('erp_invitations')
    .select('id,token_hash,email,role,full_name,restaurant_id,branch_id,status,expires_at')
    .eq('id',invitationId).maybeSingle();
  if (readError || !invite) return reject('INVITATION_NOT_FOUND',404);

  // Do not allow a signed-in staff member to submit someone else's invite,
  // email address, tenant, URL, or role. Every field comes from the database.
  const {data:owner,error:ownerError}=await admin.from('erp_memberships')
    .select('id').eq('user_id',user.id).eq('restaurant_id',invite.restaurant_id)
    .eq('role','owner').eq('status','approved').limit(1).maybeSingle();
  if (ownerError || !owner) return reject('OWNER_ONLY',403);
  if (invite.status!=='pending' || !invite.expires_at ||
      Date.parse(invite.expires_at)<=Date.now()) return reject('INVITATION_NOT_PENDING',409);
  if (!invite.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.email))
    return reject('INVITATION_HAS_NO_EMAIL',400);

  const tokenHash=await sha256Hex(token);
  if (tokenHash!==invite.token_hash) return reject('INVALID_INVITATION_TOKEN',403);

  const resend=Deno.env.get('RESEND_API_KEY')||'';
  const from=Deno.env.get('INVITATION_EMAIL_FROM')||Deno.env.get('REPORT_EMAIL_FROM')||'';
  if (!resend||!from) return reject('INVITATION_EMAIL_NOT_CONFIGURED',503);

  const activationUrl='https://mybizctrl.site/erp-register?token='+encodeURIComponent(token);
  const roleName=String(invite.role||'staff').replace(/_/g,' ');
  const bodyText=[
    'BizCTRL — Secure ERP invitation',
    '',
    'Hello '+String(invite.full_name||'team member')+',',
    'You have been invited to join BizCTRL as '+roleName+'.',
    '',
    'Activate your account here:',
    activationUrl,
    '',
    'This link is single-use and expires on '+new Date(invite.expires_at).toISOString()+'.',
    'After opening it, create your account and verify your email address to sign in.',
    'Do not forward this invitation. If you did not expect it, ignore this message.',
    '',
    'دعوت‌نامهٔ بیزکنترول: لینک بالا را باز کنید، ثبت‌نام کنید و ایمیل خود را تأیید نمایید.',
    'دعوة BizCTRL: افتح الرابط، أنشئ حسابك، ثم أكّد بريدك الإلكتروني.',
  ].join('\n');

  try {
    const response=await fetch('https://api.resend.com/emails',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(18000),
      headers:{Authorization:'Bearer '+resend,'Content-Type':'application/json',
        'Idempotency-Key':'erp-invitation-'+invite.id},
      body:JSON.stringify({
        from,to:[invite.email],subject:'BizCTRL — '+roleName+' invitation',
        text:bodyText,
      }),
    });
    const result=await response.json().catch(()=>({}));
    if (!response.ok || !result?.id) return reject('EMAIL_PROVIDER_REJECTED',502);
    return answer({ok:true,provider_accepted:true,delivery_confirmed:false});
  } catch {
    return reject('EMAIL_PROVIDER_UNAVAILABLE',502);
  }
});
