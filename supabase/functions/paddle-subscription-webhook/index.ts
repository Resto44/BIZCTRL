import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PADDLE_ENVIRONMENT = Deno.env.get("PADDLE_ENVIRONMENT") ?? "sandbox";
const MAX_WEBHOOK_AGE_SECONDS = 300;
const encoder = new TextEncoder();

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function parseSignature(header: string) {
  const fields = header.split(";").map((entry) => entry.trim().split("=", 2));
  const timestamp = fields.find(([key]) => key === "ts")?.[1] ?? "";
  const signatures = fields.filter(([key]) => key === "h1").map(([, value]) => value).filter((value): value is string => Boolean(value));
  return { timestamp, signatures };
}

async function verifyPaddleSignature(rawBody: string, signatureHeader: string, secret: string) {
  const { timestamp, signatures } = parseSignature(signatureHeader);
  if (!/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > MAX_WEBHOOK_AGE_SECONDS) return false;

  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}:${rawBody}`));
  const expected = Array.from(new Uint8Array(signed)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((signature) => safeEqual(signature, expected));
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    if (PADDLE_ENVIRONMENT !== "sandbox") return json(503, { error: "PADDLE_SANDBOX_ONLY" });

    const webhookSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET")?.trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const signature = req.headers.get("Paddle-Signature") ?? req.headers.get("paddle-signature") ?? "";
    if (!webhookSecret || !supabaseUrl || !serviceRoleKey || !signature) return json(503, { error: "PADDLE_WEBHOOK_NOT_CONFIGURED" });

    const rawBody = await req.text();
    if (!(await verifyPaddleSignature(rawBody, signature, webhookSecret))) return json(401, { error: "invalid_signature" });

    const event = JSON.parse(rawBody) as {
      event_id?: unknown;
      event_type?: unknown;
      occurred_at?: unknown;
      data?: unknown;
    };
    if (typeof event.event_id !== "string" || typeof event.event_type !== "string" || !event.data || typeof event.data !== "object") {
      return json(400, { error: "PADDLE_EVENT_INVALID" });
    }

    const supported = new Set([
      "subscription.created",
      "subscription.trialing",
      "subscription.activated",
      "subscription.updated",
      "subscription.canceled",
      "subscription.past_due",
      "subscription.paused",
      "subscription.resumed",
      "transaction.paid",
      "transaction.completed",
      "transaction.payment_failed",
      "transaction.past_due",
      "transaction.refunded",
    ]);
    if (!supported.has(event.event_type)) return json(200, { received: true, ignored: true });

    const occurredAt = typeof event.occurred_at === "string" && Number.isFinite(Date.parse(event.occurred_at)) ? event.occurred_at : new Date().toISOString();
    const service = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await service.rpc("paddle_apply_webhook_event", {
      p_event_id: event.event_id,
      p_event_type: event.event_type,
      p_occurred_at: occurredAt,
      p_data: event.data,
    });
    if (error) {
      console.error("[paddle-subscription-webhook] application failed", error.message);
      return json(500, { error: "PADDLE_EVENT_PROCESSING_FAILED" });
    }

    return json(200, { received: true, result: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PADDLE_WEBHOOK_PROCESSING_FAILED";
    console.error("[paddle-subscription-webhook]", message);
    return json(400, { error: "PADDLE_WEBHOOK_PROCESSING_FAILED" });
  }
});
