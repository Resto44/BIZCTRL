import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = Deno.env.get("APP_URL") ?? "https://mybizctrl.site";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin === APP_ORIGIN ? origin : APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
});

function fail(code: string, status = 400, headers?: HeadersInit) {
  return new Response(JSON.stringify({ error: code }), { status, headers: headers ?? { "Content-Type": "application/json" } });
}

function randomReplacementPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return `${crypto.randomUUID()}-${btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "")}`;
}

function bearerToken(authorization: string) {
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const headers = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (origin !== APP_ORIGIN) return fail("CANONICAL_ORIGIN_REQUIRED", 403, headers);
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405, headers);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization") ?? "";
    const accessToken = bearerToken(authorization);
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !accessToken) {
      return fail("MFA_RECOVERY_SERVICE_UNAVAILABLE", 503, headers);
    }

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return fail("UNAUTHENTICATED", 401, headers);

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const body = await req.json().catch(() => null) as { action?: unknown; newPassword?: unknown } | null;

    if (body?.action === "initiate") {
      // This RPC requires an active Platform Owner AAL1 password session and
      // creates a single 15-minute request before any recovery email is sent.
      const { error: prepareError } = await caller.rpc("platform_owner_prepare_mfa_recovery");
      if (prepareError) return fail("MFA_RECOVERY_INITIATION_NOT_AUTHORIZED", 403, headers);

      // A random replacement password and global session revocation eliminate
      // every pre-email password session. The subsequent signed recovery-link
      // session is therefore the only session eligible for password replacement.
      const { error: invalidatePasswordError } = await service.auth.admin.updateUserById(
        userData.user.id,
        { password: randomReplacementPassword() },
      );
      if (invalidatePasswordError) return fail("MFA_RECOVERY_SESSION_INVALIDATION_FAILED", 409, headers);

      const { error: revokeSessionsError } = await service.auth.admin.signOut(accessToken, "global");
      if (revokeSessionsError) return fail("MFA_RECOVERY_SESSION_REVOCATION_FAILED", 409, headers);

      return new Response(JSON.stringify({ initiated: true }), { status: 200, headers });
    }

    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
    if (newPassword.length < 12) return fail("MFA_RECOVERY_PASSWORD_POLICY", 400, headers);

    // The RPC verifies the active owner, exact email-link session binding,
    // server-side recovery-email time, signed session time, and single-use state.
    const { data: recovery, error: recoveryError } = await caller.rpc("platform_owner_begin_mfa_recovery");
    const recoveryId = typeof recovery?.recovery_id === "string" ? recovery.recovery_id : "";
    if (recoveryError || !UUID_PATTERN.test(recoveryId)) return fail("MFA_RECOVERY_NOT_AUTHORIZED", 403, headers);

    // Native updateUser() is correctly AAL2-gated when MFA exists. This privileged
    // update is reached only after the recovery-link session has passed every gate.
    const { error: updateError } = await service.auth.admin.updateUserById(userData.user.id, { password: newPassword });
    if (updateError) return fail("MFA_RECOVERY_PASSWORD_UPDATE_FAILED", 409, headers);

    const { data: marked, error: markError } = await caller.rpc("platform_owner_mark_mfa_recovery_password_updated", {
      p_recovery_id: recoveryId,
    });
    if (markError || marked?.recovery_id !== recoveryId) return fail("MFA_RECOVERY_AUDIT_FAILED", 409, headers);

    return new Response(JSON.stringify({ recoveryId, expiresAt: recovery.expires_at }), { status: 200, headers });
  } catch {
    return fail("MFA_RECOVERY_UNAVAILABLE", 500, headers);
  }
});
