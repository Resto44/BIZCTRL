-- ============================================================
-- Restaurant Manager Pro — Supabase Schema
-- Run this in your Supabase SQL Editor to create all tables.
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Helper: auto-update updated_date ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_date()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_date = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ── Macro to add trigger to a table ───────────────────────────────────────
-- (run manually per table or adapt as needed)

-- ── PROFILES (linked to auth.users) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  full_name     TEXT,
  role          TEXT DEFAULT 'admin',
  branch        TEXT,
  restaurant_id TEXT,
  created_date  TIMESTAMPTZ DEFAULT NOW(),
  updated_date  TIMESTAMPTZ DEFAULT NOW()
);
CREATE OR REPLACE TRIGGER trg_profiles BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_date();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'admin')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── RESTAURANTS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT,
  name         TEXT NOT NULL,
  logo_url     TEXT,
  address      TEXT,
  currency     TEXT DEFAULT '$',
  timezone     TEXT DEFAULT 'UTC',
  is_active    BOOLEAN DEFAULT TRUE,
  branches     TEXT, -- JSON array
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── EMPLOYEES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name            TEXT NOT NULL,
  employee_id          TEXT,
  branch               TEXT,
  position             TEXT,
  base_salary          NUMERIC DEFAULT 0,
  pin                  TEXT,
  qr_code              TEXT,
  check_in_method      TEXT DEFAULT 'pin',
  joining_date         DATE,
  phone                TEXT,
  email                TEXT,
  is_active            BOOLEAN DEFAULT TRUE,
  scheduled_start_time TEXT,
  scheduled_end_time   TEXT,
  notes                TEXT,
  is_driver            BOOLEAN DEFAULT FALSE,
  driver_status        TEXT DEFAULT 'active',
  created_by           TEXT,
  created_date         TIMESTAMPTZ DEFAULT NOW(),
  updated_date         TIMESTAMPTZ DEFAULT NOW()
);

-- ── DAILY SALES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_sales (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date                        DATE NOT NULL,
  branch                      TEXT NOT NULL,
  cash                        NUMERIC DEFAULT 0,
  network                     NUMERIC DEFAULT 0,
  credit                      NUMERIC DEFAULT 0,
  restaurant_cash             NUMERIC DEFAULT 0,
  restaurant_network          NUMERIC DEFAULT 0,
  restaurant_network_account_id TEXT,
  driver_cash                 NUMERIC DEFAULT 0,
  driver_network              NUMERIC DEFAULT 0,
  driver_name                 TEXT,
  driver_employee_id          TEXT,
  driver_network_account_id   TEXT,
  drivers_json                TEXT,
  network_account_id          TEXT,
  notes                       TEXT,
  created_by                  TEXT,
  manager_user_id             UUID,
  manager_name                TEXT,
  manager_email               TEXT,
  created_date                TIMESTAMPTZ DEFAULT NOW(),
  updated_date                TIMESTAMPTZ DEFAULT NOW()
);

-- ── DELIVERY ORDERS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number      TEXT,
  branch            TEXT NOT NULL,
  driver_id         TEXT,
  driver_name       TEXT,
  status            TEXT DEFAULT 'pending',
  customer_name     TEXT,
  customer_phone    TEXT,
  customer_address  TEXT,
  items_json        TEXT,
  subtotal          NUMERIC DEFAULT 0,
  delivery_fee      NUMERIC DEFAULT 0,
  discount          NUMERIC DEFAULT 0,
  total_amount      NUMERIC DEFAULT 0,
  payment_method    TEXT DEFAULT 'cash',
  payment_collected BOOLEAN DEFAULT FALSE,
  collected_at      TEXT,
  shift_id          TEXT,
  notes             TEXT,
  cancelled_reason  TEXT,
  delivered_at      TEXT,
  created_by        TEXT,
  created_date      TIMESTAMPTZ DEFAULT NOW(),
  updated_date      TIMESTAMPTZ DEFAULT NOW()
);

