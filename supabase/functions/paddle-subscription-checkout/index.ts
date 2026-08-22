import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = Deno.env.get("APP_URL") ?? "https://mybizctrl.site";
const PADDLE_ENVIRONMENT = Deno.env.get("PADDLE_ENVIRONMENT") ?? "production";
const PADDLE_API_URL = "https://api.paddle.com";
const TRANSACTION_ID_PATTERN = /^txn_[a-z\d]{26}$/i;

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin === APP_ORIGIN ? origin : APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
});

function fail(code: string, status = 400, headers: HeadersInit = {}) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });

  try {
    if (PADDLE_ENVIRONMENT !== "production") return fail("PADDLE_LIVE_ONLY", 503, headers);

    const paddleApiKey = Deno.env.get("PADDLE_API_KEY")?.trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization") ?? "";
    if (!paddleApiKey) return fail("PADDLE_LIVE_NOT_CONFIGURED", 503, headers);
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) return fail("BILLING_SERVICE_NOT_CONFIGURED", 503, headers);

    const body = await req.json().catch(() => null) as { planId?: unknown } | null;
    const planId = typeof body?.planId === "string" ? body.planId.trim() : "";
    if (!planId) return fail("PAID_PLAN_REQUIRED", 400, headers);

    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return fail("UNAUTHENTICATED", 401, headers);

    // This guarded RPC owns tenant resolution, plan validation, the local pending
    // payment record, and state transition. Client data never determines a price
    // or organization reference.
    const { data: context, error: contextError } = await caller.rpc("paddle_create_checkout_context", { p_plan_id: planId });
    if (contextError || !context?.payment_id || !context?.paddle_price_id) {
      return fail(contextError?.message ?? "PADDLE_CHECKOUT_CONTEXT_FAILED", 400, headers);
    }

    if (context.transaction_id && TRANSACTION_ID_PATTERN.test(context.transaction_id)) {
      return new Response(JSON.stringify({ transactionId: context.transaction_id, reused: true }), { status: 200, headers });
    }

    const service = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const transactionResponse = await fetch(`${PADDLE_API_URL}/transactions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paddleApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        collection_mode: "automatic",
        items: [{ price_id: context.paddle_price_id, quantity: 1 }],
        custom_data: {
          bizctrl_payment_id: context.payment_id,
          bizctrl_restaurant_id: context.restaurant_id,
          bizctrl_user_id: userData.user.id,
          bizctrl_plan_id: context.plan_id,
          bizctrl_environment: "production",
        },
      }),
    });
    const transactionBody = await transactionResponse.json().catch(() => null) as { data?: { id?: string } } | null;
    const transactionId = transactionBody?.data?.id ?? "";
    if (!transactionResponse.ok || !TRANSACTION_ID_PATTERN.test(transactionId)) {
      console.error("[paddle-subscription-checkout] transaction creation failed", transactionResponse.status);
      return fail("PADDLE_TRANSACTION_CREATE_FAILED", 502, headers);
    }

    const { error: linkError } = await service.rpc("paddle_link_checkout_transaction", {
      p_payment_id: context.payment_id,
      p_transaction_id: transactionId,
    });
    if (linkError) {
      console.error("[paddle-subscription-checkout] transaction link failed", linkError.message);
      return fail("PADDLE_TRANSACTION_LINK_FAILED", 500, headers);
    }

    return new Response(JSON.stringify({ transactionId, reused: false }), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PADDLE_CHECKOUT_UNAVAILABLE";
    console.error("[paddle-subscription-checkout]", message);
    return fail(message === "UNAUTHENTICATED" ? message : "PADDLE_CHECKOUT_UNAVAILABLE", message === "UNAUTHENTICATED" ? 401 : 500, headers);
  }
});
