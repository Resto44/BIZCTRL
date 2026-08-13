-- ============================================================
-- Online Ordering V2 — Production-Ready Schema
-- Date: 2026-06-22
-- Project: Smart Restaurant ERP
-- Module: Online Ordering V2
-- ============================================================

-- ── 1. CUSTOMER ENHANCEMENTS (Wallet & Loyalty) ─────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS loyalty_points    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cashback_wallet   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_code     TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by       UUID REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS password_hash     TEXT,
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{"push": true, "email": true, "sms": false, "whatsapp": true}'::jsonb;

-- ── 2. CUSTOMER ADDRESSES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_addresses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID REFERENCES customers(id) ON DELETE CASCADE,
  label         TEXT, -- 'Home', 'Work', etc.
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city          TEXT,
  latitude      NUMERIC,
  longitude     NUMERIC,
  delivery_instructions TEXT,
  is_default    BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. PROMOTIONS & COUPONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,
  type             TEXT DEFAULT 'percentage' CHECK (type IN ('percentage', 'fixed', 'free_delivery', 'cashback')),
  value            NUMERIC DEFAULT 0,
  min_order_amount NUMERIC DEFAULT 0,
  max_discount     NUMERIC,
  start_date       TIMESTAMPTZ,
  end_date         TIMESTAMPTZ,
  is_active        BOOLEAN DEFAULT true,
  usage_limit      INTEGER,
  times_used       INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. ADVANCED ORDERS TABLE ENHANCEMENTS ───────────────────────────────
-- The orders table already exists, we enhance it for V2 flow
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_number         TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS order_type           TEXT DEFAULT 'delivery' CHECK (order_type IN ('delivery', 'pickup', 'dine_in')),
  ADD COLUMN IF NOT EXISTS payment_method       TEXT DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS payment_status       TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  ADD COLUMN IF NOT EXISTS delivery_status      TEXT DEFAULT 'unassigned' CHECK (delivery_status IN ('unassigned', 'assigned', 'picked_up', 'on_the_way', 'arrived', 'delivered')),
  ADD COLUMN IF NOT EXISTS priority             TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS delivery_address_id  UUID REFERENCES customer_addresses(id),
  ADD COLUMN IF NOT EXISTS driver_id            UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS promotion_id         UUID REFERENCES promotions(id),
  ADD COLUMN IF NOT EXISTS discount_amount      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee         NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount           NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal             NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_used          NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_points_earned INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_delivery_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_delivery_time    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason  TEXT,
  ADD COLUMN IF NOT EXISTS customer_notes       TEXT;

-- ── 5. ORDER TRACKING EVENTS (Real-time Timeline) ───────────────────────
CREATE TABLE IF NOT EXISTS order_tracking (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID REFERENCES orders(id) ON DELETE CASCADE,
  status        TEXT NOT NULL,
  description   TEXT,
  actor_id      UUID REFERENCES profiles(id), -- user or manager who triggered
  actor_role    TEXT,
  location_lat  NUMERIC,
  location_lng  NUMERIC,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. DRIVER LOCATIONS (Real-time Tracking) ────────────────────────────
CREATE TABLE IF NOT EXISTS driver_locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  order_id      UUID REFERENCES orders(id) ON DELETE CASCADE,
  latitude      NUMERIC NOT NULL,
  longitude     NUMERIC NOT NULL,
  heading       NUMERIC,
  speed         NUMERIC,
  timestamp     TIMESTAMPTZ DEFAULT NOW()
);

-- ── 7. CART ITEMS (For Customer App/PWA) ────────────────────────────────
CREATE TABLE IF NOT EXISTS cart_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID REFERENCES customers(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id) ON DELETE CASCADE,
  quantity      NUMERIC DEFAULT 1,
  modifiers     JSONB DEFAULT '[]'::jsonb,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 8. LOYALTY TRANSACTIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID REFERENCES customers(id) ON DELETE CASCADE,
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
  type          TEXT NOT NULL CHECK (type IN ('earned', 'redeemed', 'expired', 'bonus')),
  points        INTEGER NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 9. WALLET TRANSACTIONS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID REFERENCES customers(id) ON DELETE CASCADE,
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
  type          TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'cashback', 'refund')),
  amount        NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS POLICIES ────────────────────────────────────────────────────────
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Allow public reads for promotions
CREATE POLICY "Public promotions" ON promotions FOR SELECT USING (is_active = true);

-- Enable realtime for critical tables
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_tracking;
ALTER PUBLICATION supabase_realtime ADD TABLE driver_locations;