-- ── DRIVER SHIFTS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_shifts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch                   TEXT NOT NULL,
  driver_id                TEXT NOT NULL,
  driver_name              TEXT,
  date                     DATE,
  shift_start              TEXT,
  shift_end                TEXT,
  status                   TEXT DEFAULT 'open',
  total_orders             NUMERIC DEFAULT 0,
  total_cash_collected     NUMERIC DEFAULT 0,
  total_network_collected  NUMERIC DEFAULT 0,
  total_credit_collected   NUMERIC DEFAULT 0,
  total_revenue            NUMERIC DEFAULT 0,
  pending_debt_deduction   NUMERIC DEFAULT 0,
  cash_to_hand_over        NUMERIC DEFAULT 0,
  settlement_id            TEXT,
  manager_notes            TEXT,
  submitted_by             TEXT,
  driver_lat               NUMERIC,
  driver_lng               NUMERIC,
  location_updated_at      TEXT,
  created_by               TEXT,
  created_date             TIMESTAMPTZ DEFAULT NOW(),
  updated_date             TIMESTAMPTZ DEFAULT NOW()
);

-- ── DRIVER SETTLEMENTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_settlements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch           TEXT,
  driver_id        TEXT,
  driver_name      TEXT,
  shift_id         TEXT,
  date             DATE,
  cash_collected   NUMERIC DEFAULT 0,
  network_collected NUMERIC DEFAULT 0,
  credit_collected NUMERIC DEFAULT 0,
  total_collected  NUMERIC DEFAULT 0,
  debt_deducted    NUMERIC DEFAULT 0,
  cash_handed_over NUMERIC DEFAULT 0,
  network_verified NUMERIC DEFAULT 0,
  variance_cash    NUMERIC DEFAULT 0,
  status           TEXT DEFAULT 'pending',
  approved_by      TEXT,
  approved_at      TEXT,
  manager_notes    TEXT,
  proof_url        TEXT,
  created_by       TEXT,
  created_date     TIMESTAMPTZ DEFAULT NOW(),
  updated_date     TIMESTAMPTZ DEFAULT NOW()
);

-- ── DRIVER DEBTS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_debts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch           TEXT,
  driver_id        TEXT,
  driver_name      TEXT,
  type             TEXT DEFAULT 'salary_advance',
  amount           NUMERIC DEFAULT 0,
  paid_amount      NUMERIC DEFAULT 0,
  remaining_amount NUMERIC DEFAULT 0,
  status           TEXT DEFAULT 'open',
  date             DATE,
  due_date         DATE,
  deduct_from_salary BOOLEAN DEFAULT FALSE,
  notes            TEXT,
  issued_by        TEXT,
  created_by       TEXT,
  created_date     TIMESTAMPTZ DEFAULT NOW(),
  updated_date     TIMESTAMPTZ DEFAULT NOW()
);

-- ── DRIVER SALES ENTRIES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_sales_entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_sales_id      TEXT,
  date                DATE,
  branch              TEXT,
  driver_name         TEXT,
  driver_employee_id  TEXT,
  cash                NUMERIC DEFAULT 0,
  network             NUMERIC DEFAULT 0,
  network_account_id  TEXT,
  order_count         NUMERIC DEFAULT 0,
  notes               TEXT,
  created_by          TEXT,
  created_date        TIMESTAMPTZ DEFAULT NOW(),
  updated_date        TIMESTAMPTZ DEFAULT NOW()
);

-- ── ATTENDANCE ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   TEXT NOT NULL,
  employee_name TEXT,
  branch        TEXT,
  date          DATE,
  check_in      TEXT,
  check_out     TEXT,
  hours_worked  NUMERIC DEFAULT 0,
  status        TEXT DEFAULT 'present',
  late_minutes  NUMERIC DEFAULT 0,
  notes         TEXT,
  created_by    TEXT,
  created_date  TIMESTAMPTZ DEFAULT NOW(),
  updated_date  TIMESTAMPTZ DEFAULT NOW()
);

-- ── INVENTORY ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch           TEXT,
  product_id       TEXT,
  product_name     TEXT,
  quantity         NUMERIC DEFAULT 0,
  unit             TEXT,
  min_stock_level  NUMERIC DEFAULT 0,
  reorder_qty      NUMERIC DEFAULT 0,
  last_updated     TEXT,
  notes            TEXT,
  created_by       TEXT,
  created_date     TIMESTAMPTZ DEFAULT NOW(),
  updated_date     TIMESTAMPTZ DEFAULT NOW()
);

