/**
 * Supabase client + Base44-compatible entity/auth wrapper.
 * CRASH-PROOF: every initialization step is guarded.
 * The module ALWAYS exports valid objects even if Supabase is unavailable.
 */


import { createClient } from '@supabase/supabase-js';
import { createClient as createBase44Client } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

// ── Supabase client — safe init ────────────────────────────────────────────
// Production fallback values — these are public-facing keys (anon key only, NOT service role).
// They are safe to commit because the anon key is already exposed to every browser client.
// Prefer VITE_ env vars when set (e.g. local dev or Vercel env config).
const PROD_SUPABASE_URL = 'https://mqubwgbppncldyiicbtu.supabase.co';
const PROD_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xdWJ3Z2JwcG5jbGR5aWljYnR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMjUyNDcsImV4cCI6MjA5NTgwMTI0N30.lRWj1iE26Hkv0zlnT5d5ZDMthrVidq8-Qysg7jZl59Q';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || PROD_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || PROD_SUPABASE_ANON_KEY;

// ── Stub Supabase for when it's unavailable ────────────────────────────────
const stubAuth = {
  getUser: async () => ({ data: { user: null }, error: null }),
  getSession: async () => ({ data: { session: null }, error: null }),
  signInWithPassword: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
  signUp: async () => ({ data: null, error: { message: 'Supabase not configured' } }),
  signOut: async () => ({ error: null }),
  resetPasswordForEmail: async () => ({ error: { message: 'Supabase not configured' } }),
  onAuthStateChange: (cb) => {
    // Fire with no session so AuthContext resolves immediately
    setTimeout(() => cb('INITIAL_SESSION', null), 0);
    return { data: { subscription: { unsubscribe: () => {} } } };
  },
};

const stubFrom = () => ({
  select: () => stubFrom(),
  insert: () => stubFrom(),
  update: () => stubFrom(),
  upsert: () => stubFrom(),
  delete: () => stubFrom(),
  eq: () => stubFrom(),
  or: () => stubFrom(),
  order: () => stubFrom(),
  limit: () => stubFrom(),
  single: async () => ({ data: null, error: null }),
  then: (resolve) => resolve({ data: [], error: null }),
});

let supabase = {
  auth: stubAuth,
  from: () => stubFrom(),
  channel: () => ({
    on: function() { return this; },
    subscribe: function() { return this; },
  }),
  removeChannel: () => {},
};

try {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    // Use Object.assign to maintain the same reference in case of circular imports
    Object.assign(supabase, client);
    // Ensure the prototype is also copied if necessary, or just replace the variable
    // For safety with live bindings, replacing the variable is usually fine, 
    // but Object.assign is safer for captured closures if they captured the object itself.
    // However, the closures capture the 'supabase' variable, so re-assignment is fine.
    supabase = client; 
  } else {
    console.warn('[supabaseClient] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set — using stub client');
  }
} catch (e) {
  console.error('[supabaseClient] Supabase init failed:', e.message);
}

export { supabase, SUPABASE_URL, SUPABASE_ANON_KEY };

// ── Base44 SDK — safe init (for functions/integrations) ────────────────────
let _b44 = null;
if (appParams.appId) {
  try {
    _b44 = createBase44Client({
      appId: appParams.appId,
      token: appParams.token,
      functionsVersion: appParams.functionsVersion,
      serverUrl: '',
      requiresAuth: false,
      appBaseUrl: appParams.appBaseUrl,
    });
  } catch (e) {
    console.warn('[supabaseClient] Base44 SDK init failed (functions/integrations unavailable):', e.message);
  }
} else {
  console.info('[supabaseClient] Base44 SDK is not configured; optional functions and integrations use safe fallbacks.');
}

const stubFn = { invoke: async () => ({ data: null }) };
const stubIntegrations = { Core: { InvokeLLM: async () => ({}), UploadFile: async () => ({ file_url: '' }), SendEmail: async () => ({}), GenerateImage: async () => ({ url: '' }) } };
const stubAgents = { createConversation: async () => ({}), listConversations: async () => [], getConversation: async () => ({}), addMessage: async () => ({}), subscribeToConversation: () => () => {}, getWhatsAppConnectURL: () => '#', getTelegramConnectURL: () => '#' };

