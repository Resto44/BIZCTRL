import { createClient } from 'npm:@supabase/supabase-js@2.106.1';

// Sends an existing owner-issued customer invitation; this is NOT the Auth confirmation email.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};
const respond = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
const fail = (code: string, status: number) => respond({ ok: false, error: code }, status);
const uuid = (value: unknown) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const isToken = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
const sha256Hex = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 405);

  const authorization = req.headers.get('Authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) return fail('AUTH_REQUIRED', 401);

  let input: { customer_id?: unknown; token?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > 2048) return fail('REQUEST_TOO_LARGE', 413);
    input = JSON.parse(raw);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error();
  } catch { return fail('INVALID_REQUEST', 400); }

  if (!uuid(input.customer_id) || !isToken(input.token))
    return fail('INVALID_INVITATION', 400);

  const url = Deno.env.get('SUPABASE_URL') || '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !anon || !service) return fail('SERVER_NOT_CONFIGURED', 503);

  const caller = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return fail('AUTH_REQUIRED', 401);

  // Never trust an email, business ID or destination URL supplied by the browser.
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: customer, error: customerError } = await admin.from('customers')
    .select('id,restaurant_id,name,is_active').eq('id', input.customer_id).maybeSingle();
  if (customerError || !customer || !customer.is_active) return fail('INVITATION_NOT_FOUND', 404);

  const { data: owner, error: ownerError } = await admin.from('erp_memberships')
    .select('id').eq('user_id', user.id).eq('restaurant_id', customer.restaurant_id)
    .eq('role', 'owner').eq('status', 'approved').limit(1).maybeSingle();
  if (ownerError || !owner) return fail('OWNER_ONLY', 403);

  const { data: invitation, error: invitationError } = await admin.from('customer_portal_access')
    .select('customer_id,invited_email,token_hash,expires_at,active')
    .eq('customer_id', customer.id).maybeSingle();
  if (invitationError || !invitation) return fail('INVITATION_NOT_FOUND', 404);
  if (invitation.active || !invitation.expires_at || Date.parse(invitation.expires_at) <= Date.now())
    return fail('INVITATION_NOT_PENDING', 409);
  if (!invitation.invited_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitation.invited_email))
    return fail('INVITATION_HAS_NO_EMAIL', 400);
  // Constant-time comparison isn't essential for the 256-bit one-time token, but avoid
  // returning either hash or the token in any logs/errors.
  const digest = await sha256Hex(input.token);
  if (digest !== invitation.token_hash) return fail('INVALID_INVITATION_TOKEN', 403);

  const apiKey = Deno.env.get('RESEND_API_KEY') || '';
  const from = Deno.env.get('INVITATION_EMAIL_FROM') || Deno.env.get('REPORT_EMAIL_FROM') || '';
  if (!apiKey || !from) return fail('INVITATION_EMAIL_NOT_CONFIGURED', 503);

  const link = 'https://mybizctrl.site/customer-portal#invite=' + encodeURIComponent(input.token);
  const body = [
    'BizControl — Customer portal invitation',
    '',
    'Hello ' + (customer.name || 'customer') + ',',
    'Your business has invited you to view your purchases, payments, and statement in BizControl.',
    'Open your secure invitation link:',
    link,
    '',
    'The link is single-use and expires on ' + new Date(invitation.expires_at).toISOString() + '.',
    'Sign in or create an account with the email address this invitation was sent to.',
    'If you create an account, verify your email using the SEPARATE confirmation email before activating.',
    'After verifying, reopen this invitation link and press Activate invitation.',
    'Do not forward this link. If you did not expect it, ignore this message.',
    '',
    'دعوت مشتری بیزکنترول: لینک بالا را باز کنید و با همین ایمیل حساب بسازید یا وارد شوید. تأیید ایمیل جداگانه ارسال می‌شود.',
    'دعوة العميل من BizControl: افتح الرابط وسجّل بنفس البريد الإلكتروني. رسالة تأكيد البريد تصل بشكل منفصل.',
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(18000),
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'customer-invite-' + digest.slice(0, 40),
      },
      body: JSON.stringify({
        from, to: [invitation.invited_email], subject: 'BizControl — Customer portal invitation',
        text: body,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.id) return fail('EMAIL_PROVIDER_REJECTED', 502);
    return respond({ ok: true, provider_accepted: true, delivery_confirmed: false });
  } catch {
    return fail('EMAIL_PROVIDER_UNAVAILABLE', 502);
  }
});
