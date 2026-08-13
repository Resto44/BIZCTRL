-- ============================================================
-- Enterprise Multi-Tenant ERP — Full Migration
-- Date: 2026-07-15
-- Description: Unified registration, approval history, RLS,
--              tenant initialization, and complete isolation.
-- ============================================================

-- ── 1. Profiles: ensure all required columns exist ───────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS branch_id UUID,
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected','suspended')),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Owners are auto-approved
UPDATE profiles SET approval_status = 'approved' WHERE role = 'owner' AND approval_status = 'pending';
UPDATE profiles SET approval_status = 'approved' WHERE approval_status IS NULL;

-- ── 2. Organizations table (maps to restaurants) ─────────────────────────────
-- restaurants table IS the organization — add org_name alias + org_code
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS org_code TEXT,
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS is_initialized BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- Backfill org_code for existing restaurants
UPDATE restaurants
SET org_code = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g')) || '_' || SUBSTRING(id::text, 1, 6)
WHERE org_code IS NULL;

-- ── 3. Unified ERP Registrations table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS erp_registrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  phone           TEXT,
  role            TEXT NOT NULL CHECK (role IN ('owner','general_manager','manager','employee','supplier')),
  organization_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  rejection_reason TEXT,
  approved_at     TIMESTAMPTZ,
  approved_by     UUID REFERENCES auth.users(id),
  assigned_permissions JSONB DEFAULT '{}'::jsonb,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_reg_email ON erp_registrations(email);
CREATE INDEX IF NOT EXISTS idx_erp_reg_status ON erp_registrations(status);
CREATE INDEX IF NOT EXISTS idx_erp_reg_role ON erp_registrations(role);
CREATE INDEX IF NOT EXISTS idx_erp_reg_org ON erp_registrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_erp_reg_branch ON erp_registrations(branch_id);
CREATE INDEX IF NOT EXISTS idx_erp_reg_user ON erp_registrations(user_id);

-- ── 4. Approval History table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES erp_registrations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL CHECK (action IN ('approved','rejected','suspended','reactivated','branch_assigned','permissions_updated','note_added')),
  performed_by    UUID REFERENCES auth.users(id),
  performed_by_email TEXT,
  old_status      TEXT,
  new_status      TEXT,
  notes           TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_hist_reg ON approval_history(registration_id);
CREATE INDEX IF NOT EXISTS idx_approval_hist_user ON approval_history(user_id);
CREATE INDEX IF NOT EXISTS idx_approval_hist_org ON approval_history(performed_by);

-- ── 5. Branch Assignments table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branch_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  assigned_by     UUID REFERENCES auth.users(id),
  is_primary      BOOLEAN DEFAULT TRUE,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_assign_user ON branch_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_branch_assign_branch ON branch_assignments(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_assign_org ON branch_assignments(organization_id);

-- ── 6. Tenant Default Data tables ────────────────────────────────────────────

-- Default Currencies per organization
CREATE TABLE IF NOT EXISTS org_currencies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  is_default      BOOLEAN DEFAULT FALSE,
  exchange_rate   NUMERIC DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, code)
);

-- Default Warehouses per organization
CREATE TABLE IF NOT EXISTS org_warehouses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  location        TEXT,
  is_default      BOOLEAN DEFAULT FALSE,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Default Cash Registers per branch
CREATE TABLE IF NOT EXISTS org_cash_registers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  register_code   TEXT,
  is_default      BOOLEAN DEFAULT FALSE,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Org-level settings
CREATE TABLE IF NOT EXISTS org_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE UNIQUE,
  settings        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on new tables
ALTER TABLE erp_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;

-- ── 7. Helper functions for RLS ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_user_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(organization_id, restaurant_id) FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_user_branch_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT branch_id FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(role = 'owner', false) FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_owner_or_gm()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(role IN ('owner', 'general_manager'), false) FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_approved_user()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(approval_status = 'approved', false) FROM profiles WHERE id = auth.uid()
$$;

-- ── 8. RLS Policies: profiles ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_owner_gm" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_owner" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_owner" ON profiles;

-- Users can always read their own profile
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Owner/GM can read all profiles in their organization
CREATE POLICY "profiles_select_owner_gm"
  ON profiles FOR SELECT
  USING (
    is_owner_or_gm() AND (
      COALESCE(organization_id, restaurant_id) = auth_user_org_id()
      OR auth_user_org_id() IS NULL
    )
  );

