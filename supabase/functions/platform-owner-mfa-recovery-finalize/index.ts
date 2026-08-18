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

    const body = await req.json().catch(() => null) as { recoveryId?: unknown; newFactorId?: unknown } | null;
    const recoveryId = typeof body?.recoveryId === "string" ? body.recoveryId.trim() : "";
    const newFactorId = typeof body?.newFactorId === "string" ? body.newFactorId.trim() : "";
    if (!UUID_PATTERN.test(recoveryId) || !UUID_PATTERN.test(newFactorId)) {
      return fail("MFA_RECOVERY_REQUEST_REQUIRED", 400, headers);
    }

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return fail("UNAUTHENTICATED", 401, headers);

    // The RPC requires the same recovery session plus a freshly verified TOTP
    // assertion. It does not reveal factor identifiers to the browser.
    const { data: claim, error: claimError } = await caller.rpc("platform_owner_claim_mfa_recovery", {
      p_recovery_id: recoveryId,
      p_new_factor_id: newFactorId,
    });
    if (claimError || !claim?.recovery_id || !Array.isArray(claim?.prior_factor_ids)) {
      return fail("MFA_RECOVERY_NOT_AUTHORIZED", 403, headers);
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: factorData, error: factorError } = await service.auth.admin.mfa.listFactors({ userId: userData.user.id });
    if (factorError || !factorData?.factors) return fail("MFA_FACTOR_LOOKUP_FAILED", 500, headers);

    // Use the newest verified canonical-name factor as the recovery replacement.
    // It must not be a factor recorded before recovery began.
    const priorFactorIds = new Set<string>(claim.prior_factor_ids.filter((id: unknown): id is string => typeof id === "string"));
    const replacement = factorData.factors.find((factor) => (
      factor.id === newFactorId
      && factor.factor_type === "totp"
      && factor.status === "verified"
      && !priorFactorIds.has(factor.id)
    ));
    if (!replacement) return fail("MFA_RECOVERY_NEW_FACTOR_UNVERIFIED", 409, headers);

    for (const factorId of priorFactorIds) {
      const { error: deleteError } = await service.auth.admin.mfa.deleteFactor({ id: factorId, userId: userData.user.id });
      if (deleteError) return fail("MFA_RECOVERY_RETIRE_FAILED", 500, headers);
    }

    const { error: completionError } = await service
      .from("platform_owner_mfa_recovery_requests")
      .update({ status: "completed", new_factor_id: replacement.id, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", recoveryId)
      .eq("user_id", userData.user.id)
      .eq("status", "finalizing");
    if (completionError) return fail("MFA_RECOVERY_AUDIT_FAILED", 500, headers);

    await service.from("platform_owner_activity_logs").insert({
      actor_user_id: userData.user.id,
      action: "mfa_recovery_factor_replaced",
      resource_type: "platform_owner_mfa",
      resource_id: recoveryId,
      details: { canonical_origin: APP_ORIGIN, replaced_factor_count: priorFactorIds.size },
    });

    // Admin factor deletion invalidates active sessions. The browser must sign in
    // again and challenge the newly verified authenticator before portal access.
    return new Response(JSON.stringify({ recovered: true, reauthenticate: true }), { status: 200, headers });
  } catch {
    console.error("[platform-owner-mfa-recovery-finalize] failed");
    return fail("MFA_RECOVERY_UNAVAILABLE", 500, headers);
  }
});