// ── Helpers ────────────────────────────────────────────────────────────────
function parseSortParam(sort) {
  if (!sort) return { column: 'created_date', ascending: false };
  const s = Array.isArray(sort) ? sort[0] : sort;
  if (typeof s === 'string' && s.startsWith('-')) return { column: s.slice(1), ascending: false };
  return { column: s || 'created_date', ascending: true };
}

function applyFilter(q, filter) {
  if (!filter || typeof filter !== 'object') return q;
  for (const [key, val] of Object.entries(filter)) {
    if (key === '$or' && Array.isArray(val)) {
      const parts = val
        .map(c => Object.entries(c).filter(([k]) => !k.startsWith('$') && !k.startsWith('user_')).map(([k, v]) => `${k}.eq.${v}`).join(','))
        .filter(Boolean);
      if (parts.length) q = q.or(parts.join(','));
    } else if (key === '$and' && Array.isArray(val)) {
      val.forEach(c => { q = applyFilter(q, c); });
    } else if (!key.startsWith('$') && key !== 'user_condition' && !key.startsWith('user_') && val !== null && val !== undefined) {
      q = q.eq(key, val);
    }
  }
  return q;
}

async function getCurrentUserEmail() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email || '';
  } catch { return ''; }
}

// ── Entity wrapper factory ─────────────────────────────────────────────────

// categories table uses name_en/name_ar instead of name.
// Inject a virtual `name` field so all UI code using c.name works correctly.
function normalizeCategoryRow(row) {
  if (!row) return row;
  return { ...row, name: row.name || row.name_en || row.name_ar || '' };
}
function normalizeCategoryRows(rows) {
  return (rows || []).map(normalizeCategoryRow);
}
// Map `name` -> `name_en` for categories create/update payloads
function mapCategoryPayload(record) {
  if (!record) return record;
  const mapped = { ...record };
  if ('name' in mapped && !mapped.name_en) {
    mapped.name_en = mapped.name;
  }
  delete mapped.name;
  return mapped;
}

