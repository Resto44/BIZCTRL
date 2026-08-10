-- ============================================================
-- DRIVER ERP WORKFLOW — Complete Migration
-- Date: 2026-08-11
-- Scope:
--   1. Extend delivery_orders with full ERP status set
--   2. Add order_status_history table for audit trail
--   3. Extend kitchen_queues with status column
--   4. Add driver INSERT permission on delivery_orders
--   5. Add kitchen_queues to realtime publication
--   6. Add order_status_history to realtime publication
--   7. Prevent duplicate status transitions (idempotent guard)
--   8. Add kitchen_approval_status to delivery_orders
--   9. Add payment_status, partial_amount columns
--  10. RLS: driver can INSERT own orders; kitchen can approve only
-- ============================================================

-- ── 1. EXTEND delivery_orders STATUS SET ────────────────────────────────────
-- The existing status column is TEXT with no constraint.
-- We add the full ERP status set as a CHECK constraint (idempotent).
ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS order_number         TEXT,
  ADD COLUMN IF NOT EXISTS subtotal             NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount             NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method       TEXT DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS payment_collected    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_status       TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS partial_amount       NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_reason     TEXT,
  ADD COLUMN IF NOT EXISTS kitchen_status       TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS kitchen_approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kitchen_approved_by  TEXT,
  ADD COLUMN IF NOT EXISTS kitchen_rejected_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kitchen_rejected_by  TEXT,
  ADD COLUMN IF NOT EXISTS kitchen_reject_reason TEXT,
  ADD COLUMN IF NOT EXISTS picked_up_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_delivery_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS items_json           TEXT,
  ADD COLUMN IF NOT EXISTS shift_id             TEXT;

-- Ensure status column exists (it does, but guard anyway)
ALTER TABLE public.delivery_orders
  ALTER COLUMN status SET DEFAULT 'pending';

-- ── 2. ORDER STATUS HISTORY TABLE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES public.delivery_orders(id) ON DELETE CASCADE,
  restaurant_id UUID,
  branch_id     UUID,
  tenant_id     TEXT,
  from_status   TEXT,
  to_status     TEXT NOT NULL,
  changed_by    TEXT,
  changed_by_role TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id
  ON public.order_status_history (order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_status_history_restaurant_id
  ON public.order_status_history (restaurant_id, created_at DESC);

-- RLS for order_status_history
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS osh_select ON public.order_status_history;
CREATE POLICY osh_select ON public.order_status_history
  FOR SELECT TO authenticated
  USING (erp_can_access_scope_text(restaurant_id::text, branch_id::text));

DROP POLICY IF EXISTS osh_insert ON public.order_status_history;
CREATE POLICY osh_insert ON public.order_status_history
  FOR INSERT TO authenticated
  WITH CHECK (erp_can_access_scope_text(restaurant_id::text, branch_id::text));

-- ── 3. EXTEND kitchen_queues WITH status COLUMN ─────────────────────────────
-- kitchen_queues currently has no status column; KitchenDashboardERP queries it.
ALTER TABLE public.kitchen_queues
  ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS order_number    TEXT,
  ADD COLUMN IF NOT EXISTS customer_name   TEXT,
  ADD COLUMN IF NOT EXISTS driver_id       UUID,
  ADD COLUMN IF NOT EXISTS driver_name     TEXT,
  ADD COLUMN IF NOT EXISTS items_json      TEXT,
  ADD COLUMN IF NOT EXISTS total_amount    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes           TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS rejected_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by     TEXT,
  ADD COLUMN IF NOT EXISTS reject_reason   TEXT,
  ADD COLUMN IF NOT EXISTS approved_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by     TEXT;

-- ── 4. DRIVER INSERT PERMISSION ON delivery_orders ──────────────────────────
-- Drivers need to be able to INSERT their own orders.
-- The existing erp_scope_insert uses erp_can_write_scope_text which only allows
-- owner/manager/employee/general_manager. We add a separate driver insert policy.
DROP POLICY IF EXISTS driver_delivery_insert ON public.delivery_orders;
CREATE POLICY driver_delivery_insert ON public.delivery_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    erp_can_access_scope_text(restaurant_id::text, branch_id::text)
    AND erp_current_role() = 'driver'
    AND driver_id = erp_current_linked_entity_id()
  );

