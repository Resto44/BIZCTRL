-- ============================================================
-- ERP Multi-Tenant Architecture Migration
-- Date: 2026-07-15
-- Description: Adds branch architecture, unified role support,
--              and tenant isolation for supported portal roles.
-- ============================================================

-- 1. Ensure supported portal roles are available in profiles and app
-- Roles: owner, general_manager, manager, employee, supplier
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Create branch_assignments table to handle multi-branch managers and staff
CREATE TABLE IF NOT EXISTS branch_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_assignments_user ON branch_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_branch_assignments_branch ON branch_assignments(branch_id);

ALTER TABLE branch_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own branch assignments"
  ON branch_assignments FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Owners can manage branch assignments for their restaurants"
  ON branch_assignments FOR ALL
  USING (
    restaurant_id IN (SELECT id FROM restaurants WHERE created_by = auth.uid()::text)
  );

-- 3. Unified ERP Registration Table (replacing scattered invites)
CREATE TABLE IF NOT EXISTS erp_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  rejection_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_erp_registrations_email ON erp_registrations(email);
CREATE INDEX IF NOT EXISTS idx_erp_registrations_restaurant ON erp_registrations(restaurant_id);

ALTER TABLE erp_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own registrations"
  ON erp_registrations FOR SELECT
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Owners can manage registrations for their restaurants"
  ON erp_registrations FOR ALL
  USING (
    restaurant_id IN (SELECT id FROM restaurants WHERE created_by = auth.uid()::text)
  );

CREATE POLICY "Anyone can register"
  ON erp_registrations FOR INSERT
  WITH CHECK (true);

-- 4. Triggers
CREATE OR REPLACE FUNCTION update_erp_registrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS erp_registrations_updated_at ON erp_registrations;
CREATE TRIGGER erp_registrations_updated_at
  BEFORE UPDATE ON erp_registrations
  FOR EACH ROW EXECUTE FUNCTION update_erp_registrations_updated_at();

-- 5. Helper function for RLS to check branch access
CREATE OR REPLACE FUNCTION has_branch_access(check_branch_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
  user_restaurant_id UUID;
BEGIN
  -- Owner check
  IF EXISTS (
    SELECT 1 FROM branches b
    JOIN restaurants r ON b.restaurant_id = r.id
    WHERE b.id = check_branch_id AND r.created_by = auth.uid()::text
  ) THEN
    RETURN TRUE;
  END IF;

  -- Assignment check
  IF EXISTS (
    SELECT 1 FROM branch_assignments
    WHERE user_id = auth.uid() AND branch_id = check_branch_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
