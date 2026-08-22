import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Paddle } from "npm:@paddle/paddle-node-sdk@3.10.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const PADDLE_ENVIRONMENT = Deno.env.get("PADDLE_ENVIRONMENT") ?? "production";

type RoutedEvent = {
  eventId: string;
  eventType: string;
  occurredAt: string;
  data: Record<string, unknown>;
};

const subscriptionAndTransactionEvents = new Set([
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

const customerEvents = new Set(["customer.created", "customer.updated"]);

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function asRoutedEvent(event: unknown): RoutedEvent | null {
  if (!event || typeof event !== "object") return null;
  const value = event as Record<string, unknown>;
  const eventId = typeof value.eventId === "string" ? value.eventId : "";
  const eventType = typeof value.eventType === "string" ? value.eventType : "";
  const occurredAt = typeof value.occurredAt === "string" && Number.isFinite(Date.parse(value.occurredAt))
    ? value.occurredAt
    : new Date().toISOString();
  const data = value.data && typeof value.data === "object" && !Array.isArray(value.data)
    ? value.data as Record<string, unknown>
    : null;
  return eventId && eventType && data ? { eventId, eventType, occurredAt, data } : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    if (PADDLE_ENVIRONMENT !== "production") return json(503, { error: "PADDLE_LIVE_ONLY" });

    const paddleApiKey = Deno.env.get("PADDLE_API_KEY")?.trim();
    const webhookSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET")?.trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const signature = req.headers.get("Paddle-Signature") ?? req.headers.get("paddle-signature") ?? "";
    if (!paddleApiKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) return json(503, { error: "PADDLE_WEBHOOK_NOT_CONFIGURED" });
    if (!signature) return json(400, { error: "PADDLE_SIGNATURE_MISSING" });

    // Preserve the exact request body: Paddle SDK verification must happen before
    // parsing or otherwise transforming the event payload.
    const rawBody = await req.text();
    let event: RoutedEvent | null = null;
    try {
      const paddle = new Paddle(paddleApiKey);
      event = asRoutedEvent(await paddle.webhooks.unmarshal(rawBody, webhookSecret, signature));
    } catch (error) {
      console.error("[paddle-subscription-webhook] signature verification failed", error);
      return json(400, { error: "invalid_signature" });
    }
    if (!event) return json(400, { error: "PADDLE_EVENT_INVALID" });

    if (!subscriptionAndTransactionEvents.has(event.eventType) && !customerEvents.has(event.eventType)) {
      return json(200, { received: true, ignored: true });
    }

    const service = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const rpcName = customerEvents.has(event.eventType) ? "paddle_apply_customer_webhook_event" : "paddle_apply_webhook_event";
    const { data, error } = await service.rpc(rpcName, {
      p_event_id: event.eventId,
      p_event_type: event.eventType,
      ...(rpcName === "paddle_apply_webhook_event" ? { p_occurred_at: event.occurredAt } : {}),
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
    return json(500, { error: "PADDLE_WEBHOOK_PROCESSING_FAILED" });
  }
});