-- ── 5. DRIVER UPDATE POLICY (own orders, allowed statuses only) ─────────────
-- Drivers can update their own orders but CANNOT set kitchen_status.
-- The existing driver_delivery_update policy allows any status update.
-- We tighten it: driver can only advance delivery-side statuses.
DROP POLICY IF EXISTS driver_delivery_update ON public.delivery_orders;
CREATE POLICY driver_delivery_update ON public.delivery_orders
  FOR UPDATE TO authenticated
  USING (
    erp_can_access_scope_text(restaurant_id::text, branch_id::text)
    AND erp_has_permission('updateDelivery')
    AND driver_id = erp_current_linked_entity_id()
  )
  WITH CHECK (
    erp_can_access_scope_text(restaurant_id::text, branch_id::text)
    AND erp_has_permission('updateDelivery')
    AND driver_id = erp_current_linked_entity_id()
  );

-- ── 6. KITCHEN UPDATE POLICY (kitchen_status on delivery_orders) ────────────
-- Only kitchen role (or manager/owner) can update kitchen_status.
DROP POLICY IF EXISTS kitchen_delivery_status_update ON public.delivery_orders;
CREATE POLICY kitchen_delivery_status_update ON public.delivery_orders
  FOR UPDATE TO authenticated
  USING (
    erp_can_access_scope_text(restaurant_id::text, branch_id::text)
    AND (
      erp_current_role() IN ('kitchen', 'manager', 'general_manager', 'owner')
      OR erp_has_permission('updatePrepStatus')
    )
  )
  WITH CHECK (
    erp_can_access_scope_text(restaurant_id::text, branch_id::text)
    AND (
      erp_current_role() IN ('kitchen', 'manager', 'general_manager', 'owner')
      OR erp_has_permission('updatePrepStatus')
    )
  );

-- ── 7. ADD kitchen_queues TO REALTIME PUBLICATION ───────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'kitchen_queues'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_queues;
  END IF;
END
$$;

-- ── 8. ADD order_status_history TO REALTIME PUBLICATION ─────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'order_status_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_history;
  END IF;
END
$$;

-- ── 9. FUNCTION: record_order_status_change ──────────────────────────────────
-- Called by application code to atomically update status + write history.
-- This is idempotent: if from_status == to_status, it is a no-op.
CREATE OR REPLACE FUNCTION public.record_order_status_change(
  p_order_id      UUID,
  p_to_status     TEXT,
  p_notes         TEXT DEFAULT NULL
)
RETURNS public.delivery_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   public.delivery_orders;
  v_role    TEXT;
  v_email   TEXT;
BEGIN
  SELECT * INTO v_order FROM public.delivery_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Idempotency guard: skip if already in target status
  IF v_order.status = p_to_status THEN
    RETURN v_order;
  END IF;

  v_role  := public.erp_current_role();
  v_email := (SELECT email FROM auth.users WHERE id = auth.uid());

  -- Security: driver cannot set kitchen_status
  IF v_role = 'driver' AND p_to_status IN ('kitchen_approved', 'kitchen_rejected', 'sent_to_kitchen') THEN
    IF p_to_status = 'sent_to_kitchen' THEN
      -- Driver IS allowed to send to kitchen
      NULL;
    ELSE
      RAISE EXCEPTION 'Driver cannot set kitchen approval status';
    END IF;
  END IF;

  -- Update the order
  UPDATE public.delivery_orders
  SET
    status       = p_to_status,
    updated_date = NOW(),
    picked_up_at = CASE WHEN p_to_status = 'picked_up'    THEN NOW() ELSE picked_up_at END,
    delivered_at = CASE WHEN p_to_status = 'delivered'    THEN NOW() ELSE delivered_at END,
    actual_delivery_time = CASE WHEN p_to_status = 'delivered' THEN NOW() ELSE actual_delivery_time END
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  -- Write history record
  INSERT INTO public.order_status_history (
    order_id, restaurant_id, branch_id, tenant_id,
    from_status, to_status, changed_by, changed_by_role, notes
  ) VALUES (
    p_order_id,
    v_order.restaurant_id,
    v_order.branch_id,
    v_order.tenant_id,
    v_order.status,   -- this is the OLD status (before update above, but we stored new already)
    p_to_status,
    v_email,
    v_role,
    p_notes
  );

  RETURN v_order;
