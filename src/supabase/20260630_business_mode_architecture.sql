-- ============================================================
-- Business Mode Architecture Migration
-- Implements dual Restaurant / Retail mode at tenant & branch level
-- Date: 2026-06-30
-- ============================================================

-- ── 1. BUSINESS MODE ENUM ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE business_mode_type AS ENUM ('restaurant', 'retail');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. ADD BUSINESS MODE TO RESTAURANTS (Tenants) ───────────────────────────
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS business_mode business_mode_type NOT NULL DEFAULT 'restaurant';

-- ── 3. ADD BUSINESS MODE TO BRANCHES ────────────────────────────────────────
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS business_mode business_mode_type;
-- NULL means "inherit from parent restaurant"

-- ── 4. RETAIL PRODUCT FIELDS ─────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS barcode            TEXT,
  ADD COLUMN IF NOT EXISTS sku                TEXT,
  ADD COLUMN IF NOT EXISTS is_variant         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS parent_product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_attributes JSONB,
  ADD COLUMN IF NOT EXISTS batch_tracked      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expiry_tracked     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS serial_tracked     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reorder_point      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_quantity   NUMERIC DEFAULT 0;

-- Index for barcode and SKU lookups
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_parent ON products(parent_product_id) WHERE parent_product_id IS NOT NULL;

-- ── 5. RETAIL INVENTORY TRACKING FIELDS ──────────────────────────────────────
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS batch_number   TEXT,
  ADD COLUMN IF NOT EXISTS lot_number     TEXT,
  ADD COLUMN IF NOT EXISTS expiry_date    DATE,
  ADD COLUMN IF NOT EXISTS serial_number  TEXT,
  ADD COLUMN IF NOT EXISTS received_date  DATE;

