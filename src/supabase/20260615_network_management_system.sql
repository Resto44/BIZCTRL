-- ============================================================
-- Network Management System — Database Schema
-- Modules: Multi-Branch Control, Central Inventory, Inter-Branch Transfers,
--          Central Purchasing, Shared Customers, and Driver Network
-- ============================================================

-- ── 1. TRANSFER REQUESTS (Inter-Branch Transfers with Approval Workflow) ──
CREATE TABLE IF NOT EXISTS transfer_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  from_branch       TEXT NOT NULL,
  to_branch         TEXT NOT NULL,
  product_id        TEXT NOT NULL,
  product_name      TEXT,
  quantity          NUMERIC NOT NULL DEFAULT 0,
  unit              TEXT,
  status            TEXT DEFAULT 'pending', -- pending, approved, shipped, received, rejected
  approval_by       TEXT,
  approval_date     TIMESTAMPTZ,
  shipped_date      TIMESTAMPTZ,
  received_date     TIMESTAMPTZ,
  notes             TEXT,
  created_by        TEXT,
  created_date      TIMESTAMPTZ DEFAULT NOW(),
  updated_date      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE transfer_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_transfer_requests_status ON transfer_requests(status);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_branches ON transfer_requests(from_branch, to_branch);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_date ON transfer_requests(created_date);

-- ── 2. NETWORK CUSTOMERS (Shared Customer Profiles Across Branches) ──
CREATE TABLE IF NOT EXISTS network_customers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  phone             TEXT,
  email             TEXT,
  address           TEXT,
  loyalty_points    NUMERIC DEFAULT 0,
  total_purchases   NUMERIC DEFAULT 0,
  visit_count       INTEGER DEFAULT 0,
  last_visit_date   DATE,
  is_active         BOOLEAN DEFAULT TRUE,
  notes             TEXT,
  created_by        TEXT,
  created_date      TIMESTAMPTZ DEFAULT NOW(),
  updated_date      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE network_customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_network_customers_phone ON network_customers(phone);
CREATE INDEX IF NOT EXISTS idx_network_customers_email ON network_customers(email);

-- ── 3. NETWORK CUSTOMER TRANSACTIONS (Cross-Branch Purchase History) ──
CREATE TABLE IF NOT EXISTS network_customer_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_customer_id UUID REFERENCES network_customers(id) ON DELETE CASCADE,
  branch            TEXT NOT NULL,
  transaction_date  DATE NOT NULL,
  amount            NUMERIC NOT NULL DEFAULT 0,
  transaction_type  TEXT DEFAULT 'purchase', -- purchase, refund, loyalty_redemption
  notes             TEXT,
  created_date      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE network_customer_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_network_customer_transactions_date ON network_customer_transactions(transaction_date);

-- ── 4. SHARED SUPPLIERS (Network-Wide Supplier Management) ──
CREATE TABLE IF NOT EXISTS network_suppliers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  phone             TEXT,
  email             TEXT,
  address           TEXT,
  payment_terms     TEXT,
  performance_score NUMERIC DEFAULT 0, -- 0-100
  total_purchases   NUMERIC DEFAULT 0,
  is_active         BOOLEAN DEFAULT TRUE,
  notes             TEXT,
  created_by        TEXT,
  created_date      TIMESTAMPTZ DEFAULT NOW(),
  updated_date      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE network_suppliers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_network_suppliers_name ON network_suppliers(name);

-- ── 5. SHARED CONTRACTS (Group Purchasing Agreements) ──
CREATE TABLE IF NOT EXISTS network_contracts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  supplier_id       UUID REFERENCES network_suppliers(id) ON DELETE CASCADE,
  product_id        TEXT NOT NULL,
  product_name      TEXT,
  agreed_price      NUMERIC NOT NULL DEFAULT 0,
  contract_start    DATE NOT NULL,
  contract_end      DATE NOT NULL,
  minimum_order_qty NUMERIC DEFAULT 0,
  discount_percent  NUMERIC DEFAULT 0,
  status            TEXT DEFAULT 'active', -- active, expired, suspended
  notes             TEXT,
  created_by        TEXT,
  created_date      TIMESTAMPTZ DEFAULT NOW(),
  updated_date      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE network_contracts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_network_contracts_supplier ON network_contracts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_network_contracts_status ON network_contracts(status);

