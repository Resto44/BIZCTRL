import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = Deno.env.get("APP_URL") ?? "https://mybizctrl.site";

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin === APP_ORIGIN ? origin : APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
});

function response(code: string, status: number, headers: HeadersInit, payload: Record<string, boolean> = {}) {
  return new Response(JSON.stringify({ ...payload, error: code }), { status, headers });
}

function bearerToken(authorization: string) {
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const headers = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (origin !== APP_ORIGIN) return response("CANONICAL_ORIGIN_REQUIRED", 403, headers);
  if (req.method !== "POST") return response("METHOD_NOT_ALLOWED", 405, headers);

  const authorization = req.headers.get("Authorization") ?? "";
  const accessToken = bearerToken(authorization);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !accessToken) {
    return response("MFA_RECOVERY_SERVICE_UNAVAILABLE", 503, headers);
  }

  try {
    const body = await req.json().catch(() => null) as { action?: unknown; newPassword?: unknown; redirectTo?: unknown } | null;
    const action = typeof body?.action === "string" ? body.action : "";
    // The anon key identifies the public project API only. It is never used as
    // caller authentication: this exact received bearer token is verified by
    // Supabase Auth, and all subsequent RPCs execute under that verified JWT.
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await caller.auth.getUser(accessToken);
    if (userError || !userData.user) {
      console.warn(JSON.stringify({ event: 'platform_owner_mfa_recovery_auth_rejected', reason: userError?.code ?? userError?.name ?? 'unknown' }));
      return response("AUTHENTICATED_OWNER_SESSION_REQUIRED", 401, headers);
    }

    const { data: ownerSession, error: ownerSessionError } = await caller.rpc("platform_owner_session_snapshot");
    if (ownerSessionError || !ownerSession?.authenticated || !ownerSession?.authorized || !ownerSession?.mfa_required || ownerSession?.mfa_verified) {
      return response("PLATFORM_OWNER_MFA_RECOVERY_NOT_AUTHORIZED", 403, headers);
    }

    if (action === "request") {
      const redirectTo = typeof body?.redirectTo === "string" ? body.redirectTo : "";
      if (redirectTo !== `${APP_ORIGIN}/platform-owner/recover`) {
        return response("CANONICAL_REDIRECT_REQUIRED", 403, headers);
      }

      // This records the recent, AAL1 password-authenticated owner session and
      // captures the still-active verified factor IDs for the later safe swap.
            const { error: prepareError } = await caller.rpc("platform_owner_prepare_mfa_recovery");
      if (prepareError) {
        console.warn(JSON.stringify({ event: 'platform_owner_mfa_recovery_prepare_rejected', reason: prepareError.code ?? prepareError.name ?? 'unknown' }));
        return response("MFA_RECOVERY_REQUEST_NOT_AUTHORIZED", 403, headers);
      }
      // The recipient is sourced only from the server-verified Auth user above;
      // neither the email nor the recovery link is logged or accepted from input.
      const { error: emailError } = await caller.auth.resetPasswordForEmail(userData.user.email ?? "", { redirectTo });
      if (emailError) {
        console.warn(JSON.stringify({ event: 'platform_owner_mfa_recovery_mail_rejected', reason: emailError.code ?? emailError.name ?? 'unknown' }));
        return response("MFA_RECOVERY_EMAIL_UNAVAILABLE", 503, headers);
      }
      console.info(JSON.stringify({ event: 'platform_owner_mfa_recovery_mail_accepted_by_auth' }));
      return new Response(JSON.stringify({ requested: true }), { status: 200, headers });
    }

    if (action === "complete") {
      const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
      if (newPassword.length < 12) return response("MFA_RECOVERY_PASSWORD_POLICY", 400, headers);

      // `begin` verifies the current JWT is the newest recovery-email session,
      // records that exact session ID, and rejects stale, reused, normal, or
      // unrelated AAL1 sessions before any privileged write occurs.
      const { data: recovery, error: beginError } = await caller.rpc("platform_owner_begin_mfa_recovery");
      const recoveryId = typeof recovery?.recovery_id === "string" ? recovery.recovery_id : "";
      if (beginError || !recoveryId) return response("MFA_RECOVERY_SESSION_NOT_AUTHORIZED", 403, headers);

      const service = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: updateError } = await service.auth.admin.updateUserById(userData.user.id, { password: newPassword });
      if (updateError) return response("MFA_RECOVERY_PASSWORD_UPDATE_FAILED", 409, headers);

      // The signed recovery JWT remains the authorization witness. The ledger
      // retains only its UUID and a timestamp; it never stores the JWT itself.
      const { data: marked, error: markError } = await caller.rpc("platform_owner_mark_mfa_recovery_password_updated", {
        p_recovery_id: recoveryId,
      });
      if (markError || !marked?.authorized) return response("MFA_RECOVERY_STATE_TRANSITION_FAILED", 409, headers);

      return new Response(JSON.stringify({ authorized: true }), { status: 200, headers });
    }

    return response("MFA_RECOVERY_ACTION_REQUIRED", 400, headers);
  } catch {
    return response("MFA_RECOVERY_UNAVAILABLE", 500, headers);
  }
});
