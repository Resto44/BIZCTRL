-- Keep finalized Sales Invoice totals aligned with the canonical Sales Closing
-- calculation: Cash + Network + Credit + Other payment sources.
-- Existing invoices and business records are intentionally preserved.

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS other_sales NUMERIC NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.fn_daily_sales_sync_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_cash_sales    NUMERIC;
    v_network_sales NUMERIC;
    v_credit_sales  NUMERIC;
    v_other_sales   NUMERIC;
    v_sales_total   NUMERIC;
    v_rest_id       UUID;
BEGIN
    IF NEW.auto_generated = TRUE THEN
        RETURN NEW;
    END IF;

    v_cash_sales    := COALESCE(NEW.restaurant_cash, NEW.cash, 0);
    v_network_sales := COALESCE(NEW.restaurant_network, NEW.network, 0);
    v_credit_sales  := COALESCE(NEW.credit, 0);
    v_other_sales   := COALESCE(NEW.custom_sources_total, 0);
    v_sales_total   := v_cash_sales + v_network_sales + v_credit_sales + v_other_sales;

    BEGIN
        v_rest_id := CASE
            WHEN NEW.restaurant_id IS NOT NULL AND NEW.restaurant_id != ''
            THEN NEW.restaurant_id::UUID
            ELSE NULL
        END;
    EXCEPTION WHEN others THEN
        v_rest_id := NULL;
    END;

    INSERT INTO public.sales_invoices (
        invoice_number, sale_id, restaurant_id, branch_id, tenant_id, branch,
        sale_date, opening_cash, closing_cash, cash_difference, cash_status,
        cash_sales, network_sales, credit_sales, other_sales, sales_total, cashier_name,
        shift, notes, cash_notes, sales_notes, manager_approval,
        manager_approved_by, pos_entries_json, credit_entries_json,
        created_by, created_date, updated_date
    ) VALUES (
        NEW.invoice_number, NEW.id, v_rest_id, NEW.branch_id, NEW.tenant_id,
        NEW.branch, NEW.date,
        COALESCE(NEW.opening_cash, 0), COALESCE(NEW.closing_cash, 0),
        COALESCE(NEW.cash_difference, 0), COALESCE(NEW.cash_status, 'Balanced'),
        v_cash_sales, v_network_sales, v_credit_sales, v_other_sales, v_sales_total,
        COALESCE(NEW.cashier_name, ''), COALESCE(NEW.shift, ''),
        COALESCE(NEW.notes, ''), COALESCE(NEW.cash_notes, ''),
        COALESCE(NEW.sales_notes, ''), COALESCE(NEW.manager_approval, FALSE),
        COALESCE(NEW.manager_approved_by, ''),
        CASE WHEN NEW.pos_entries_json IS NOT NULL THEN NEW.pos_entries_json::TEXT ELSE '' END,
        CASE WHEN NEW.credit_entries_json IS NOT NULL THEN NEW.credit_entries_json::TEXT ELSE '' END,
        COALESCE(NEW.created_by, ''), NOW(), NOW()
    )
    ON CONFLICT (restaurant_id, invoice_number)
    DO UPDATE SET
        sale_id             = EXCLUDED.sale_id,
        branch_id           = EXCLUDED.branch_id,
        tenant_id           = EXCLUDED.tenant_id,
        branch              = EXCLUDED.branch,
        sale_date           = EXCLUDED.sale_date,
        opening_cash        = EXCLUDED.opening_cash,
        closing_cash        = EXCLUDED.closing_cash,
        cash_difference     = EXCLUDED.cash_difference,
        cash_status         = EXCLUDED.cash_status,
        cash_sales          = EXCLUDED.cash_sales,
        network_sales       = EXCLUDED.network_sales,
        credit_sales        = EXCLUDED.credit_sales,
        other_sales         = EXCLUDED.other_sales,
        sales_total         = EXCLUDED.sales_total,
        cashier_name        = EXCLUDED.cashier_name,
        shift               = EXCLUDED.shift,
        notes               = EXCLUDED.notes,
        cash_notes          = EXCLUDED.cash_notes,
        sales_notes         = EXCLUDED.sales_notes,
        manager_approval    = EXCLUDED.manager_approval,
        manager_approved_by = EXCLUDED.manager_approved_by,
        pos_entries_json    = EXCLUDED.pos_entries_json,
        credit_entries_json = EXCLUDED.credit_entries_json,
        updated_date        = NOW();

    RETURN NEW;
END;
$function$;
