import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  Environment,
  EventName,
  Paddle,
} from "npm:@paddle/paddle-node-sdk@3.9.0";

const PADDLE_ENVIRONMENT = Deno.env.get("PADDLE_ENVIRONMENT") ?? "production";

const supportedEventNames = new Set<string>([
  EventName.SubscriptionCreated,
  EventName.SubscriptionUpdated,
  EventName.SubscriptionCanceled,
  EventName.CustomerCreated,
  EventName.CustomerUpdated,
  EventName.TransactionCompleted,
]);

type VerifiedWebhookEvent = Awaited<ReturnType<Paddle["webhooks"]["unmarshal"]>>;
type SubscriptionWebhookEvent = Extract<
  VerifiedWebhookEvent,
  { eventType: EventName.SubscriptionCreated | EventName.SubscriptionUpdated | EventName.SubscriptionCanceled }
>;
type CustomerWebhookEvent = Extract<
  VerifiedWebhookEvent,
  { eventType: EventName.CustomerCreated | EventName.CustomerUpdated }
>;
type TransactionCompletedWebhookEvent = Extract<
  VerifiedWebhookEvent,
  { eventType: EventName.TransactionCompleted }
>;

type WebhookApplicationResult = {
  processed?: boolean;
  reason?: string;
  subscription_status?: string;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createPaddleClient(apiKey: string) {
  return new Paddle(apiKey, {
    environment: PADDLE_ENVIRONMENT === "production" ? Environment.production : Environment.sandbox,
  });
}

function eventPayload(event: VerifiedWebhookEvent) {
  return {
    p_event_id: event.eventId,
    p_event_type: event.eventType,
    p_occurred_at: event.occurredAt,
    p_data: event.data,
  };
}

async function applyVerifiedEvent(
  service: SupabaseClient,
  event: VerifiedWebhookEvent,
): Promise<WebhookApplicationResult> {
  const { data, error } = await service.rpc("paddle_sync_verified_webhook_event", eventPayload(event));
  if (error) throw new Error(error.message);
  return (data ?? {}) as WebhookApplicationResult;
}

async function handleSubscriptionEvent(
  service: SupabaseClient,
  event: SubscriptionWebhookEvent,
): Promise<WebhookApplicationResult> {
  return applyVerifiedEvent(service, event);
}

async function handleCustomerEvent(
  service: SupabaseClient,
  event: CustomerWebhookEvent,
): Promise<WebhookApplicationResult> {
  return applyVerifiedEvent(service, event);
}

async function handleTransactionCompleted(
  service: SupabaseClient,
  event: TransactionCompletedWebhookEvent,
): Promise<WebhookApplicationResult> {
  return applyVerifiedEvent(service, event);
}

async function routeVerifiedEvent(
  service: SupabaseClient,
  event: VerifiedWebhookEvent,
): Promise<WebhookApplicationResult | null> {
  switch (event.eventType) {
    case EventName.SubscriptionCreated:
    case EventName.SubscriptionUpdated:
    case EventName.SubscriptionCanceled:
      return handleSubscriptionEvent(service, event as SubscriptionWebhookEvent);
    case EventName.CustomerCreated:
    case EventName.CustomerUpdated:
      return handleCustomerEvent(service, event as CustomerWebhookEvent);
    case EventName.TransactionCompleted:
      return handleTransactionCompleted(service, event as TransactionCompletedWebhookEvent);
    default:
      return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const webhookSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET")?.trim();
  const paddleApiKey = Deno.env.get("PADDLE_API_KEY")?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const signature = req.headers.get("Paddle-Signature") ?? req.headers.get("paddle-signature") ?? "";

  if (PADDLE_ENVIRONMENT !== "production") return json(503, { error: "PADDLE_LIVE_ONLY" });
  if (!webhookSecret || !paddleApiKey || !supabaseUrl || !serviceRoleKey) {
    return json(503, { error: "PADDLE_WEBHOOK_NOT_CONFIGURED" });
  }
  if (!signature) return json(400, { error: "missing_signature" });

  // Preserve the exact raw body. The Paddle SDK verifies this string before it
  // parses it into a typed event object; JSON.parse must never run beforehand.
  const rawBody = await req.text();
  let event: VerifiedWebhookEvent;
  try {
    event = await createPaddleClient(paddleApiKey).webhooks.unmarshal(rawBody, webhookSecret, signature);
  } catch (error) {
    console.warn("[paddle-subscription-webhook] signature verification failed", error instanceof Error ? error.message : "unknown_error");
    return json(400, { error: "invalid_signature" });
  }

  if (!supportedEventNames.has(event.eventType)) {
    return json(200, { received: true, ignored: true, event_type: event.eventType });
  }

  try {
    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const result = await routeVerifiedEvent(service, event);
    return json(200, {
      received: true,
      event_id: event.eventId,
      event_type: event.eventType,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PADDLE_EVENT_PROCESSING_FAILED";
    console.error("[paddle-subscription-webhook] verified event processing failed", {
      event_id: event.eventId,
      event_type: event.eventType,
      message,
    });
    // A non-2xx response preserves Paddle's retry behavior for verified events
    // that could not be mirrored or applied to the canonical subscription state.
    return json(500, { error: "PADDLE_EVENT_PROCESSING_FAILED" });
  }
});