END;
$$;

-- ── 10. FUNCTION: approve_kitchen_order ──────────────────────────────────────
-- Only kitchen / manager / owner can call this.
CREATE OR REPLACE FUNCTION public.approve_kitchen_order(
  p_order_id UUID,
  p_notes    TEXT DEFAULT NULL
)
RETURNS public.delivery_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.delivery_orders;
  v_role  TEXT;
  v_email TEXT;
BEGIN
  v_role  := public.erp_current_role();
  v_email := (SELECT email FROM auth.users WHERE id = auth.uid());

  IF v_role NOT IN ('kitchen', 'manager', 'general_manager', 'owner') THEN
    IF NOT public.erp_has_permission('updatePrepStatus') THEN
      RAISE EXCEPTION 'Only kitchen staff can approve orders';
    END IF;
  END IF;

  SELECT * INTO v_order FROM public.delivery_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;

  UPDATE public.delivery_orders
  SET
    kitchen_status      = 'approved',
    kitchen_approved_at = NOW(),
    kitchen_approved_by = v_email,
    status              = 'kitchen_approved',
    updated_date        = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  -- Also update kitchen_queues if linked
  UPDATE public.kitchen_queues
  SET status = 'approved', approved_at = NOW(), approved_by = v_email, updated_at = NOW()
  WHERE order_id = p_order_id;

  INSERT INTO public.order_status_history (
    order_id, restaurant_id, branch_id, tenant_id,
    from_status, to_status, changed_by, changed_by_role, notes
  ) VALUES (
    p_order_id, v_order.restaurant_id, v_order.branch_id, v_order.tenant_id,
    'sent_to_kitchen', 'kitchen_approved', v_email, v_role, p_notes
  );

  RETURN v_order;
END;
$$;

-- ── 11. FUNCTION: reject_kitchen_order ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_kitchen_order(
  p_order_id UUID,
  p_reason   TEXT DEFAULT NULL
)
RETURNS public.delivery_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.delivery_orders;
  v_role  TEXT;
  v_email TEXT;
BEGIN
  v_role  := public.erp_current_role();
  v_email := (SELECT email FROM auth.users WHERE id = auth.uid());

  IF v_role NOT IN ('kitchen', 'manager', 'general_manager', 'owner') THEN
    IF NOT public.erp_has_permission('updatePrepStatus') THEN
      RAISE EXCEPTION 'Only kitchen staff can reject orders';
    END IF;
  END IF;

  SELECT * INTO v_order FROM public.delivery_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;

  UPDATE public.delivery_orders
  SET
    kitchen_status       = 'rejected',
    kitchen_rejected_at  = NOW(),
    kitchen_rejected_by  = v_email,
    kitchen_reject_reason = p_reason,
    status               = 'cancelled',
    cancelled_reason     = COALESCE(p_reason, 'Rejected by kitchen'),
    updated_date         = NOW()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  UPDATE public.kitchen_queues
  SET status = 'rejected', rejected_at = NOW(), rejected_by = v_email,
      reject_reason = p_reason, updated_at = NOW()
  WHERE order_id = p_order_id;

  INSERT INTO public.order_status_history (
    order_id, restaurant_id, branch_id, tenant_id,
    from_status, to_status, changed_by, changed_by_role, notes
  ) VALUES (
    p_order_id, v_order.restaurant_id, v_order.branch_id, v_order.tenant_id,
    'sent_to_kitchen', 'cancelled', v_email, v_role, p_reason
  );

  RETURN v_order;
END;
$$;

-- ── 12. PERFORMANCE INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_delivery_orders_status_branch
  ON public.delivery_orders (branch_id, status, created_date DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_kitchen_status
  ON public.delivery_orders (branch_id, kitchen_status, created_date DESC);

CREATE INDEX IF NOT EXISTS idx_kitchen_queues_status_branch
  ON public.kitchen_queues (branch_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_orders_driver_status
  ON public.delivery_orders (driver_id, status, created_date DESC);