-- ── PRODUCTS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  name_ar      TEXT,
  category     TEXT,
  unit         TEXT,
  cost_price   NUMERIC DEFAULT 0,
  is_active    BOOLEAN DEFAULT TRUE,
  notes        TEXT,
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── MENU PRODUCTS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch       TEXT,
  name         TEXT NOT NULL,
  name_ar      TEXT,
  category     TEXT,
  price        NUMERIC DEFAULT 0,
  description  TEXT,
  image_url    TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  sort_order   NUMERIC DEFAULT 0,
  addons_json  TEXT,
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── PAYROLL RUNS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch         TEXT,
  month          TEXT,
  year           TEXT,
  status         TEXT DEFAULT 'draft',
  total_gross    NUMERIC DEFAULT 0,
  total_net      NUMERIC DEFAULT 0,
  total_deductions NUMERIC DEFAULT 0,
  entries_json   TEXT,
  approved_by    TEXT,
  approved_at    TEXT,
  notes          TEXT,
  created_by     TEXT,
  created_date   TIMESTAMPTZ DEFAULT NOW(),
  updated_date   TIMESTAMPTZ DEFAULT NOW()
);

-- ── EXPENSES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch        TEXT,
  date          DATE,
  category      TEXT,
  amount        NUMERIC DEFAULT 0,
  description   TEXT,
  receipt_url   TEXT,
  status        TEXT DEFAULT 'pending',
  approved_by   TEXT,
  notes         TEXT,
  created_by    TEXT,
  created_date  TIMESTAMPTZ DEFAULT NOW(),
  updated_date  TIMESTAMPTZ DEFAULT NOW()
);

-- ── PURCHASE ORDERS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch        TEXT,
  supplier_id   TEXT,
  supplier_name TEXT,
  date          DATE,
  status        TEXT DEFAULT 'draft',
  items_json    TEXT,
  total_amount  NUMERIC DEFAULT 0,
  notes         TEXT,
  created_by    TEXT,
  created_date  TIMESTAMPTZ DEFAULT NOW(),
  updated_date  TIMESTAMPTZ DEFAULT NOW()
);

-- ── PURCHASES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch        TEXT,
  date          DATE,
  supplier_id   TEXT,
  supplier_name TEXT,
  category      TEXT,
  amount        NUMERIC DEFAULT 0,
  invoice_url   TEXT,
  payment_method TEXT DEFAULT 'cash',
  notes         TEXT,
  created_by    TEXT,
  created_date  TIMESTAMPTZ DEFAULT NOW(),
  updated_date  TIMESTAMPTZ DEFAULT NOW()
);

-- ── NOTIFICATIONS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email   TEXT,
  title        TEXT,
  message      TEXT,
  type         TEXT DEFAULT 'info',
  is_read      BOOLEAN DEFAULT FALSE,
  link         TEXT,
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── DEBT RECORDS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debt_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch           TEXT,
  debtor_name      TEXT,
  debtor_phone     TEXT,
  amount           NUMERIC DEFAULT 0,
  paid_amount      NUMERIC DEFAULT 0,
  remaining        NUMERIC DEFAULT 0,
  status           TEXT DEFAULT 'open',
  due_date         DATE,
  notes            TEXT,
  created_by       TEXT,
  created_date     TIMESTAMPTZ DEFAULT NOW(),
  updated_date     TIMESTAMPTZ DEFAULT NOW()
);

-- ── DEBT PAYMENTS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debt_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id      TEXT,
  amount       NUMERIC DEFAULT 0,
  date         DATE,
  method       TEXT DEFAULT 'cash',
  notes        TEXT,
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── CREDIT COLLECTIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_collections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch       TEXT,
  date         DATE,
  amount       NUMERIC DEFAULT 0,
  customer     TEXT,
  method       TEXT,
  notes        TEXT,
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── COLLECTION ACTIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collection_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id      TEXT,
  action_type  TEXT,
  notes        TEXT,
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── NETWORK ACCOUNTS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS network_accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch       TEXT,
  name         TEXT,
  account_number TEXT,
  bank         TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  notes        TEXT,
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── SETTLEMENT RECORDS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settlement_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_type             TEXT NOT NULL,
  date                  DATE,
  amount                NUMERIC DEFAULT 0,
  branch                TEXT,
  network_account_id    TEXT,
  submitted_by          TEXT,
  submitted_by_name     TEXT,
  proof_url             TEXT,
  proof_uploaded_at     TEXT,
  notes                 TEXT,
  status                TEXT DEFAULT 'pending',
  verified_by           TEXT,
  verified_at           TEXT,
  reviewed_by           TEXT,
  reviewed_at           TEXT,
  rejection_reason      TEXT,
  reference_id          TEXT,
  parent_settlement_id  TEXT,
  is_locked             BOOLEAN DEFAULT FALSE,
  ocr_vendor            TEXT,
  created_by            TEXT,
  created_date          TIMESTAMPTZ DEFAULT NOW(),
  updated_date          TIMESTAMPTZ DEFAULT NOW()
);

