import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CANONICAL_ORIGIN = "https://mybizctrl.site";

const headersFor = (origin: string | null): HeadersInit => ({
  "Access-Control-Allow-Origin": origin === CANONICAL_ORIGIN ? origin : CANONICAL_ORIGIN,
  "Access-Control-Allow-Headers": "content-type, x-platform-owner-provision-nonce",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
});

const response = (status: number, error: string, headers: HeadersInit) =>
  new Response(JSON.stringify({ error }), { status, headers });

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function temporaryServerPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const encoded = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "");
  return `P!${encoded}`;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const headers = headersFor(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (origin !== CANONICAL_ORIGIN) return response(403, "CANONICAL_ORIGIN_REQUIRED", headers);
  if (req.method !== "POST") return response(405, "METHOD_NOT_ALLOWED", headers);

  const nonce = req.headers.get("x-platform-owner-provision-nonce") ?? "";
  if (!/^[0-9a-f]{64}$/i.test(nonce)) return response(403, "CLEAN_PROVISION_AUTHORIZATION_REQUIRED", headers);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return response(503, "CLEAN_PROVISION_UNAVAILABLE", headers);

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const nonceHash = await sha256Hex(nonce.toLowerCase());
  const { data: claim, error: claimError } = await service.rpc("platform_owner_claim_clean_auth_rebind", {
    p_invocation_nonce_hash: nonceHash,
  });
  const jobId = typeof claim?.job_id === "string" ? claim.job_id : "";
  const oldUserId = typeof claim?.old_user_id === "string" ? claim.old_user_id : "";
  const targetEmail = typeof claim?.target_email === "string" ? claim.target_email : "";
  const archivedOldEmail = typeof claim?.archived_old_email === "string" ? claim.archived_old_email : "";
  if (claimError || !jobId || !oldUserId || !targetEmail || !archivedOldEmail) {
    return response(409, "CLEAN_PROVISION_JOB_UNAVAILABLE", headers);
  }

  let oldEmailArchived = false;
  let newUserId = "";
  try {
    const { error: archiveError } = await service.auth.admin.updateUserById(oldUserId, {
      email: archivedOldEmail,
      email_confirm: true,
    });
    if (archiveError) throw new Error("CLEAN_PROVISION_ARCHIVE_FAILED");
    oldEmailArchived = true;

    const { data: created, error: createError } = await service.auth.admin.createUser({
      email: targetEmail,
      password: temporaryServerPassword(),
      email_confirm: true,
      app_metadata: { platform_owner_clean_provisioning: true },
      user_metadata: { platform_owner_clean_provisioning_nonce: nonce },
    });
    newUserId = created.user?.id ?? "";
    if (createError) throw new Error(`CLEAN_PROVISION_CREATE_${createError.code ?? "FAILED"}`);
    if (!newUserId) throw new Error("CLEAN_PROVISION_CREATE_NO_USER");

    // The nonce is used only by the insert trigger. Null it immediately before
    // the setup email is sent so it cannot persist in the new user's metadata.
    const { error: ticketCleanupError } = await service.auth.admin.updateUserById(newUserId, {
      user_metadata: { platform_owner_clean_provisioning_nonce: null },
    });
    if (ticketCleanupError) throw new Error("CLEAN_PROVISION_TICKET_CLEANUP_FAILED");

    const { error: bindError } = await service.rpc("platform_owner_bind_clean_auth_rebind", {
      p_job_id: jobId,
      p_new_user_id: newUserId,
      p_archived_old_email: archivedOldEmail,
    });
    if (bindError) throw new Error(`CLEAN_PROVISION_BIND_${bindError.code ?? "FAILED"}`);

    const { error: emailError } = await service.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: `${CANONICAL_ORIGIN}/platform-owner/new-owner-setup`,
    });
    if (emailError) {
      await service.rpc("platform_owner_record_clean_auth_setup_delivery", {
        p_job_id: jobId,
        p_dispatched: false,
        p_failure_code: "AUTH_SETUP_EMAIL_UNAVAILABLE",
      });
      return response(503, "CLEAN_PROVISION_SETUP_EMAIL_UNAVAILABLE", headers);
    }

    const { error: deliveredError } = await service.rpc("platform_owner_record_clean_auth_setup_delivery", {
      p_job_id: jobId,
      p_dispatched: true,
      p_failure_code: null,
    });
    if (deliveredError) return response(409, "CLEAN_PROVISION_DELIVERY_RECORD_FAILED", headers);

    return new Response(JSON.stringify({ accepted: true }), { status: 202, headers });
  } catch (error) {
    if (newUserId) {
      await service.auth.admin.updateUserById(newUserId, {
        email: `failed-clean-owner-${newUserId.replace(/-/g, "")}@invalid.mybizctrl.site`,
        email_confirm: true,
      });
    }
    if (oldEmailArchived) {
      await service.auth.admin.updateUserById(oldUserId, {
        email: targetEmail,
        email_confirm: true,
      });
    }
    if (jobId) {
      const code = error instanceof Error ? error.message : "CLEAN_PROVISION_FAILED";
      await service.rpc("platform_owner_mark_clean_auth_rebind_failed", {
        p_job_id: jobId,
        p_failure_code: code,
      });
    }
    return response(409, "CLEAN_PROVISION_FAILED", headers);
  }
});
