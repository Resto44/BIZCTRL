-- =============================================================================
-- RUNTIME DEBUG FIX: invoice_number cross-restaurant collision
-- =============================================================================
-- ROOT CAUSE (confirmed by live runtime test):
--   The invoice_number format INV-YYYYMMDD-NNNN uses a per-restaurant sequence
--   but a GLOBALLY UNIQUE constraint. Multiple restaurants independently generate
--   the same invoice_number (e.g., restaurant A and B both generate INV-20260801-0002).
--
--   When the trigger fn_daily_sales_sync_invoice fires for restaurant B, it does:
--     INSERT INTO sales_invoices ... ON CONFLICT (invoice_number) DO UPDATE
--   The conflicting row belongs to restaurant A. The calling user (restaurant B's
--   owner) cannot UPDATE restaurant A's row (erp_can_write_scope_text returns FALSE
--   for the wrong restaurant), causing:
--     "new row violates row-level security policy (USING expression) for table sales_invoices"
--
-- FIX 1: Change UNIQUE constraint from (invoice_number) to (restaurant_id, invoice_number)
--         so the same invoice_number can exist across different restaurants.
-- FIX 2: Update the trigger ON CONFLICT clause to use (restaurant_id, invoice_number).
-- FIX 3: Make fn_daily_sales_sync_invoice SECURITY DEFINER so it bypasses RLS
--         entirely — this is the canonical pattern for trigger functions that write
--         to related tables. The trigger already validates data integrity via the
--         daily_sales RLS policies before it fires.
-- =============================================================================

-- STEP 1: Drop the existing global unique constraint on invoice_number
ALTER TABLE public.sales_invoices
  DROP CONSTRAINT IF EXISTS sales_invoices_invoice_number_key;

-- STEP 2: Add a per-restaurant unique constraint
--         (restaurant_id, invoice_number) — allows same number across restaurants
ALTER TABLE public.sales_invoices
  ADD CONSTRAINT sales_invoices_restaurant_invoice_number_key
  UNIQUE (restaurant_id, invoice_number);

-- Keep a non-unique index on invoice_number alone for fast lookups by invoice_number
CREATE INDEX IF NOT EXISTS idx_sales_invoices_invoice_number
  ON public.sales_invoices (invoice_number);

-- STEP 3: Rebuild fn_daily_sales_sync_invoice as SECURITY DEFINER
--         and update ON CONFLICT to use (restaurant_id, invoice_number)
CREATE OR REPLACE FUNCTION public.fn_daily_sales_sync_invoice()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER  -- Runs as postgres, bypasses RLS on sales_invoices
  SET search_path = public
AS $$
DECLARE
    v_cash_sales    NUMERIC;
    v_network_sales NUMERIC;
    v_credit_sales  NUMERIC;
    v_sales_total   NUMERIC;
    v_rest_id       UUID;