-- ── 6. DRIVER ALLOCATIONS (Cross-Branch Driver Management) ──
CREATE TABLE IF NOT EXISTS driver_allocations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  driver_id         TEXT NOT NULL,
  driver_name       TEXT,
  assigned_branch   TEXT NOT NULL,
  secondary_branches TEXT[], -- Array of branch keys for multi-branch assignments
  allocation_date   DATE NOT NULL,
  status            TEXT DEFAULT 'active', -- active, inactive, on_leave
  performance_score NUMERIC DEFAULT 0,
  total_debt        NUMERIC DEFAULT 0,
  created_by        TEXT,
  created_date      TIMESTAMPTZ DEFAULT NOW(),
  updated_date      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE driver_allocations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_driver_allocations_branch ON driver_allocations(assigned_branch);
CREATE INDEX IF NOT EXISTS idx_driver_allocations_driver ON driver_allocations(driver_id);

-- ── 7. DRIVER PERFORMANCE (Network-Wide Driver Analytics) ──
CREATE TABLE IF NOT EXISTS driver_performance (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  driver_id         TEXT NOT NULL,
  month             DATE NOT NULL, -- First day of the month
  deliveries        INTEGER DEFAULT 0,
  on_time_count     INTEGER DEFAULT 0,
  late_count        INTEGER DEFAULT 0,
  cancelled_count   INTEGER DEFAULT 0,
  total_revenue     NUMERIC DEFAULT 0,
  rating            NUMERIC DEFAULT 0, -- 0-5
  notes             TEXT,
  created_date      TIMESTAMPTZ DEFAULT NOW(),
  updated_date      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, driver_id, month)
);
ALTER TABLE driver_performance ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_driver_performance_month ON driver_performance(month);

-- ── 8. BRANCH HEALTH SCORE (Real-Time Operational Status) ──
CREATE TABLE IF NOT EXISTS branch_health_scores (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  branch            TEXT NOT NULL,
  date              DATE NOT NULL,
  revenue_score     NUMERIC DEFAULT 0, -- 0-100
  inventory_score   NUMERIC DEFAULT 0, -- 0-100
  staff_score       NUMERIC DEFAULT 0, -- 0-100
  customer_score    NUMERIC DEFAULT 0, -- 0-100
  operational_score NUMERIC DEFAULT 0, -- 0-100
  overall_health    NUMERIC DEFAULT 0, -- 0-100 (average)
  status            TEXT DEFAULT 'healthy', -- healthy, warning, critical
  notes             TEXT,
  created_date      TIMESTAMPTZ DEFAULT NOW(),
  updated_date      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, branch, date)
);
ALTER TABLE branch_health_scores ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_branch_health_date ON branch_health_scores(date);
CREATE INDEX IF NOT EXISTS idx_branch_health_status ON branch_health_scores(status);

-- ── 9. NETWORK ANALYTICS SNAPSHOT (Pre-Calculated Metrics) ──
CREATE TABLE IF NOT EXISTS network_analytics_snapshot (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  snapshot_date     DATE NOT NULL,
  total_branches    INTEGER DEFAULT 0,
  active_branches   INTEGER DEFAULT 0,
  total_revenue     NUMERIC DEFAULT 0,
  total_profit      NUMERIC DEFAULT 0,
  avg_food_cost_pct NUMERIC DEFAULT 0,
  top_branch_by_revenue TEXT,
  top_branch_by_profit TEXT,
  created_date      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, snapshot_date)
);
ALTER TABLE network_analytics_snapshot ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_network_analytics_date ON network_analytics_snapshot(snapshot_date);