CREATE INDEX IF NOT EXISTS idx_inventory_batch ON inventory(batch_number) WHERE batch_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_expiry ON inventory(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_serial ON inventory(serial_number) WHERE serial_number IS NOT NULL;

-- ── 6. RETAIL-SPECIFIC TABLES ─────────────────────────────────────────────────

-- Batch / Lot Tracking
CREATE TABLE IF NOT EXISTS inventory_batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES branches(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  batch_number    TEXT NOT NULL,
  lot_number      TEXT,
  quantity        NUMERIC NOT NULL DEFAULT 0,
  received_qty    NUMERIC NOT NULL DEFAULT 0,
  unit            TEXT,
  cost_per_unit   NUMERIC DEFAULT 0,
  expiry_date     DATE,
  manufacture_date DATE,
  supplier_id     UUID REFERENCES suppliers(id),
  status          TEXT NOT NULL DEFAULT 'active', -- active, expired, consumed, recalled
  notes           TEXT,
  created_by      TEXT,
  created_date    TIMESTAMPTZ DEFAULT NOW(),
  updated_date    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_batches_product ON inventory_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON inventory_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_batches_status ON inventory_batches(status);

-- Serial Number Tracking
CREATE TABLE IF NOT EXISTS product_serials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES branches(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES products(id) ON DELETE CASCADE,
  serial_number   TEXT NOT NULL,
  batch_id        UUID REFERENCES inventory_batches(id),
  status          TEXT NOT NULL DEFAULT 'in_stock', -- in_stock, sold, returned, defective
  purchase_date   DATE,
  sale_date       DATE,
  sale_id         UUID,
  customer_id     UUID REFERENCES customers(id),
  warranty_expiry DATE,
  notes           TEXT,
  created_by      TEXT,
  created_date    TIMESTAMPTZ DEFAULT NOW(),
  updated_date    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE product_serials ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS idx_serials_unique ON product_serials(product_id, serial_number);
CREATE INDEX IF NOT EXISTS idx_serials_status ON product_serials(status);

-- ── 7. RESTAURANT-SPECIFIC TABLES (ensure they exist) ────────────────────────

-- Table Service
CREATE TABLE IF NOT EXISTS dining_tables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES branches(id) ON DELETE CASCADE,
  table_number    TEXT NOT NULL,
  table_name      TEXT,
  capacity        INTEGER DEFAULT 4,
  section         TEXT,
  status          TEXT NOT NULL DEFAULT 'available', -- available, occupied, reserved, cleaning
  current_order_id UUID,
  qr_code_url     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      TEXT,
  created_date    TIMESTAMPTZ DEFAULT NOW(),
  updated_date    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE dining_tables ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_tables_branch ON dining_tables(branch_id);
CREATE INDEX IF NOT EXISTS idx_tables_status ON dining_tables(status);

-- Production Orders (Restaurant)
CREATE TABLE IF NOT EXISTS production_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES branches(id) ON DELETE CASCADE,
  recipe_id       UUID REFERENCES recipes(id),
  quantity        NUMERIC NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, cancelled
  scheduled_date  DATE,
  completed_date  DATE,
  notes           TEXT,
  ingredients_consumed JSONB,
  total_cost      NUMERIC DEFAULT 0,
  created_by      TEXT,
  created_date    TIMESTAMPTZ DEFAULT NOW(),
  updated_date    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_production_branch ON production_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_production_status ON production_orders(status);

-- ── 8. INVENTORY CONSUMPTION LOG (Dual Mode) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_consumption_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id       UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  branch_id           UUID REFERENCES branches(id) ON DELETE CASCADE,
  business_mode       business_mode_type NOT NULL,
  sale_id             UUID,
  sale_line_id        UUID,
  product_id          UUID REFERENCES products(id),
  recipe_id           UUID REFERENCES recipes(id),
  ingredient_id       UUID REFERENCES products(id),
  quantity_consumed   NUMERIC NOT NULL,
  unit                TEXT,
  batch_id            UUID REFERENCES inventory_batches(id),
  serial_id           UUID REFERENCES product_serials(id),
  consumption_type    TEXT NOT NULL DEFAULT 'sale', -- sale, waste, production, adjustment
  notes               TEXT,
  created_by          TEXT,
  created_date        TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE inventory_consumption_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_consumption_sale ON inventory_consumption_log(sale_id);
CREATE INDEX IF NOT EXISTS idx_consumption_product ON inventory_consumption_log(product_id);
CREATE INDEX IF NOT EXISTS idx_consumption_date ON inventory_consumption_log(created_date);

-- ── 9. BUSINESS MODE AWARE RLS POLICIES ──────────────────────────────────────

-- inventory_batches RLS
CREATE POLICY IF NOT EXISTS "Owner can manage batches" ON inventory_batches
  FOR ALL USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE created_by = auth.uid()::text
    )
  );

-- product_serials RLS
CREATE POLICY IF NOT EXISTS "Owner can manage serials" ON product_serials
  FOR ALL USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE created_by = auth.uid()::text
    )
  );

-- dining_tables RLS
CREATE POLICY IF NOT EXISTS "Owner can manage tables" ON dining_tables
  FOR ALL USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE created_by = auth.uid()::text
    )
  );

-- production_orders RLS
CREATE POLICY IF NOT EXISTS "Owner can manage production" ON production_orders
  FOR ALL USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE created_by = auth.uid()::text
    )
  );

-- inventory_consumption_log RLS
CREATE POLICY IF NOT EXISTS "Owner can view consumption" ON inventory_consumption_log
  FOR ALL USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE created_by = auth.uid()::text
    )
  );

-- ── 10. UPDATE TRIGGERS ───────────────────────────────────────────────────────
CREATE OR REPLACE TRIGGER trg_inventory_batches
  BEFORE UPDATE ON inventory_batches
  FOR EACH ROW EXECUTE FUNCTION update_updated_date();

CREATE OR REPLACE TRIGGER trg_product_serials
  BEFORE UPDATE ON product_serials
  FOR EACH ROW EXECUTE FUNCTION update_updated_date();

CREATE OR REPLACE TRIGGER trg_dining_tables
  BEFORE UPDATE ON dining_tables
  FOR EACH ROW EXECUTE FUNCTION update_updated_date();

CREATE OR REPLACE TRIGGER trg_production_orders
  BEFORE UPDATE ON production_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_date();