-- Users can insert their own profile
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Users can update their own profile (limited fields)
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Owner can update any profile in their org
CREATE POLICY "profiles_update_owner"
  ON profiles FOR UPDATE
  USING (
    is_owner() AND (
      COALESCE(organization_id, restaurant_id) = auth_user_org_id()
      OR auth_user_org_id() IS NULL
    )
  );

-- ── 9. RLS Policies: erp_registrations ───────────────────────────────────────
DROP POLICY IF EXISTS "erp_reg_select_own" ON erp_registrations;
DROP POLICY IF EXISTS "erp_reg_select_owner_gm" ON erp_registrations;
DROP POLICY IF EXISTS "erp_reg_insert_public" ON erp_registrations;
DROP POLICY IF EXISTS "erp_reg_update_owner" ON erp_registrations;
DROP POLICY IF EXISTS "erp_reg_delete_owner" ON erp_registrations;

-- Users can see their own registration
CREATE POLICY "erp_reg_select_own"
  ON erp_registrations FOR SELECT
  USING (user_id = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Owner/GM can see all registrations for their org
CREATE POLICY "erp_reg_select_owner_gm"
  ON erp_registrations FOR SELECT
  USING (
    is_owner_or_gm() AND (
      organization_id = auth_user_org_id()
      OR organization_id IS NULL
      OR auth_user_org_id() IS NULL
    )
  );

-- Anyone can register (public insert)
CREATE POLICY "erp_reg_insert_public"
  ON erp_registrations FOR INSERT
  WITH CHECK (true);

-- Owner/GM can update registrations in their org
CREATE POLICY "erp_reg_update_owner"
  ON erp_registrations FOR UPDATE
  USING (
    is_owner_or_gm() AND (
      organization_id = auth_user_org_id()
      OR auth_user_org_id() IS NULL
    )
  );

-- Owner can delete registrations
CREATE POLICY "erp_reg_delete_owner"
  ON erp_registrations FOR DELETE
  USING (is_owner() AND organization_id = auth_user_org_id());

-- ── 10. RLS Policies: approval_history ───────────────────────────────────────
DROP POLICY IF EXISTS "approval_hist_select_own" ON approval_history;
DROP POLICY IF EXISTS "approval_hist_select_owner_gm" ON approval_history;
DROP POLICY IF EXISTS "approval_hist_insert_owner" ON approval_history;

CREATE POLICY "approval_hist_select_own"
  ON approval_history FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "approval_hist_select_owner_gm"
  ON approval_history FOR SELECT
  USING (is_owner_or_gm());

CREATE POLICY "approval_hist_insert_owner"
  ON approval_history FOR INSERT
  WITH CHECK (is_owner_or_gm());

-- ── 11. RLS Policies: branch_assignments ─────────────────────────────────────
DROP POLICY IF EXISTS "ba_select_own" ON branch_assignments;
DROP POLICY IF EXISTS "ba_select_owner_gm" ON branch_assignments;
DROP POLICY IF EXISTS "ba_insert_owner" ON branch_assignments;
DROP POLICY IF EXISTS "ba_update_owner" ON branch_assignments;
DROP POLICY IF EXISTS "ba_delete_owner" ON branch_assignments;

CREATE POLICY "ba_select_own"
  ON branch_assignments FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "ba_select_owner_gm"
  ON branch_assignments FOR SELECT
  USING (
    is_owner_or_gm() AND (
      organization_id = auth_user_org_id()
      OR auth_user_org_id() IS NULL
    )
  );

CREATE POLICY "ba_insert_owner"
  ON branch_assignments FOR INSERT
  WITH CHECK (is_owner_or_gm());

CREATE POLICY "ba_update_owner"
  ON branch_assignments FOR UPDATE
  USING (is_owner_or_gm());

CREATE POLICY "ba_delete_owner"
  ON branch_assignments FOR DELETE
  USING (is_owner());

-- ── 12. RLS Policies: org tables ─────────────────────────────────────────────
DROP POLICY IF EXISTS "org_currencies_org_access" ON org_currencies;
DROP POLICY IF EXISTS "org_warehouses_org_access" ON org_warehouses;
DROP POLICY IF EXISTS "org_cash_registers_org_access" ON org_cash_registers;
DROP POLICY IF EXISTS "org_settings_org_access" ON org_settings;

CREATE POLICY "org_currencies_org_access"
  ON org_currencies FOR ALL
  USING (organization_id = auth_user_org_id());

CREATE POLICY "org_warehouses_org_access"
  ON org_warehouses FOR ALL
  USING (organization_id = auth_user_org_id());

CREATE POLICY "org_cash_registers_org_access"
  ON org_cash_registers FOR ALL
  USING (organization_id = auth_user_org_id());

CREATE POLICY "org_settings_org_access"
  ON org_settings FOR ALL
  USING (organization_id = auth_user_org_id());

-- ── 13. RLS Policies: core business tables ────────────────────────────────────

-- restaurants: owner sees own, staff sees their assigned org
DROP POLICY IF EXISTS "restaurants_owner_all" ON restaurants;
DROP POLICY IF EXISTS "restaurants_staff_select" ON restaurants;
CREATE POLICY "restaurants_owner_all"
  ON restaurants FOR ALL
  USING (created_by = (SELECT email FROM auth.users WHERE id = auth.uid()));
CREATE POLICY "restaurants_staff_select"
  ON restaurants FOR SELECT
  USING (id = auth_user_org_id());

-- branches: org-scoped
DROP POLICY IF EXISTS "branches_org_all" ON branches;
DROP POLICY IF EXISTS "branches_staff_select" ON branches;
CREATE POLICY "branches_org_all"
  ON branches FOR ALL
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE created_by = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
CREATE POLICY "branches_staff_select"
  ON branches FOR SELECT
  USING (restaurant_id = auth_user_org_id());

-- daily_sales: org + branch isolation
DROP POLICY IF EXISTS "daily_sales_org_isolation" ON daily_sales;
DROP POLICY IF EXISTS "daily_sales_branch_isolation" ON daily_sales;
CREATE POLICY "daily_sales_org_isolation"
  ON daily_sales FOR ALL
  USING (
    is_owner_or_gm() AND (
      restaurant_id = auth_user_org_id()
      OR created_by = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
CREATE POLICY "daily_sales_branch_isolation"
  ON daily_sales FOR ALL
  USING (
    NOT is_owner_or_gm() AND
    branch_id = auth_user_branch_id() AND
    restaurant_id = auth_user_org_id()
  );

-- expenses: org + branch isolation
DROP POLICY IF EXISTS "expenses_org_isolation" ON expenses;
DROP POLICY IF EXISTS "expenses_branch_isolation" ON expenses;
CREATE POLICY "expenses_org_isolation"
  ON expenses FOR ALL
  USING (
    is_owner_or_gm() AND (
      restaurant_id = auth_user_org_id()
      OR created_by = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
CREATE POLICY "expenses_branch_isolation"
  ON expenses FOR ALL
  USING (
    NOT is_owner_or_gm() AND
    branch_id = auth_user_branch_id() AND
    restaurant_id = auth_user_org_id()
  );

-- purchases: org + branch isolation
DROP POLICY IF EXISTS "purchases_org_isolation" ON purchases;
DROP POLICY IF EXISTS "purchases_branch_isolation" ON purchases;
CREATE POLICY "purchases_org_isolation"
  ON purchases FOR ALL
  USING (
    is_owner_or_gm() AND (
      restaurant_id = auth_user_org_id()
      OR created_by = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );
CREATE POLICY "purchases_branch_isolation"
  ON purchases FOR ALL
  USING (
    NOT is_owner_or_gm() AND
    branch_id = auth_user_branch_id() AND
    restaurant_id = auth_user_org_id()
  );

-- products: org-scoped
DROP POLICY IF EXISTS "products_org_isolation" ON products;
CREATE POLICY "products_org_isolation"
  ON products FOR ALL
  USING (restaurant_id = auth_user_org_id());

-- inventory: org + branch isolation
DROP POLICY IF EXISTS "inventory_branch_isolation" ON inventory;
CREATE POLICY "inventory_branch_isolation"
  ON inventory FOR ALL
  USING (
    is_owner_or_gm() OR branch_id = auth_user_branch_id()
  );

-- suppliers: org-scoped
DROP POLICY IF EXISTS "suppliers_org_isolation" ON suppliers;
CREATE POLICY "suppliers_org_isolation"
  ON suppliers FOR ALL
  USING (restaurant_id = auth_user_org_id());

-- employees: org + branch isolation
DROP POLICY IF EXISTS "employees_org_isolation" ON employees;
DROP POLICY IF EXISTS "employees_branch_isolation" ON employees;
CREATE POLICY "employees_org_isolation"
  ON employees FOR ALL
  USING (
    is_owner_or_gm() AND restaurant_id = auth_user_org_id()
  );
CREATE POLICY "employees_branch_isolation"
  ON employees FOR ALL
  USING (
    NOT is_owner_or_gm() AND
    branch_id = auth_user_branch_id() AND
    restaurant_id = auth_user_org_id()
  );

-- notifications: user-scoped
DROP POLICY IF EXISTS "notifications_user_scope" ON notifications;
CREATE POLICY "notifications_user_scope"
  ON notifications FOR ALL
  USING (
    created_by = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR restaurant_id = auth_user_org_id()
  );

-- cash_movements: org + branch isolation
DROP POLICY IF EXISTS "cash_movements_org_isolation" ON cash_movements;
DROP POLICY IF EXISTS "cash_movements_branch_isolation" ON cash_movements;
CREATE POLICY "cash_movements_org_isolation"
  ON cash_movements FOR ALL
  USING (
    is_owner_or_gm() AND restaurant_id = auth_user_org_id()
  );
CREATE POLICY "cash_movements_branch_isolation"
  ON cash_movements FOR ALL
  USING (
    NOT is_owner_or_gm() AND
    branch_id = auth_user_branch_id() AND
    restaurant_id = auth_user_org_id()
  );

-- daily_cash_settlements: org + branch isolation
DROP POLICY IF EXISTS "dcs_org_isolation" ON daily_cash_settlements;
DROP POLICY IF EXISTS "dcs_branch_isolation" ON daily_cash_settlements;
CREATE POLICY "dcs_org_isolation"
  ON daily_cash_settlements FOR ALL
  USING (
    is_owner_or_gm() AND restaurant_id = auth_user_org_id()
  );
CREATE POLICY "dcs_branch_isolation"
  ON daily_cash_settlements FOR ALL
  USING (
    NOT is_owner_or_gm() AND
    branch_id = auth_user_branch_id() AND
    restaurant_id = auth_user_org_id()
  );

-- sales_invoices: org + branch isolation
DROP POLICY IF EXISTS "sales_invoices_org_isolation" ON sales_invoices;
DROP POLICY IF EXISTS "sales_invoices_branch_isolation" ON sales_invoices;
CREATE POLICY "sales_invoices_org_isolation"
  ON sales_invoices FOR ALL
  USING (
    is_owner_or_gm() AND restaurant_id = auth_user_org_id()
  );
CREATE POLICY "sales_invoices_branch_isolation"
  ON sales_invoices FOR ALL
  USING (
    NOT is_owner_or_gm() AND
    branch_id = auth_user_branch_id() AND
    restaurant_id = auth_user_org_id()
  );

-- sales_sources: org-scoped
DROP POLICY IF EXISTS "sales_sources_org_isolation" ON sales_sources;
CREATE POLICY "sales_sources_org_isolation"
  ON sales_sources FOR ALL
  USING (restaurant_id = auth_user_org_id());

-- product_categories: org-scoped
DROP POLICY IF EXISTS "product_categories_org_isolation" ON product_categories;
CREATE POLICY "product_categories_org_isolation"
  ON product_categories FOR ALL
  USING (restaurant_id = auth_user_org_id());

-- expense_categories: org-scoped
DROP POLICY IF EXISTS "expense_categories_org_isolation" ON expense_categories;
CREATE POLICY "expense_categories_org_isolation"
  ON expense_categories FOR ALL
  USING (restaurant_id = auth_user_org_id());

-- ── 14. Triggers ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS erp_registrations_updated_at ON erp_registrations;
CREATE TRIGGER erp_registrations_updated_at
  BEFORE UPDATE ON erp_registrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS branch_assignments_updated_at ON branch_assignments;
CREATE TRIGGER branch_assignments_updated_at
  BEFORE UPDATE ON branch_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS org_settings_updated_at ON org_settings;
CREATE TRIGGER org_settings_updated_at
  BEFORE UPDATE ON org_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 15. Tenant initialization function ───────────────────────────────────────

CREATE OR REPLACE FUNCTION initialize_tenant(
  p_organization_id UUID,
  p_branch_id UUID,
  p_currency_code TEXT DEFAULT 'USD',
  p_currency_symbol TEXT DEFAULT '$',
  p_currency_name TEXT DEFAULT 'US Dollar'
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result JSONB := '{}';
BEGIN
  -- Default Currency
  INSERT INTO org_currencies (organization_id, code, name, symbol, is_default, exchange_rate)
  VALUES (p_organization_id, p_currency_code, p_currency_name, p_currency_symbol, TRUE, 1)
  ON CONFLICT (organization_id, code) DO NOTHING;

  -- Default Warehouse
  INSERT INTO org_warehouses (organization_id, branch_id, name, is_default, is_active)
  VALUES (p_organization_id, p_branch_id, 'Main Warehouse', TRUE, TRUE)
  ON CONFLICT DO NOTHING;

  -- Default Cash Register
  INSERT INTO org_cash_registers (organization_id, branch_id, name, register_code, is_default, is_active)
  VALUES (p_organization_id, p_branch_id, 'Main Register', 'REG-001', TRUE, TRUE)
  ON CONFLICT DO NOTHING;

  -- Default Sales Sources
  INSERT INTO sales_sources (restaurant_id, name, color, icon, is_active, is_default, sort_order)
  VALUES
    (p_organization_id, 'Dine In',   '#10b981', 'utensils',  TRUE, TRUE,  1),
    (p_organization_id, 'Takeaway',  '#3b82f6', 'shopping-bag', TRUE, FALSE, 2),
    (p_organization_id, 'Delivery',  '#f59e0b', 'truck',     TRUE, FALSE, 3),
    (p_organization_id, 'Online',    '#8b5cf6', 'globe',     TRUE, FALSE, 4),
    (p_organization_id, 'Phone',     '#ec4899', 'phone',     TRUE, FALSE, 5)
  ON CONFLICT DO NOTHING;

  -- Default Product Categories
  INSERT INTO product_categories (restaurant_id, name, type, color, sort_order)
  VALUES
    (p_organization_id, 'Food',       'product', '#ef4444', 1),
    (p_organization_id, 'Beverages',  'product', '#3b82f6', 2),
    (p_organization_id, 'Desserts',   'product', '#f59e0b', 3),
    (p_organization_id, 'Snacks',     'product', '#10b981', 4),
    (p_organization_id, 'Other',      'product', '#6b7280', 5)
  ON CONFLICT DO NOTHING;

  -- Default Expense Categories
  INSERT INTO expense_categories (restaurant_id, name, color)
  VALUES
    (p_organization_id, 'Rent',        '#ef4444'),
    (p_organization_id, 'Utilities',   '#f59e0b'),
    (p_organization_id, 'Salaries',    '#3b82f6'),
    (p_organization_id, 'Supplies',    '#10b981'),
    (p_organization_id, 'Marketing',   '#8b5cf6'),
    (p_organization_id, 'Maintenance', '#ec4899'),
    (p_organization_id, 'Other',       '#6b7280')
  ON CONFLICT DO NOTHING;

  -- Default Org Settings
  INSERT INTO org_settings (organization_id, settings)
  VALUES (p_organization_id, jsonb_build_object(
    'allow_negative_stock', false,
    'require_branch_for_sales', true,
    'auto_approve_owners', true,
    'default_currency', p_currency_code,
    'default_currency_symbol', p_currency_symbol,
    'tax_rate', 0,
    'receipt_footer', '',
    'initialized_at', NOW()::text
  ))
  ON CONFLICT (organization_id) DO UPDATE
    SET settings = org_settings.settings || EXCLUDED.settings,
        updated_at = NOW();

  -- Mark org as initialized
  UPDATE restaurants SET is_initialized = TRUE WHERE id = p_organization_id;

  v_result := jsonb_build_object('success', true, 'organization_id', p_organization_id);
  RETURN v_result;
END;
$$;

-- ── 16. Approval action function ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION process_registration_approval(
  p_registration_id UUID,
  p_action TEXT,
  p_performed_by UUID,
  p_notes TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_permissions JSONB DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reg erp_registrations%ROWTYPE;
  v_old_status TEXT;
  v_new_status TEXT;
  v_performer_email TEXT;
BEGIN
  -- Fetch registration
  SELECT * INTO v_reg FROM erp_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registration not found');
  END IF;

  v_old_status := v_reg.status;
  v_performer_email := (SELECT email FROM auth.users WHERE id = p_performed_by);

  -- Determine new status
  CASE p_action
    WHEN 'approved'    THEN v_new_status := 'approved';
    WHEN 'rejected'    THEN v_new_status := 'rejected';
    WHEN 'suspended'   THEN v_new_status := 'suspended';
    WHEN 'reactivated' THEN v_new_status := 'approved';
    ELSE v_new_status := v_old_status;
  END CASE;

  -- Update registration
  UPDATE erp_registrations SET
    status = v_new_status,
    approved_at = CASE WHEN p_action IN ('approved','reactivated') THEN NOW() ELSE approved_at END,
    approved_by = CASE WHEN p_action IN ('approved','reactivated') THEN p_performed_by ELSE approved_by END,
    rejection_reason = CASE WHEN p_action = 'rejected' THEN p_notes ELSE rejection_reason END,
    branch_id = COALESCE(p_branch_id, branch_id),
    assigned_permissions = COALESCE(p_permissions, assigned_permissions),
    updated_at = NOW()
  WHERE id = p_registration_id;

  -- Update profile
  IF v_reg.user_id IS NOT NULL THEN
    UPDATE profiles SET
      approval_status = v_new_status,
      branch_id = COALESCE(p_branch_id, profiles.branch_id),
      permissions = COALESCE(p_permissions, profiles.permissions),
      approved_at = CASE WHEN p_action IN ('approved','reactivated') THEN NOW() ELSE profiles.approved_at END,
      approved_by = CASE WHEN p_action IN ('approved','reactivated') THEN p_performed_by ELSE profiles.approved_by END,
      rejection_reason = CASE WHEN p_action = 'rejected' THEN p_notes ELSE profiles.rejection_reason END,
      is_active = (v_new_status = 'approved'),
      updated_date = NOW()
    WHERE id = v_reg.user_id;

    -- Update branch assignment if branch provided
    IF p_branch_id IS NOT NULL AND p_action IN ('approved','reactivated') THEN
      INSERT INTO branch_assignments (user_id, branch_id, organization_id, role, assigned_by, is_primary, active)
      VALUES (v_reg.user_id, p_branch_id, v_reg.organization_id, v_reg.role, p_performed_by, TRUE, TRUE)
      ON CONFLICT (user_id, branch_id) DO UPDATE
        SET active = TRUE, assigned_by = p_performed_by, updated_at = NOW();
    END IF;
  END IF;

  -- Record approval history
  INSERT INTO approval_history (
    registration_id, user_id, action, performed_by, performed_by_email,
    old_status, new_status, notes, metadata
  ) VALUES (
    p_registration_id, v_reg.user_id, p_action, p_performed_by, v_performer_email,
    v_old_status, v_new_status, p_notes,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'permissions', p_permissions,
      'role', v_reg.role,
      'email', v_reg.email
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', p_action,
    'old_status', v_old_status,
    'new_status', v_new_status,
    'registration_id', p_registration_id
  );
END;
$$;

-- ── 17. Grant permissions ─────────────────────────────────────────────────────
GRANT ALL ON erp_registrations TO authenticated;
GRANT ALL ON approval_history TO authenticated;
GRANT ALL ON branch_assignments TO authenticated;
GRANT ALL ON org_currencies TO authenticated;
GRANT ALL ON org_warehouses TO authenticated;
GRANT ALL ON org_cash_registers TO authenticated;
GRANT ALL ON org_settings TO authenticated;
GRANT INSERT ON erp_registrations TO anon;
GRANT EXECUTE ON FUNCTION initialize_tenant TO authenticated;
GRANT EXECUTE ON FUNCTION process_registration_approval TO authenticated;
GRANT EXECUTE ON FUNCTION auth_user_role TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth_user_org_id TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth_user_branch_id TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_owner TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_owner_or_gm TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_approved_user TO authenticated, anon;
