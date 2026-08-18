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
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
      return fail("MFA_RECOVERY_SERVICE_UNAVAILABLE", 503, headers);
    }

    const body = await req.json().catch(() => null) as { newPassword?: unknown } | null;
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
    if (newPassword.length < 12) return fail("MFA_RECOVERY_PASSWORD_POLICY", 400, headers);

    // Verify the bearer token before using any privileged API. The corresponding
    // RPC enforces active Platform Owner status, AAL1, recovery AMR, session ID,
    // 15-minute expiry, and the single-use authorized request state.
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return fail("UNAUTHENTICATED", 401, headers);

    const { data: recovery, error: recoveryError } = await caller.rpc("platform_owner_begin_mfa_recovery");
    const recoveryId = typeof recovery?.recovery_id === "string" ? recovery.recovery_id : "";
    if (recoveryError || !UUID_PATTERN.test(recoveryId)) return fail("MFA_RECOVERY_NOT_AUTHORIZED", 403, headers);

    // Supabase Auth blocks updateUser() from an AAL1 recovery session when MFA is
    // present. Privileged updateUserById() is therefore limited to this endpoint,
    // after the recovery JWT and database state have passed the checks above.
    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
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