-- ── TRIGGERS ──────────────────────────────────────────────────────────────
CREATE OR REPLACE TRIGGER trg_transfer_requests BEFORE UPDATE ON transfer_requests FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE OR REPLACE TRIGGER trg_network_customers BEFORE UPDATE ON network_customers FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE OR REPLACE TRIGGER trg_network_suppliers BEFORE UPDATE ON network_suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE OR REPLACE TRIGGER trg_network_contracts BEFORE UPDATE ON network_contracts FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE OR REPLACE TRIGGER trg_driver_allocations BEFORE UPDATE ON driver_allocations FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE OR REPLACE TRIGGER trg_driver_performance BEFORE UPDATE ON driver_performance FOR EACH ROW EXECUTE FUNCTION update_updated_date();
CREATE OR REPLACE TRIGGER trg_branch_health_scores BEFORE UPDATE ON branch_health_scores FOR EACH ROW EXECUTE FUNCTION update_updated_date();

-- ── RLS POLICIES ──────────────────────────────────────────────────────────

-- Owner: Manage all network data
CREATE POLICY "Transfer Requests: owner manage all" ON transfer_requests FOR ALL USING (restaurant_id IN (SELECT id FROM restaurants WHERE org_id = (auth.jwt() ->> 'email'))) WITH CHECK (restaurant_id IN (SELECT id FROM restaurants WHERE org_id = (auth.jwt() ->> 'email')));
CREATE POLICY "Network Customers: owner manage all" ON network_customers FOR ALL USING (restaurant_id IN (SELECT id FROM restaurants WHERE org_id = (auth.jwt() ->> 'email'))) WITH CHECK (restaurant_id IN (SELECT id FROM restaurants WHERE org_id = (auth.jwt() ->> 'email')));
CREATE POLICY "Network Suppliers: owner manage all" ON network_suppliers FOR ALL USING (restaurant_id IN (SELECT id FROM restaurants WHERE org_id = (auth.jwt() ->> 'email'))) WITH CHECK (restaurant_id IN (SELECT id FROM restaurants WHERE org_id = (auth.jwt() ->> 'email')));
CREATE POLICY "Network Contracts: owner manage all" ON network_contracts FOR ALL USING (restaurant_id IN (SELECT id FROM restaurants WHERE org_id = (auth.jwt() ->> 'email'))) WITH CHECK (restaurant_id IN (SELECT id FROM restaurants WHERE org_id = (auth.jwt() ->> 'email')));
CREATE POLICY "Driver Allocations: owner manage all" ON driver_allocations FOR ALL USING (restaurant_id IN (SELECT id FROM restaurants WHERE org_id = (auth.jwt() ->> 'email'))) WITH CHECK (restaurant_id IN (SELECT id FROM restaurants WHERE org_id = (auth.jwt() ->> 'email')));
CREATE POLICY "Driver Performance: owner manage all" ON driver_performance FOR ALL USING (restaurant_id IN (SELECT id FROM restaurants WHERE org_id = (auth.jwt() ->> 'email'))) WITH CHECK (restaurant_id IN (SELECT id FROM restaurants WHERE org_id = (auth.jwt() ->> 'email')));
CREATE POLICY "Branch Health: owner manage all" ON branch_health_scores FOR ALL USING (restaurant_id IN (SELECT id FROM restaurants WHERE org_id = (auth.jwt() ->> 'email'))) WITH CHECK (restaurant_id IN (SELECT id FROM restaurants WHERE org_id = (auth.jwt() ->> 'email')));
CREATE POLICY "Network Analytics: owner manage all" ON network_analytics_snapshot FOR ALL USING (restaurant_id IN (SELECT id FROM restaurants WHERE org_id = (auth.jwt() ->> 'email'))) WITH CHECK (restaurant_id IN (SELECT id FROM restaurants WHERE org_id = (auth.jwt() ->> 'email')));

-- Staff: View branch-specific data
CREATE POLICY "Transfer Requests: staff view branch" ON transfer_requests FOR SELECT USING (from_branch = (SELECT branch FROM profiles WHERE id = auth.uid()) OR to_branch = (SELECT branch FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Network Customers: staff view all" ON network_customers FOR SELECT USING (restaurant_id IN (SELECT restaurant_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Driver Allocations: staff view branch" ON driver_allocations FOR SELECT USING (assigned_branch = (SELECT branch FROM profiles WHERE id = auth.uid()));
CREATE POLICY "Branch Health: staff view branch" ON branch_health_scores FOR SELECT USING (branch = (SELECT branch FROM profiles WHERE id = auth.uid()));
