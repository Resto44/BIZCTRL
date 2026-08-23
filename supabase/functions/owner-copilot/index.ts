import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = Deno.env.get("APP_URL") ?? "https://mybizctrl.site";
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY = 20;

type ProviderName = "gemini" | "openai";
type ProviderConfig = {
  name: ProviderName;
  apiKey: string | undefined;
  endpoint: string;
  model: string;
};

class ProviderCallError extends Error {
  status: number;
  provider: ProviderName;

  constructor(message: string, status: number, provider: ProviderName) {
    super(message);
    this.name = "ProviderCallError";
    this.status = status;
    this.provider = provider;
  }
}

function getProvider(): ProviderConfig {
  const selected = String(Deno.env.get("AI_PROVIDER") || "gemini").trim().toLowerCase();
  if (selected === "openai") {
    return {
      name: "openai",
      apiKey: Deno.env.get("OPENAI_API_KEY"),
      endpoint: Deno.env.get("OPENAI_CHAT_COMPLETIONS_URL") || "https://api.openai.com/v1/chat/completions",
      model: Deno.env.get("OPENAI_MODEL") || "gpt-5-mini",
    };
  }
  if (selected === "gemini") {
    return {
      name: "gemini",
      apiKey: Deno.env.get("GEMINI_API_KEY"),
      endpoint: Deno.env.get("GEMINI_OPENAI_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      // Flash-Lite is available on the Gemini free tier and is optimized for high-volume agentic tasks.
      // Set GEMINI_MODEL to select a different compatible model without changing application code.
      model: Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite",
    };
  }
  throw new Error("AI_COPILOT_PROVIDER_UNSUPPORTED");
}

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin === APP_ORIGIN ? origin : APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json",
});

type Language = "en" | "ar" | "fa";
type Scope = {
  restaurantId: string;
  role: string;
  permissions: Record<string, boolean>;
  branchId: string | null;
  branchKey: string | null;
  branchName: string | null;
  currency: string;
  subscription: Record<string, unknown>;
  availableModules: Array<{ label?: string; path?: string; permission?: string }>;
};

const asNumber = (value: unknown) => Number(value || 0);
const trimText = (value: unknown, max = MAX_MESSAGE_LENGTH) => String(value || "").trim().slice(0, max);
const normaliseLanguage = (value: unknown): Language => value === "ar" || value === "fa" ? value : "en";
const formatDate = (date: Date) => date.toISOString().slice(0, 10);
const monthStart = () => `${formatDate(new Date()).slice(0, 7)}-01`;