-- ── 11. FUNCTION: Get effective business mode for a branch ────────────────────
CREATE OR REPLACE FUNCTION get_branch_business_mode(p_branch_id UUID)
RETURNS business_mode_type
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode business_mode_type;
  v_restaurant_id UUID;
BEGIN
  -- First check if branch has its own mode set
  SELECT business_mode, restaurant_id INTO v_mode, v_restaurant_id
  FROM branches WHERE id = p_branch_id;

  IF v_mode IS NOT NULL THEN
    RETURN v_mode;
  END IF;

  -- Fall back to restaurant's mode
  SELECT business_mode INTO v_mode
  FROM restaurants WHERE id = v_restaurant_id;

  RETURN COALESCE(v_mode, 'restaurant');
END;
$$;

-- ── 12. FUNCTION: Process sale inventory consumption ─────────────────────────
CREATE OR REPLACE FUNCTION process_sale_inventory_consumption(
  p_sale_id UUID,
  p_branch_id UUID,
  p_items JSONB  -- [{product_id, quantity, recipe_id?}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode business_mode_type;
  v_restaurant_id UUID;
  v_item JSONB;
  v_ingredient JSONB;
  v_result JSONB := '{"success": true, "consumed": []}'::JSONB;
BEGIN
  -- Get branch business mode
  SELECT r.id, get_branch_business_mode(p_branch_id)
  INTO v_restaurant_id, v_mode
  FROM branches b
  JOIN restaurants r ON r.id = b.restaurant_id
  WHERE b.id = p_branch_id;

  IF v_mode = 'retail' THEN
    -- RETAIL MODE: Consume sold products directly
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      UPDATE inventory
      SET opening_stock = opening_stock - (v_item->>'quantity')::NUMERIC
      WHERE product_id = (v_item->>'product_id')::TEXT
        AND branch = p_branch_id::TEXT;

      INSERT INTO inventory_consumption_log (
        restaurant_id, branch_id, business_mode, sale_id,
        product_id, quantity_consumed, consumption_type
      ) VALUES (
        v_restaurant_id, p_branch_id, 'retail', p_sale_id,
        (v_item->>'product_id')::UUID, (v_item->>'quantity')::NUMERIC, 'sale'
      );
    END LOOP;
  ELSE
    -- RESTAURANT MODE: Consume recipe ingredients
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      IF v_item->>'recipe_id' IS NOT NULL THEN
        FOR v_ingredient IN
          SELECT * FROM jsonb_array_elements(
            (SELECT ingredients::JSONB FROM recipes WHERE id = (v_item->>'recipe_id')::UUID)
          )
        LOOP
          UPDATE inventory
          SET opening_stock = opening_stock -
            ((v_ingredient->>'qty')::NUMERIC * (v_item->>'quantity')::NUMERIC)
          WHERE product_id = (v_ingredient->>'product_id')::TEXT
            AND branch = p_branch_id::TEXT;

          INSERT INTO inventory_consumption_log (
            restaurant_id, branch_id, business_mode, sale_id,
            recipe_id, ingredient_id, quantity_consumed, unit, consumption_type
          ) VALUES (
            v_restaurant_id, p_branch_id, 'restaurant', p_sale_id,
            (v_item->>'recipe_id')::UUID,
            (v_ingredient->>'product_id')::UUID,
            (v_ingredient->>'qty')::NUMERIC * (v_item->>'quantity')::NUMERIC,
            v_ingredient->>'unit',
            'sale'
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  RETURN v_result;
END;
$$;

-- ── 13. VIEW: Inventory with business mode context ────────────────────────────
CREATE OR REPLACE VIEW inventory_with_mode AS
SELECT
  i.*,
  p.barcode,
  p.sku,
  p.batch_tracked,
  p.expiry_tracked,
  p.serial_tracked,
  get_branch_business_mode(b.id) AS effective_business_mode
FROM inventory i
JOIN products p ON p.id::text = i.product_id
LEFT JOIN branches b ON b.id::text = i.branch;

-- ── 14. INDEXES FOR PERFORMANCE ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_restaurants_business_mode ON restaurants(business_mode);
CREATE INDEX IF NOT EXISTS idx_branches_business_mode ON branches(business_mode);