BEGIN
    -- Skip auto-generated records to avoid recursion
    IF NEW.auto_generated = TRUE THEN
        RETURN NEW;
    END IF;

    -- Calculate totals
    v_cash_sales    := COALESCE(NEW.restaurant_cash, NEW.cash, 0);
    v_network_sales := COALESCE(NEW.restaurant_network, NEW.network, 0);
    v_credit_sales  := COALESCE(NEW.credit, 0);
    v_sales_total   := v_cash_sales + v_network_sales + v_credit_sales;

    -- Safely parse restaurant_id from TEXT to UUID
    BEGIN
        v_rest_id := CASE
            WHEN NEW.restaurant_id IS NOT NULL AND NEW.restaurant_id != ''
            THEN NEW.restaurant_id::UUID
            ELSE NULL
        END;
    EXCEPTION WHEN others THEN
        v_rest_id := NULL;
    END;

    -- Insert or update sales_invoices.
    -- ON CONFLICT now targets (restaurant_id, invoice_number) to prevent
    -- cross-restaurant collisions that previously caused RLS USING errors.
    INSERT INTO public.sales_invoices (
        invoice_number,
        sale_id,
        restaurant_id,
        branch_id,
        tenant_id,
        branch,
        sale_date,
        opening_cash,
        closing_cash,
        cash_difference,
        cash_status,
        cash_sales,
        network_sales,
        credit_sales,
        sales_total,
        cashier_name,
        shift,
        notes,
        cash_notes,
        sales_notes,
        manager_approval,
        manager_approved_by,
        pos_entries_json,
        credit_entries_json,
        created_by,
        created_date,
        updated_date
    ) VALUES (
        NEW.invoice_number,
        NEW.id,
        v_rest_id,
        NEW.branch_id,
        NEW.tenant_id,
        NEW.branch,
        NEW.date,
        COALESCE(NEW.opening_cash, 0),
        COALESCE(NEW.closing_cash, 0),
        COALESCE(NEW.cash_difference, 0),
        COALESCE(NEW.cash_status, 'Balanced'),
        v_cash_sales,
        v_network_sales,
        v_credit_sales,
        v_sales_total,
        COALESCE(NEW.cashier_name, ''),
        COALESCE(NEW.shift, ''),
        COALESCE(NEW.notes, ''),
        COALESCE(NEW.cash_notes, ''),
        COALESCE(NEW.sales_notes, ''),
        COALESCE(NEW.manager_approval, FALSE),
        COALESCE(NEW.manager_approved_by, ''),
        CASE WHEN NEW.pos_entries_json IS NOT NULL THEN NEW.pos_entries_json::TEXT ELSE '' END,
        CASE WHEN NEW.credit_entries_json IS NOT NULL THEN NEW.credit_entries_json::TEXT ELSE '' END,
        COALESCE(NEW.created_by, ''),
        NOW(),
        NOW()
    )
    ON CONFLICT (restaurant_id, invoice_number)
    DO UPDATE SET
        sale_id              = EXCLUDED.sale_id,
        branch_id            = EXCLUDED.branch_id,
        tenant_id            = EXCLUDED.tenant_id,
        branch               = EXCLUDED.branch,
        sale_date            = EXCLUDED.sale_date,
        opening_cash         = EXCLUDED.opening_cash,
        closing_cash         = EXCLUDED.closing_cash,
        cash_difference      = EXCLUDED.cash_difference,
        cash_status          = EXCLUDED.cash_status,
        cash_sales           = EXCLUDED.cash_sales,
        network_sales        = EXCLUDED.network_sales,
        credit_sales         = EXCLUDED.credit_sales,
        sales_total          = EXCLUDED.sales_total,
        cashier_name         = EXCLUDED.cashier_name,
        shift                = EXCLUDED.shift,
        notes                = EXCLUDED.notes,
        cash_notes           = EXCLUDED.cash_notes,
        sales_notes          = EXCLUDED.sales_notes,
        manager_approval     = EXCLUDED.manager_approval,
        manager_approved_by  = EXCLUDED.manager_approved_by,
        pos_entries_json     = EXCLUDED.pos_entries_json,
        credit_entries_json  = EXCLUDED.credit_entries_json,
        updated_date         = NOW();

    RETURN NEW;
END;
$$;

-- STEP 4: Also make fn_daily_sales_generate_invoice_number SECURITY DEFINER
--         so it can always write to invoice_sequences regardless of user role
CREATE OR REPLACE FUNCTION public.fn_daily_sales_generate_invoice_number()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
    -- Only generate if not already present
    IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
        NEW.invoice_number := public.generate_sales_invoice_number(
            CASE
                WHEN NEW.restaurant_id IS NOT NULL AND NEW.restaurant_id != ''
                THEN NEW.restaurant_id::UUID
                ELSE NULL
            END,
            NEW.date
        );
    END IF;
    RETURN NEW;
END;
$$;

-- STEP 5: Update createSalesInvoice client-side upsert to use the new constraint
-- The client-side upsert in salesInvoiceService.js uses onConflict: 'invoice_number'
-- This must be updated to use 'restaurant_id,invoice_number'
-- This is handled in the JS code fix (see salesInvoiceService.js)
