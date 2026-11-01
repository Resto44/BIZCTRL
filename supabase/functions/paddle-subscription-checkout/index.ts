import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = Deno.env.get("APP_URL") ?? "https://mybizctrl.site";
const PADDLE_ENVIRONMENT = Deno.env.get("PADDLE_ENVIRONMENT") ?? "production";
const PADDLE_API_URL = "https://api.paddle.com";
const TRANSACTION_ID_PATTERN = /^txn_[a-z\d]{26}$/i;
const PRICE_ID = /^pri_[a-z\d]{26}$/i;
const PRODUCT_ID = /^pro_[a-z\d]{26}$/i;
const SAFE_PADDLE_ERROR_FIELD_PATTERN = /^[a-z\d._-]{1,100}$/i;

function safePaddleErrorField(value: unknown) {
  return typeof value === "string" && SAFE_PADDLE_ERROR_FIELD_PATTERN.test(value) ? value : "unknown";
}

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

    const body = await req.json().catch(() => null) as { planId?: unknown; billingInterval?: unknown } | null;
    const planId = typeof body?.planId === "string" ? body.planId.trim() : "";
    if (!planId) return fail("PAID_PLAN_REQUIRED", 400, headers);
    const interval = body?.billingInterval === 'year' ? 'year' : body?.billingInterval === 'month' || body?.billingInterval == null ? 'month' : null;
    if (!interval) return fail('INVALID_BILLING_INTERVAL',400,headers);

    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return fail("UNAUTHENTICATED", 401, headers);

    const service = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    // The annual quote is read-only, checks owner membership server-side, and
    // returns trusted catalog pricing. No pending payment is created until a
    // valid yearly Paddle catalog price has been confirmed.
    if (interval === 'year') {
      const { data: quote, error: quoteError } = await caller.rpc('paddle_annual_quote', { p_plan_id: planId });
      if (quoteError || !quote || !PRICE_ID.test(quote.monthly_price_id) || !Number.isSafeInteger(quote.annual_cents) || quote.annual_cents <= 0)
        return fail('PADDLE_ANNUAL_PRICE_NOT_CONFIGURED',400,headers);
      const authHeaders={Authorization:`Bearer ${paddleApiKey}`,'Content-Type':'application/json'};
      const monthlyResponse=await fetch(`${PADDLE_API_URL}/prices/${quote.monthly_price_id}`,{headers:authHeaders});
      const monthlyData=await monthlyResponse.json().catch(()=>null);
      const monthly=monthlyData?.data;
      if(!monthlyResponse.ok || !PRODUCT_ID.test(monthly?.product_id||'') ||
         monthly?.billing_cycle?.interval!=='month' || Number(monthly?.billing_cycle?.frequency)!==1 ||
         monthly?.unit_price?.currency_code!=='USD' ||
         Number(monthly?.unit_price?.amount)!==quote.monthly_cents)
        return fail('PADDLE_MONTHLY_CATALOG_MISMATCH',409,headers);
      let annualId=quote.annual_price_id;
      if (annualId && !PRICE_ID.test(annualId))return fail('PADDLE_ANNUAL_PRICE_INVALID',409,headers);
      if(!annualId){
        const annualResponse=await fetch(`${PADDLE_API_URL}/prices`,{
          method:'POST',headers:authHeaders,
          body:JSON.stringify({
            description:`BizCTRL ${quote.plan_id} annual 30 percent off current monthly`,
            name:'Annual (30% off)',product_id:monthly.product_id,
            unit_price:{amount:String(quote.annual_cents),currency_code:'USD'},
            billing_cycle:{interval:'year',frequency:1},quantity:{minimum:1,maximum:1},
            tax_mode:'account_setting'
          })
        });
        const annualBody=await annualResponse.json().catch(()=>null);
        if(!annualResponse.ok || !PRICE_ID.test(annualBody?.data?.id||''))
          return fail('PADDLE_ANNUAL_CATALOG_CREATE_FAILED',502,headers);
        const {data:registered,error:registerError}=await service.rpc('paddle_register_annual_price',{
          p_plan_id:quote.plan_id,p_monthly_price_id:quote.monthly_price_id,
          p_annual_price_id:annualBody.data.id,p_amount_cents:quote.annual_cents
        });
        if(registerError || !PRICE_ID.test(registered||''))return fail('PADDLE_ANNUAL_CATALOG_LINK_FAILED',500,headers);
        annualId=registered;
      }
      const annualResponse=await fetch(`${PADDLE_API_URL}/prices/${annualId}`,{headers:authHeaders});
      const annual=(await annualResponse.json().catch(()=>null))?.data;
      if(!annualResponse.ok || annual?.product_id!==monthly.product_id ||
          annual?.billing_cycle?.interval!=='year' || annual?.billing_cycle?.frequency!==1 ||
          annual?.unit_price?.currency_code!=='USD' || Number(annual?.unit_price?.amount)!==quote.annual_cents)
        return fail('PADDLE_ANNUAL_CATALOG_MISMATCH',409,headers);
    }

    // Guarded DB RPC binds the verified interval, price, pending payment and tenant.
    const { data: context, error: contextError } = await caller.rpc("paddle_create_checkout_context", {
      p_plan_id:planId,p_billing_interval:interval
    });
    if (contextError || !context?.payment_id || !PRICE_ID.test(context?.paddle_price_id||'') || context.billing_interval!==interval) {
      return fail(contextError?.message ?? "PADDLE_CHECKOUT_CONTEXT_FAILED", 400, headers);
    }

    if (context.transaction_id && TRANSACTION_ID_PATTERN.test(context.transaction_id)) {
      return new Response(JSON.stringify({ transactionId: context.transaction_id, reused: true }), { status: 200, headers });
    }

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
          bizctrl_billing_interval: interval,
        },
      }),
    });
    const transactionBody = await transactionResponse.json().catch(() => null) as {
      data?: { id?: string };
      error?: { code?: unknown; type?: unknown };
    } | null;
    const transactionId = transactionBody?.data?.id ?? "";
    if (!transactionResponse.ok || !TRANSACTION_ID_PATTERN.test(transactionId)) {
      console.error("[paddle-subscription-checkout] transaction creation failed", JSON.stringify({
        http_status: transactionResponse.status,
        paddle_error_code: safePaddleErrorField(transactionBody?.error?.code),
        paddle_error_type: safePaddleErrorField(transactionBody?.error?.type),
        request_endpoint: "/transactions",
        environment: PADDLE_ENVIRONMENT,
        paddle_price_id: context.paddle_price_id,
      }));
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