-- ── WALLET TRANSACTIONS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date           DATE,
  type           TEXT,
  direction      TEXT,
  wallet         TEXT,
  branch         TEXT,
  amount         NUMERIC DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  description    TEXT,
  reference_id   TEXT,
  auto_generated BOOLEAN DEFAULT FALSE,
  recorded_by    TEXT,
  created_by     TEXT,
  created_date   TIMESTAMPTZ DEFAULT NOW(),
  updated_date   TIMESTAMPTZ DEFAULT NOW()
);

-- ── SUBSCRIPTIONS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_key              TEXT,
  plan                 TEXT DEFAULT 'starter',
  subscription_status  TEXT DEFAULT 'trial',
  current_period_end   DATE,
  trial_end            DATE,
  payment_provider     TEXT DEFAULT 'none',
  stripe_customer_id   TEXT,
  stripe_subscription_id TEXT,
  monthly_price        NUMERIC DEFAULT 0,
  max_restaurants      NUMERIC DEFAULT 1,
  max_branches         NUMERIC DEFAULT 3,
  max_employees        NUMERIC DEFAULT 20,
  max_ocr_scans        NUMERIC DEFAULT 100,
  max_pdf_exports      NUMERIC DEFAULT 50,
  used_ocr_scans       NUMERIC DEFAULT 0,
  used_pdf_exports     NUMERIC DEFAULT 0,
  created_by           TEXT,
  created_date         TIMESTAMPTZ DEFAULT NOW(),
  updated_date         TIMESTAMPTZ DEFAULT NOW()
);

-- ── SUPPORT TICKETS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number     TEXT,
  subject           TEXT NOT NULL,
  message           TEXT,
  category          TEXT DEFAULT 'general',
  priority          TEXT DEFAULT 'medium',
  status            TEXT DEFAULT 'open',
  submitted_by      TEXT,
  submitted_by_name TEXT,
  attachments       TEXT,
  voice_url         TEXT,
  admin_notes       TEXT,
  resolved_at       TEXT,
  created_by        TEXT,
  created_date      TIMESTAMPTZ DEFAULT NOW(),
  updated_date      TIMESTAMPTZ DEFAULT NOW()
);

-- ── SUPPLIERS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  notes        TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── SUPPLIER INVOICES ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  TEXT,
  branch       TEXT,
  date         DATE,
  amount       NUMERIC DEFAULT 0,
  status       TEXT DEFAULT 'unpaid',
  invoice_url  TEXT,
  notes        TEXT,
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── AUDIT LOGS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email   TEXT,
  action       TEXT,
  entity       TEXT,
  entity_id    TEXT,
  details      TEXT,
  ip           TEXT,
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── TASKS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT,
  description  TEXT,
  status       TEXT DEFAULT 'todo',
  priority     TEXT DEFAULT 'medium',
  assigned_to  TEXT,
  branch       TEXT,
  due_date     DATE,
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── STAFF ROSTERS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_rosters (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch       TEXT,
  week_start   DATE,
  entries_json TEXT,
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── STAFF ATTENDANCE ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_attendance (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  TEXT,
  branch       TEXT,
  date         DATE,
  check_in     TEXT,
  check_out    TEXT,
  hours_worked NUMERIC DEFAULT 0,
  status       TEXT DEFAULT 'present',
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── BRAND SETTINGS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brand_settings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT,
  settings_json TEXT,
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── APP SETTINGS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT,
  key          TEXT,
  value        TEXT,
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── ANNOUNCEMENTS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT,
  body           TEXT,
  branch_key     TEXT,
  target_roles   TEXT,
  priority       TEXT DEFAULT 'normal',
  posted_by      TEXT,
  posted_by_name TEXT,
  expires_at     TEXT,
  is_active      BOOLEAN DEFAULT TRUE,
  created_by     TEXT,
  created_date   TIMESTAMPTZ DEFAULT NOW(),
  updated_date   TIMESTAMPTZ DEFAULT NOW()
);

-- ── EXPENSE CATEGORIES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en      TEXT NOT NULL,
  name_ar      TEXT,
  name_fa      TEXT,
  icon         TEXT,
  color        TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  sort_order   NUMERIC DEFAULT 0,
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── PURCHASE CATEGORIES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en      TEXT NOT NULL,
  name_ar      TEXT,
  name_fa      TEXT,
  icon         TEXT,
  color        TEXT,
  type         TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  is_favorite  BOOLEAN DEFAULT FALSE,
  sort_order   NUMERIC DEFAULT 0,
  created_by   TEXT,
  created_date TIMESTAMPTZ DEFAULT NOW(),
  updated_date TIMESTAMPTZ DEFAULT NOW()
);

