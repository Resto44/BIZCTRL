import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const APP_ORIGIN = Deno.env.get("APP_URL") ?? "https://mybizctrl.site";

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin === APP_ORIGIN ? origin : APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
});

Deno.serve((req: Request) => {
  const headers = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  return new Response(JSON.stringify({ error: "MFA_RECOVERY_FLOW_RETIRED" }), { status: 410, headers });
});