function toolDefinitions() {
  const emptyObject = { type: "object", properties: {}, additionalProperties: false };
  return [
    {
      type: "function",
      function: {
        name: "get_dashboard_summary",
        description: "Read real, authorized dashboard totals for today's sales, month-to-date sales, expenses, and unpaid customer debt.",
        parameters: emptyObject,
      },
    },
    {
      type: "function",
      function: {
        name: "get_branch_sales",
        description: "Read real authorized sales totals for each branch for today or the current month.",
        parameters: {
          type: "object",
          properties: { period: { type: "string", enum: ["today", "month"] } },
          required: ["period"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_monthly_expenses",
        description: "Read real authorized expenses for the current calendar month, including the highest expense descriptions.",
        parameters: emptyObject,
      },
    },
    {
      type: "function",
      function: {
        name: "get_top_products",
        description: "Read real authorized product catalog information. Explain that sales-by-product needs invoiced item data when product-level sales records are unavailable.",
        parameters: emptyObject,
      },
    },
    {
      type: "function",
      function: {
        name: "get_customer_debt",
        description: "Read real authorized unpaid customer receivables.",
        parameters: emptyObject,
      },
    },
    {
      type: "function",
      function: {
        name: "get_subscription_status",
        description: "Read the canonical subscription snapshot, including trial and feature flags.",
        parameters: emptyObject,
      },
    },
    {
      type: "function",
      function: {
        name: "explain_module_access",
        description: "Explain module access using the current role, canonical subscription snapshot, feature flags, and the modules supplied from the application registry.",
        parameters: {
          type: "object",
          properties: { module_name: { type: "string" } },
          required: ["module_name"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "prepare_create_expense",
        description: "Prepare, but never execute, a real expense creation. Only call when amount and a clear description are present. The user must explicitly confirm in the application before anything is written to the expenses table.",
        parameters: {
          type: "object",
          properties: {
            amount: { type: "number", minimum: 0.01 },
            description: { type: "string", minLength: 1, maxLength: 500 },
            category: { type: "string", maxLength: 120 },
          },
          required: ["amount", "description"],
          additionalProperties: false,
        },
      },
    },
  ];
}

async function logEvent(caller: ReturnType<typeof createClient>, scope: Scope, userId: string, toolName: string, success: boolean, startedAt: number, metadata: Record<string, unknown> = {}) {
  await caller.from("copilot_tool_events").insert({
    restaurant_id: scope.restaurantId,
    user_id: userId,
    tool_name: toolName,
    success,
    latency_ms: Math.max(0, Date.now() - startedAt),
    metadata,
  });
}

async function resolveScope(caller: ReturnType<typeof createClient>, userId: string, restaurantId: string, selectedBranchId: unknown, availableModules: unknown): Promise<Scope> {
  const { data: identityRows, error: identityError } = await caller.rpc("erp_get_authenticated_portal_identity", { p_restaurant_id: restaurantId });
  if (identityError || !Array.isArray(identityRows) || !identityRows[0]) throw new Error("TENANT_SCOPE_DENIED");
  const identity = identityRows[0];

  const { data: membership, error: membershipError } = await caller
    .from("erp_memberships")
    .select("role, permissions, branch_id")
    .eq("user_id", userId)
    .eq("restaurant_id", identity.restaurant_id)
    .eq("status", "approved")
    .maybeSingle();
  if (membershipError || !membership) throw new Error("TENANT_SCOPE_DENIED");

  const { data: restaurant, error: restaurantError } = await caller
    .from("restaurants")
    .select("currency")
    .eq("id", identity.restaurant_id)
    .maybeSingle();
  if (restaurantError || !restaurant) throw new Error("TENANT_SCOPE_DENIED");

  let branchId: string | null = null;
  let branchKey: string | null = null;
  let branchName: string | null = null;
  const requestedBranchId = trimText(selectedBranchId, 100);
  if (String(identity.viewer_role || "").toLowerCase() === "owner") {
    if (requestedBranchId && requestedBranchId !== "all") {
      const { data: branch } = await caller
        .from("branches")
        .select("id, branch_key, name")
        .eq("restaurant_id", identity.restaurant_id)
        .eq("id", requestedBranchId)
        .eq("is_active", true)
        .maybeSingle();
      if (!branch) throw new Error("BRANCH_SCOPE_DENIED");
      branchId = branch.id;
      branchKey = branch.branch_key;
      branchName = branch.name;
    }
  } else {
    const assignedId = identity.viewer_branch_id || membership.branch_id;
    if (!assignedId) throw new Error("BRANCH_SCOPE_DENIED");
    const { data: branch } = await caller
      .from("branches")
      .select("id, branch_key, name")
      .eq("restaurant_id", identity.restaurant_id)
      .eq("id", assignedId)
      .eq("is_active", true)
      .maybeSingle();
    if (!branch) throw new Error("BRANCH_SCOPE_DENIED");
    branchId = branch.id;
    branchKey = branch.branch_key;
    branchName = branch.name;
  }

  const { data: subscription, error: subscriptionError } = await caller.rpc("erp_subscription_snapshot");
  if (subscriptionError) throw new Error("SUBSCRIPTION_CONTEXT_UNAVAILABLE");

  return {
    restaurantId: identity.restaurant_id,
    role: String(identity.viewer_role || membership.role || "member").toLowerCase(),
    permissions: typeof membership.permissions === "object" && membership.permissions ? membership.permissions : {},
    branchId,
    branchKey,
    branchName,
    currency: String(restaurant.currency || "SAR"),
    subscription: typeof subscription === "object" && subscription ? subscription : {},
    availableModules: Array.isArray(availableModules) ? availableModules.slice(0, 80) : [],
  };
}

function applyBranchFilter(query: any, scope: Scope, legacyColumn = "branch") {
  if (!scope.branchId || !scope.branchKey) return query;
  // Every query is already constrained to scope.restaurantId. UUID matches cover
  // canonical records; the second arm admits only same-tenant legacy rows without
  // a branch_id, avoiding a client-side tenant-wide fetch during the migration.
  return query.or(`branch_id.eq.${scope.branchId},and(branch_id.is.null,${legacyColumn}.eq.${scope.branchKey})`);
}

async function dashboardSummary(caller: ReturnType<typeof createClient>, scope: Scope) {
  const today = formatDate(new Date());
  const start = monthStart();
  let salesQuery = caller.from("daily_sales").select("total, cash, network, credit, date, branch").eq("restaurant_id", scope.restaurantId).gte("date", start).lte("date", today).limit(1000);
  let expensesQuery = caller.from("expenses").select("amount, date, description, branch_key").eq("restaurant_id", scope.restaurantId).gte("date", start).lte("date", today).limit(1000);
  let debtQuery = caller.from("debt_records").select("remaining_amount, party_name, due_date, branch").eq("restaurant_id", scope.restaurantId).eq("type", "receivable").eq("party_type", "customer").limit(500);
  salesQuery = applyBranchFilter(salesQuery, scope, "branch");
  expensesQuery = applyBranchFilter(expensesQuery, scope, "branch_key");
  debtQuery = applyBranchFilter(debtQuery, scope, "branch");
  const [salesResult, expensesResult, debtResult] = await Promise.all([salesQuery, expensesQuery, debtQuery]);
  if (salesResult.error || expensesResult.error || debtResult.error) throw new Error("AUTHORIZED_DATA_UNAVAILABLE");
  const sales = salesResult.data || [];
  const expenses = expensesResult.data || [];
  const debts = debtResult.data || [];
  return {
    currency: scope.currency,
    scope: scope.branchName || "All authorized branches",
    today_sales: sales.filter((row: any) => row.date === today).reduce((sum: number, row: any) => sum + asNumber(row.total || asNumber(row.cash) + asNumber(row.network) + asNumber(row.credit)), 0),
    month_sales: sales.reduce((sum: number, row: any) => sum + asNumber(row.total || asNumber(row.cash) + asNumber(row.network) + asNumber(row.credit)), 0),
    month_expenses: expenses.reduce((sum: number, row: any) => sum + asNumber(row.amount), 0),
    unpaid_customer_debt: debts.reduce((sum: number, row: any) => sum + asNumber(row.remaining_amount), 0),
    today,
  };
}

async function branchSales(caller: ReturnType<typeof createClient>, scope: Scope, period: "today" | "month") {
  const today = formatDate(new Date());
  let query = caller.from("daily_sales").select("branch, date, total, cash, network, credit").eq("restaurant_id", scope.restaurantId).gte("date", period === "today" ? today : monthStart()).lte("date", today).limit(1000);
  query = applyBranchFilter(query, scope, "branch");
  const { data, error } = await query;
  if (error) throw new Error("AUTHORIZED_DATA_UNAVAILABLE");
  const totals = new Map<string, number>();
  for (const row of data || []) {
    const name = String(row.branch || "Unassigned");
    const value = asNumber(row.total || asNumber(row.cash) + asNumber(row.network) + asNumber(row.credit));
    totals.set(name, (totals.get(name) || 0) + value);
  }
  return { currency: scope.currency, period, branches: [...totals.entries()].map(([branch, sales]) => ({ branch, sales })).sort((a, b) => b.sales - a.sales) };
}

async function monthlyExpenses(caller: ReturnType<typeof createClient>, scope: Scope) {
  let query = caller.from("expenses").select("amount, description, date, branch_key").eq("restaurant_id", scope.restaurantId).gte("date", monthStart()).lte("date", formatDate(new Date())).order("amount", { ascending: false }).limit(100);
  query = applyBranchFilter(query, scope, "branch_key");
  const { data, error } = await query;
  if (error) throw new Error("AUTHORIZED_DATA_UNAVAILABLE");
  const rows = data || [];
  return { currency: scope.currency, total: rows.reduce((sum: number, row: any) => sum + asNumber(row.amount), 0), expenses: rows.slice(0, 10).map((row: any) => ({ amount: asNumber(row.amount), description: row.description || "Unspecified", date: row.date, branch: row.branch_key })) };
}

async function topProducts(caller: ReturnType<typeof createClient>, scope: Scope) {
  const { data, error } = await caller.from("products").select("name, name_ar, default_price, selling_price, current_stock, is_active").eq("restaurant_id", scope.restaurantId).eq("is_active", true).order("name").limit(25);
  if (error) throw new Error("AUTHORIZED_DATA_UNAVAILABLE");
  return { currency: scope.currency, products: (data || []).map((product: any) => ({ name: product.name_ar || product.name, selling_price: asNumber(product.selling_price || product.default_price), current_stock: asNumber(product.current_stock) })), note: "Product-level sales ranking is only available when itemized sales records are present; this response never invents a ranking." };
}

async function customerDebt(caller: ReturnType<typeof createClient>, scope: Scope) {
  let query = caller.from("debt_records").select("party_name, remaining_amount, due_date, branch").eq("restaurant_id", scope.restaurantId).eq("type", "receivable").eq("party_type", "customer").gt("remaining_amount", 0).order("remaining_amount", { ascending: false }).limit(50);
  query = applyBranchFilter(query, scope, "branch");
  const { data, error } = await query;
  if (error) throw new Error("AUTHORIZED_DATA_UNAVAILABLE");
  const rows = data || [];
  return { currency: scope.currency, total: rows.reduce((sum: number, row: any) => sum + asNumber(row.remaining_amount), 0), debtors: rows.map((row: any) => ({ customer: row.party_name || "Unnamed customer", amount: asNumber(row.remaining_amount), due_date: row.due_date, branch: row.branch })) };
}

async function explainModuleAccess(scope: Scope, moduleName: string) {
  const term = moduleName.toLowerCase();
  const module = scope.availableModules.find((item) => String(item.label || "").toLowerCase().includes(term));
  const flags = Array.isArray(scope.subscription.feature_flags) ? scope.subscription.feature_flags : [];
  return {
    requested_module: moduleName,
    role: scope.role,
    has_erp_access: Boolean(scope.subscription.has_erp_access),
    subscription_status: scope.subscription.status || "UNKNOWN",
    trial_days_remaining: scope.subscription.trial_days_remaining || 0,
    available_in_navigation: Boolean(module),
    route: module?.path || null,
    required_permission: module?.permission || null,
    feature_flags: flags,
    instruction: "Use these facts only. Do not claim access that is not confirmed by canonical application guards.",
  };
}

async function prepareExpense(caller: ReturnType<typeof createClient>, scope: Scope, userId: string, args: Record<string, unknown>) {
  if (!scope.branchKey) return { status: "needs_input", error: "BRANCH_REQUIRED", message: "Select a specific branch before creating an expense." };
  const amount = Number(args.amount);
  const description = trimText(args.description, 500);
  if (!Number.isFinite(amount) || amount <= 0 || !description) return { status: "needs_input", error: "EXPENSE_INPUT_INVALID" };
  const { data: category } = args.category
    ? await caller.from("expense_categories").select("id, name, name_en, name_ar").eq("restaurant_id", scope.restaurantId).ilike("name", `%${trimText(args.category, 120)}%`).limit(1).maybeSingle()
    : { data: null };
  const payload = { amount, description, branch_id: scope.branchId, branch_key: scope.branchKey, category_id: category?.id || null, category_name: category?.name || category?.name_en || category?.name_ar || null, date: formatDate(new Date()) };
  const { data: request, error } = await caller.from("copilot_action_requests").insert({ restaurant_id: scope.restaurantId, user_id: userId, action_type: "create_expense", payload }).select("id, expires_at").single();
  if (error || !request) throw new Error("ACTION_PREPARATION_FAILED");
  return { status: "confirmation_required", action_request_id: request.id, expires_at: request.expires_at, action: "create_expense", payload, message: "The expense is only prepared. It will not be created unless the user confirms in the application." };
}

async function executeTool(caller: ReturnType<typeof createClient>, scope: Scope, userId: string, name: string, args: Record<string, unknown>) {
  const startedAt = Date.now();
  try {
    let result: unknown;
    if (name === "get_dashboard_summary") result = await dashboardSummary(caller, scope);
    else if (name === "get_branch_sales") result = await branchSales(caller, scope, args.period === "today" ? "today" : "month");
    else if (name === "get_monthly_expenses") result = await monthlyExpenses(caller, scope);
    else if (name === "get_top_products") result = await topProducts(caller, scope);
    else if (name === "get_customer_debt") result = await customerDebt(caller, scope);
    else if (name === "get_subscription_status") result = scope.subscription;
    else if (name === "explain_module_access") result = await explainModuleAccess(scope, trimText(args.module_name, 120));
    else if (name === "prepare_create_expense") result = await prepareExpense(caller, scope, userId, args);
    else throw new Error("TOOL_NOT_ALLOWED");
    await logEvent(caller, scope, userId, name, true, startedAt, { branch_id: scope.branchId, branch_key: scope.branchKey });
    return result;
  } catch (error) {
    await logEvent(caller, scope, userId, name, false, startedAt, { code: error instanceof Error ? error.message : "TOOL_FAILED" });
    throw error;
  }
}

function systemPrompt(scope: Scope, language: Language) {
  const modules = scope.availableModules.map((item) => `${item.label || "Module"}${item.path ? ` (${item.path})` : ""}`).join(", ");
  return `You are BizCTRL AI Copilot for an authenticated ERP user. Reply only in ${language === "ar" ? "Arabic" : language === "fa" ? "Persian/Dari" : "English"}. Current role: ${scope.role}. Current branch scope: ${scope.branchName || "all authorized branches"}. Currency: ${scope.currency}. Canonical subscription snapshot: ${JSON.stringify(scope.subscription)}. Modules supplied directly from the current application registry: ${modules}. Use read tools for every question about business values; never invent numbers. If data is unavailable, say exactly that you do not have enough data. For access questions, call explain_module_access and make no promises beyond its facts. For create-expense requests, call prepare_create_expense only after the user has supplied a positive amount and clear description. Never say an expense was created until the application confirms it. Do not expose credentials, raw SQL, or cross-tenant data. Provide concise, professional product guidance for BizCTRL navigation based only on supplied modules.`;
}

async function callModel(messages: unknown[], tools: unknown[] = []) {
  const provider = getProvider();
  if (!provider.apiKey) throw new ProviderCallError("AI_COPILOT_PROVIDER_NOT_CONFIGURED", 503, provider.name);

  const payload: Record<string, unknown> = {
    model: provider.model,
    messages,
    temperature: 0.2,
    max_tokens: 900,
  };
  if (tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = "auto";
  }

  const response = await fetch(provider.endpoint, {
    method: "POST",
    headers: { "Authorization": `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const responseText = await response.text();
  const body = (() => {
    try { return responseText ? JSON.parse(responseText) : {}; } catch { return {}; }
  })();
  if (!response.ok) {
    const detail = trimText(body?.error?.message || body?.message || (typeof body?.error === "string" ? body.error : responseText) || "AI_COPILOT_PROVIDER_UNAVAILABLE", 500);
    const code = response.status === 401 || response.status === 403
      ? "AI_COPILOT_PROVIDER_AUTH_FAILED"
      : response.status === 429
        ? "AI_COPILOT_PROVIDER_RATE_LIMITED"
        : "AI_COPILOT_PROVIDER_UNAVAILABLE";
    console.error(`[owner-copilot:${provider.name}] ${response.status} ${detail}`);
    throw new ProviderCallError(code, response.status === 429 ? 429 : 502, provider.name);
  }
  return body?.choices?.[0]?.message;
}

async function chat(caller: ReturnType<typeof createClient>, scope: Scope, userId: string, input: { conversationId?: unknown; message?: unknown; language?: unknown }) {
  const language = normaliseLanguage(input.language);
  const message = trimText(input.message);
  if (!message) throw new Error("MESSAGE_REQUIRED");
  let conversationId = trimText(input.conversationId, 100);
  if (conversationId) {
    const { data: existing } = await caller.from("copilot_conversations").select("id").eq("id", conversationId).eq("restaurant_id", scope.restaurantId).eq("user_id", userId).maybeSingle();
    if (!existing) throw new Error("CONVERSATION_SCOPE_DENIED");
  } else {
    const { data: created, error } = await caller.from("copilot_conversations").insert({ restaurant_id: scope.restaurantId, user_id: userId, title: message.slice(0, 80) }).select("id").single();
    if (error || !created) throw new Error("CONVERSATION_CREATE_FAILED");
    conversationId = created.id;
  }

  await caller.from("copilot_messages").insert({ conversation_id: conversationId, restaurant_id: scope.restaurantId, user_id: userId, role: "user", content: message, language });
  const { data: history } = await caller.from("copilot_messages").select("role, content").eq("conversation_id", conversationId).eq("restaurant_id", scope.restaurantId).eq("user_id", userId).order("created_at", { ascending: false }).limit(MAX_HISTORY);
  const historyMessages = (history || []).reverse().map((item: any) => ({ role: item.role, content: item.content }));
  const messages: any[] = [{ role: "system", content: systemPrompt(scope, language) }, ...historyMessages];
  const tools = toolDefinitions();
  let modelMessage = await callModel(messages, tools);
  if (!modelMessage) throw new Error("AI_COPILOT_EMPTY_RESPONSE");
  messages.push(modelMessage);

  const actionRequests: any[] = [];
  for (const call of modelMessage.tool_calls || []) {
    const args = JSON.parse(call.function?.arguments || "{}");
    const result = await executeTool(caller, scope, userId, call.function?.name, args);
    if ((result as any)?.action_request_id) actionRequests.push(result);
    messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
  }
  // Gemini's OpenAI-compatible endpoint supports the original tool-call exchange;
  // omit tools on the final synthesis request so the model returns a user-facing answer.
  if ((modelMessage.tool_calls || []).length > 0) modelMessage = await callModel(messages);
  const reply = trimText(modelMessage?.content, 8000) || "I could not prepare a response from the authorized information.";
  await caller.from("copilot_messages").insert({ conversation_id: conversationId, restaurant_id: scope.restaurantId, user_id: userId, role: "assistant", content: reply, language, metadata: { action_request_ids: actionRequests.map((item) => item.action_request_id) } });
  await caller.from("copilot_conversations").update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", conversationId).eq("restaurant_id", scope.restaurantId).eq("user_id", userId);
  const provider = getProvider();
  return { conversation_id: conversationId, message: reply, action_requests: actionRequests, provider: provider.name, model: provider.model };
}

async function confirmAction(caller: ReturnType<typeof createClient>, scope: Scope, userId: string, actionRequestId: unknown, decision: unknown) {
  const requestId = trimText(actionRequestId, 100);
  if (!requestId) throw new Error("ACTION_REQUEST_REQUIRED");
  const { data: request, error } = await caller.from("copilot_action_requests").select("*").eq("id", requestId).eq("restaurant_id", scope.restaurantId).eq("user_id", userId).eq("status", "pending").maybeSingle();
  if (error || !request) throw new Error("ACTION_REQUEST_NOT_FOUND");
  if (new Date(request.expires_at).getTime() < Date.now()) {
    await caller.from("copilot_action_requests").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", request.id);
    throw new Error("ACTION_REQUEST_EXPIRED");
  }
  if (decision === "cancel") {
    await caller.from("copilot_action_requests").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", request.id);
    return { status: "cancelled" };
  }
  if (decision !== "confirm" || request.action_type !== "create_expense") throw new Error("ACTION_CONFIRMATION_REQUIRED");
  const payload = request.payload || {};
  if (!scope.branchId || !scope.branchKey || payload.branch_id !== scope.branchId || payload.branch_key !== scope.branchKey || !Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0 || !trimText(payload.description, 500)) throw new Error("ACTION_PAYLOAD_INVALID");

  const { data: expense, error: expenseError } = await caller.from("expenses").insert({
    restaurant_id: scope.restaurantId,
    branch_id: scope.branchId,
    branch_key: scope.branchKey,
    category_id: payload.category_id || null,
    amount: Number(payload.amount),
    description: trimText(payload.description, 500),
    date: payload.date || formatDate(new Date()),
  }).select("id, amount, description, date, branch_key").single();
  if (expenseError || !expense) {
    await caller.from("copilot_action_requests").update({ status: "failed", result: { code: expenseError?.message || "EXPENSE_CREATE_FAILED" }, updated_at: new Date().toISOString() }).eq("id", request.id);
    throw new Error(expenseError?.message || "EXPENSE_CREATE_FAILED");
  }
  await caller.from("copilot_action_requests").update({ status: "confirmed", confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString(), result: { expense_id: expense.id } }).eq("id", request.id);
  return { status: "confirmed", action: "create_expense", expense };
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
  try {
    const authorization = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!authorization || !supabaseUrl || !anonKey) throw new Error("AUTH_SERVICE_NOT_CONFIGURED");
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { autoRefreshToken: false, persistSession: false } });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) throw new Error("UNAUTHENTICATED");
    const body = await req.json();
    const scope = await resolveScope(caller, userData.user.id, trimText(body.restaurantId, 100), body.selectedBranchId, body.availableModules);
    if (body.operation === "confirm_action") {
      const result = await confirmAction(caller, scope, userData.user.id, body.actionRequestId, body.decision);
      return new Response(JSON.stringify(result), { status: 200, headers });
    }
    const result = await chat(caller, scope, userData.user.id, { conversationId: body.conversationId, message: body.message, language: body.language });
    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI_COPILOT_UNAVAILABLE";
    const status = error instanceof ProviderCallError
      ? error.status
      : ["UNAUTHENTICATED", "TENANT_SCOPE_DENIED", "BRANCH_SCOPE_DENIED", "CONVERSATION_SCOPE_DENIED"].includes(message)
        ? 403
        : message === "MESSAGE_REQUIRED"
          ? 400
          : 503;
    const provider = error instanceof ProviderCallError ? error.provider : undefined;
    console.error("[owner-copilot]", message);
    return new Response(JSON.stringify({ error: message, ...(provider ? { provider } : {}) }), { status, headers });
  }
});