-- ── REMAINING TABLES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_profiles   (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id TEXT, data_json TEXT, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS sponsor_transactions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), branch TEXT, amount NUMERIC DEFAULT 0, type TEXT, date DATE, notes TEXT, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS owner_personal_finance (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), date DATE, type TEXT, amount NUMERIC DEFAULT 0, notes TEXT, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS inventory_waste    (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), branch TEXT, product_id TEXT, quantity NUMERIC DEFAULT 0, reason TEXT, date DATE, notes TEXT, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS inventory_transfers(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), from_branch TEXT, to_branch TEXT, product_id TEXT, quantity NUMERIC DEFAULT 0, date DATE, notes TEXT, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS recipes            (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, ingredients_json TEXT, notes TEXT, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS network_import_batches (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), branch TEXT, date DATE, data_json TEXT, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS batch_documents    (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), batch_id TEXT, file_url TEXT, type TEXT, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS usage_logs         (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id TEXT, feature TEXT, count NUMERIC DEFAULT 0, date DATE, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS scheduled_reports  (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, schedule TEXT, recipients TEXT, template TEXT, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS deduction_rules    (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), branch TEXT, name TEXT, type TEXT, value NUMERIC DEFAULT 0, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS salary_advances    (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), employee_id TEXT, amount NUMERIC DEFAULT 0, date DATE, status TEXT DEFAULT 'pending', notes TEXT, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS employee_bonuses   (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), employee_id TEXT, amount NUMERIC DEFAULT 0, date DATE, reason TEXT, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS approval_policies  (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id TEXT, policy_json TEXT, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS manager_invites    (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT, branch_key TEXT, branch_label TEXT, owner_email TEXT, restaurant_id TEXT, restaurant_name TEXT, status TEXT DEFAULT 'pending', invite_token TEXT, token_expires_at TEXT, whatsapp_sent BOOLEAN DEFAULT FALSE, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS driver_invites     (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT, driver_name TEXT, phone TEXT, branch_key TEXT, branch_label TEXT, restaurant_name TEXT, restaurant_id TEXT, owner_email TEXT, invite_token TEXT, token_expires_at TEXT, status TEXT DEFAULT 'pending', employee_id TEXT, whatsapp_sent BOOLEAN DEFAULT FALSE, email_sent BOOLEAN DEFAULT FALSE, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS employee_invites   (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT, employee_name TEXT, phone TEXT, position TEXT, branch_key TEXT, branch_label TEXT, restaurant_name TEXT, restaurant_id TEXT, owner_email TEXT, invite_token TEXT, token_expires_at TEXT, status TEXT DEFAULT 'pending', employee_record_id TEXT, email_sent BOOLEAN DEFAULT FALSE, created_by TEXT, created_date TIMESTAMPTZ DEFAULT NOW(), updated_date TIMESTAMPTZ DEFAULT NOW());

-- ============================================================
-- ENABLE ROW LEVEL SECURITY (optional — adjust per your needs)
-- ============================================================
-- ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
-- CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
-- (Add more policies as needed for each table)
-- ============================================================
-- Done! Run this script in Supabase SQL Editor.
-- ============================================================