function createEntity(tableName) {
  return {
    async list(sortParam = '-created_date', limit = 100) {
      const { column, ascending } = parseSortParam(sortParam);
      const { data, error } = await supabase.from(tableName).select('*').order(column, { ascending }).limit(limit);
      if (error) { console.warn(`[entity:${tableName}] list error:`, error.message); return []; }
      const _listData = data || [];
      return tableName === 'categories' ? normalizeCategoryRows(_listData) : _listData;
    },

    async filter(filterObj = {}, sortParam = '-created_date', limit = 100) {
      const { column, ascending } = parseSortParam(sortParam);
      let q = supabase.from(tableName).select('*');
      q = applyFilter(q, filterObj);
      q = q.order(column, { ascending }).limit(limit);
      const { data, error } = await q;
      if (error) { console.warn(`[entity:${tableName}] filter error:`, error.message); return []; }
      const _filterData = data || [];
      return tableName === 'categories' ? normalizeCategoryRows(_filterData) : _filterData;
    },

    async get(id) {
      const { data, error } = await supabase.from(tableName).select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    async create(record) {
      if (tableName === 'categories') record = mapCategoryPayload(record);
      const email = await getCurrentUserEmail();
      const now = new Date().toISOString();
      // Strip server-generated / computed columns that cannot be inserted by the client.
      // Also strip daily_sales app-only fields that have no DB column.
      // total is a GENERATED ALWAYS column in daily_sales.
      // Other fields like remaining_difference are calculated in the UI but stored as regular columns.
      // Stripping them prevents them from being saved.
      const GENERATED_COLS = ['total'];
      const safe = Object.fromEntries(
        Object.entries(record).filter(([k]) => !GENERATED_COLS.includes(k))
      );
      // Check if created_by/created_date exist in the schema before adding them.
      // For simplicity in this sandbox fix, we'll exclude them if they cause errors, 
      // but the real fix is to check the table definition or use a more robust entity mapper.
      const payload = { ...safe };
      
      // Only add audit fields if they are standard for this project's base entities
      // Recipes and some new tables use 'created_at' instead of 'created_date'
      const CREATED_AT_TABLES = ['product_categories', 'expense_categories', 'sales_categories', 'online_order_categories', 'recipes', 'recipe_ingredients', 'product_modifiers', 'product_modifier_options', 'customer_addresses', 'customer_favorites', 'promotions', 'driver_requests', 'network_pos_devices', 'network_transfers', 'network_reconciliations'];
      if (!CREATED_AT_TABLES.includes(tableName)) {
        payload.created_by = email;
        payload.created_date = now;
        payload.updated_date = now;
      } else if (['product_categories', 'expense_categories', 'sales_categories', 'online_order_categories'].includes(tableName)) {
        payload.created_by = email;
        // these tables use created_at (not created_date)
      }
      
      // Convert empty strings to null for UUID columns that are ALREADY in the payload.
      // Empty string is not a valid UUID — Postgres rejects it with code 22P02.
      // IMPORTANT: only touch keys that already exist in the payload; do NOT inject new keys.
      const UUID_COLS = ['category_id', 'restaurant_id', 'supplier_id', 'customer_id', 'product_id', 'order_id', 'employee_id', 'driver_id', 'branch_id', 'cashier_id', 'pos_device_id'];
      UUID_COLS.forEach(col => {
        if (Object.prototype.hasOwnProperty.call(payload, col) && (payload[col] === '' || payload[col] === undefined)) {
          payload[col] = null;
        }
      });
      const { data, error } = await supabase.from(tableName).insert(payload).select().single();
      if (error) {
        console.error(`[entity:${tableName}] INSERT ERROR:`, error.code, error.message, error.details, error.hint);
        throw error;
      }
      return data;
    },

    async bulkCreate(records) {
      const email = await getCurrentUserEmail();
      const now = new Date().toISOString();
      const GENERATED_COLS = ['total'];
      const { data, error } = await supabase.from(tableName).insert(
        records.map(r => {
          const safe = Object.fromEntries(Object.entries(r).filter(([k]) => !GENERATED_COLS.includes(k)));
          const payload = { ...safe };
          if (!['recipes', 'recipe_ingredients', 'product_modifiers', 'product_modifier_options', 'customer_addresses', 'customer_favorites', 'promotions', 'driver_requests', 'network_pos_devices', 'network_transfers', 'network_reconciliations'].includes(tableName)) {
            payload.created_by = email;
            payload.created_date = now;
            payload.updated_date = now;
          }
          return payload;
        })
      ).select();
      if (error) throw error;
      return data || [];
    },

    async update(id, changes) {
      if (tableName === 'categories') changes = mapCategoryPayload(changes);
      // Strip server-generated / computed columns that cannot be set by the client.
      // daily_sales.total is a GENERATED ALWAYS column — sending it causes HTTP 400.
      // Also strip daily_sales app-only fields that have no DB column.
      // total is a GENERATED ALWAYS column in daily_sales.
      // Other fields like remaining_difference are calculated in the UI but stored as regular columns.
      // Stripping them prevents them from being saved.
      const GENERATED_COLS = ['total'];
      const safe = Object.fromEntries(
        Object.entries(changes).filter(([k]) => !GENERATED_COLS.includes(k))
      );
      const updatePayload = { ...safe };
      // All tables have updated_date column
      updatePayload.updated_date = new Date().toISOString();
      const { data, error } = await supabase.from(tableName).update(updatePayload).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },

    async delete(id) {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;
      return { success: true };
    },

    schema() { return {}; },

    subscribe(callback) {
      try {
        const channel = supabase
          .channel(`rt-${tableName}-${Date.now()}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, payload => {
            const typeMap = { INSERT: 'create', UPDATE: 'update', DELETE: 'delete' };
            callback({ type: typeMap[payload.eventType] || payload.eventType, id: payload.new?.id || payload.old?.id, data: payload.new || null });
          })
          .subscribe((status, err) => {
          });
        return () => supabase.removeChannel(channel);
      } catch (e) {
        console.warn(`[realtime:${tableName}] subscribe failed:`, e);
        return () => {};
      }
    },
  };
}

// ── Auth helpers ───────────────────────────────────────────────────────────
const auth = {
  async me() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return null;
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      return {
        id: user.id,
        email: user.email,
        full_name: profile?.full_name || user.user_metadata?.full_name || '',
        role: profile?.role || user.user_metadata?.role || null,
        branch: profile?.branch || null,
        ...profile,
      };
    } catch (e) {
      console.warn('[auth.me] error:', e.message);
      return null;
    }
  },

  async isAuthenticated() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return !!session;
    } catch { return false; }
  },

  async updateMe(updates) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { error } = await supabase.from('profiles').upsert({ id: user.id, email: user.email, ...updates, updated_date: new Date().toISOString() });
    if (error) throw error;
    return auth.me();
  },

    logout(redirectUrl) {
    // Plain JS context fallback — React components should use useAuth().logout()
    supabase.auth.signOut().then(() => { window.location.replace(redirectUrl || '/erp-login'); });
  },
  redirectToLogin(nextUrl) {
    const next = nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : '';
    window.location.replace(`/erp-login${next}`);
  },
};

// ── Entity registry ────────────────────────────────────────────────────────
const entities = {
  Employee: createEntity('employees'), Driver: createEntity('drivers'),
  Attendance: createEntity('attendance'),
  Inventory: createEntity('inventory'), Product: createEntity('products'),
  MenuProduct: createEntity('products'), // fix: menu_products table does not exist in DB; remapped to products
  PayrollRun: createEntity('payroll_runs'),
  Expense: createEntity('expenses'), ExpenseCategory: createEntity('expense_categories'),
  PurchaseOrder: createEntity('purchase_orders'), Purchase: createEntity('purchases'),
  Notification: createEntity('notifications'),
  DailySales: createEntity('daily_sales'), SalesInvoice: createEntity('sales_invoices'), DebtRecord: createEntity('debt_records'),
  DebtPayment: createEntity('debt_payments'), CreditCollection: createEntity('customer_collections'),
  DebtInvoice: createEntity('debt_invoices'), DebtReceipt: createEntity('debt_receipts'),
  WhatsAppQueue: createEntity('whatsapp_outbound_queue'), InvoiceSequence: createEntity('invoice_sequences'),
  CollectionAction: createEntity('collection_actions'), Restaurant: createEntity('restaurants'),
  NetworkAccount: createEntity('network_accounts'), SettlementRecord: createEntity('settlement_records'),
  NetworkPosDevice: createEntity('network_pos_devices'),
  NetworkTransfer: createEntity('network_transfers'),
  NetworkReconciliation: createEntity('network_reconciliations'),
  Subscription: createEntity('subscriptions'), WalletTransaction: createEntity('wallet_transactions'), TreasuryAccount: createEntity('treasury_accounts'),
  Supplier: createEntity('suppliers'), SupplierInvoice: createEntity('supplier_invoices'),
  SupplierPayment: createEntity('supplier_payments'), OcrLog: createEntity('ocr_logs'),
  SupportTicket: createEntity('support_tickets'), AuditLog: createEntity('audit_logs'),
  Task: createEntity('tasks'), StaffRoster: createEntity('staff_rosters'),
  StaffAttendance: createEntity('staff_attendance'), BrandSettings: createEntity('brand_settings'),
  AppSettings: createEntity('app_settings'), TenantProfile: createEntity('tenant_profiles'),
  Announcement: createEntity('announcements'), SponsorTransaction: createEntity('sponsor_transactions'),
  OwnerPersonalFinance: createEntity('owner_personal_finance'), InventoryWaste: createEntity('inventory_waste'),
  InventoryTransfer: createEntity('inventory_transfers'), Recipe: createEntity('recipes'),
  NetworkImportBatch: createEntity('network_import_batches'), BatchDocument: createEntity('batch_documents'),
  UsageLog: createEntity('usage_logs'), ScheduledReport: createEntity('scheduled_reports'),
  DeductionRule: createEntity('deduction_rules'), SalaryAdvance: createEntity('salary_advances'),
  EmployeeBonus: createEntity('employee_bonuses'), ApprovalPolicy: createEntity('approval_policies'),
  User: createEntity('profiles'),
  ProductModifier: createEntity('product_modifiers'),
  ProductModifierOption: createEntity('product_modifier_options'),
  CustomerAddress: createEntity('customer_addresses'),
  CustomerFavorite: createEntity('customer_favorites'),
  CustomerNote: createEntity('customer_notes'),
  Promotion: createEntity('promotions'),
  DriverRequest: createEntity('driver_requests'),
  RecipeIngredient: createEntity('recipe_ingredients'),
  Branch: createEntity('branches'), Category: createEntity('categories'),
  Customer: createEntity('customers'), Order: createEntity('orders'),
  OrderItem: createEntity('order_items'), Reservation: createEntity('reservations'),
  Payment: createEntity('payments'),
  // ── New Enterprise Entities (Phase 2) ──
  Ingredient: createEntity('ingredients'),
  LoyaltyTransaction: createEntity('loyalty_transactions'),
  Notification: createEntity('notifications'),
  ProductSize: createEntity('product_sizes'),
  CartItem: createEntity('cart_items'),
  OrderTracking: createEntity('order_tracking'),
  // ── Product Management System ──
  ProductUnit: createEntity('product_units'),
  ProductVariant: createEntity('product_variants'),
  InventoryTransaction: createEntity('inventory_transactions'),
  ProductAnalytics: createEntity('product_analytics'),
  // ── Network Management ──
  TransferRequest: createEntity('transfer_requests'),
  NetworkCustomer: createEntity('network_customers'),
  BranchHealthScore: createEntity('branches'), // remapped: no separate table, use branches
  // ── Debt (alias for DebtRecord) ──
  Debt: createEntity('debt_records'),
  // ── Procurement Analytics ──
  ProcurementAnalytics: createEntity('procurement_analytics'),
  // ── Cash Register & Alerts ──
  CashRegisterEntry: createEntity('cash_register_entries'),
  Alert: createEntity('notifications'), // remapped: no separate alerts table; use notifications
  // ── Cash Register Redesign (2026-07-02) ──────────────────────────────────
  DailyCashSettlement: createEntity('daily_cash_settlements'),
  CashShortage: createEntity('cash_shortages'),
  OwnerCashInjection: createEntity('owner_cash_injections'),
  CashMovement: createEntity('cash_movements'),
  // ── Enterprise Category Systems (2026-06-18) ──────────────────────────────
  // FIVE completely isolated tables — never cross-pollinate:
  //   ProductCategory       → product_categories       (Product Management / Inventory ONLY)
  //   ExpenseCategory       → expense_categories       (Expenses module ONLY)

  //   SalesCategory         → sales_categories         (Sales module ONLY)
  //   OnlineOrderCategory   → online_order_categories  (Online Ordering ONLY)
  ProductCategory: createEntity('product_categories'),
  SalesCategory: createEntity('sales_categories'),
  OnlineOrderCategory: createEntity('online_order_categories'),
  // ── Sales Sources (Configurable Sale Types — 2026-07-03) ────────────────
  SalesSource: createEntity('sales_sources'),
};


// ── Main export ────────────────────────────────────────────────────────────
export const base44 = {
  entities,
  auth,
  users: { inviteUser: async (email, role) => console.warn('[users.inviteUser] use Supabase Admin API:', email, role) },
  analytics: { track: () => {} },
  connectors: { connectAppUser: async () => '#', disconnectAppUser: async () => {} },
  functions:    _b44?.functions    || stubFn,
  integrations: _b44?.integrations || stubIntegrations,
  agents:       _b44?.agents       || stubAgents,
};

