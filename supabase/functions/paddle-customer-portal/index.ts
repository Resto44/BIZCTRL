import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = Deno.env.get("APP_URL") ?? "https://mybizctrl.site";
const PADDLE_ENVIRONMENT = Deno.env.get("PADDLE_ENVIRONMENT") ?? "production";
const PADDLE_API_URL = "https://api.paddle.com";

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin === APP_ORIGIN ? origin : APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
});

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });

  try {
    if (PADDLE_ENVIRONMENT !== "production") throw new Error("PADDLE_LIVE_ONLY");

    const paddleApiKey = Deno.env.get("PADDLE_API_KEY")?.trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authorization = req.headers.get("Authorization") ?? "";
    if (!paddleApiKey) throw new Error("PADDLE_LIVE_NOT_CONFIGURED");
    if (!supabaseUrl || !anonKey || !authorization) throw new Error("BILLING_SERVICE_NOT_CONFIGURED");

    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) throw new Error("UNAUTHENTICATED");

    const { data: context, error: contextError } = await caller.rpc("paddle_customer_portal_context");
    if (contextError || !context?.customer_id || !context?.subscription_id) {
      throw new Error(contextError?.message ?? "PADDLE_CUSTOMER_PORTAL_NOT_AVAILABLE");
    }

    const portalResponse = await fetch(`${PADDLE_API_URL}/customers/${context.customer_id}/portal-sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paddleApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subscription_ids: [context.subscription_id] }),
    });
    const portal = await portalResponse.json().catch(() => null) as { data?: { urls?: { general?: { overview?: string } } } } | null;
    const url = portal?.data?.urls?.general?.overview;
    if (!portalResponse.ok || !url || !/^https:\/\//.test(url)) throw new Error("PADDLE_CUSTOMER_PORTAL_CREATE_FAILED");

    return new Response(JSON.stringify({ url }), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PADDLE_CUSTOMER_PORTAL_UNAVAILABLE";
    const status = message === "UNAUTHENTICATED" ? 401 : message.includes("NOT_CONFIGURED") || message === "PADDLE_LIVE_ONLY" ? 503 : 400;
    console.error("[paddle-customer-portal]", message);
    return new Response(JSON.stringify({ error: message }), { status, headers });
  }
});
