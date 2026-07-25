-- Purchase invoice deletion runtime repair.
-- Deletion runs in one transaction so inventory, payable records, and invoice dependents
-- cannot be left partially rolled back.

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_supplier_invoice_with_rollback(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_invoice public.supplier_invoices%ROWTYPE;
  v_inventory_rows integer := 0;
  v_items jsonb := '[]'::jsonb;
BEGIN
  SELECT *
  INTO v_invoice
  FROM public.supplier_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase invoice % was not found', p_invoice_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.erp_can_write_scope_text(
    v_invoice.restaurant_id::text,
    v_invoice.branch_id::text
  ) THEN
    RAISE EXCEPTION 'You are not authorized to delete this purchase invoice'
      USING ERRCODE = '42501';
  END IF;

  -- Only approved invoices changed stock when they were created or approved.
  IF v_invoice.approval_status IN ('approved', 'auto_approved')
     OR v_invoice.status IN ('approved', 'paid', 'partial', 'unpaid') THEN
    v_items := COALESCE(v_invoice.items, '[]'::jsonb);

    WITH invoice_items AS (
      SELECT
        NULLIF(item ->> 'product_id', '') AS product_id,
        GREATEST(COALESCE(NULLIF(item ->> 'quantity', '')::numeric, 0), 0) AS quantity
      FROM jsonb_array_elements(v_items) AS item
    ),
    aggregated_items AS (
      SELECT product_id, SUM(quantity) AS quantity
      FROM invoice_items
      WHERE product_id IS NOT NULL AND quantity > 0
      GROUP BY product_id
    ),
    target_inventory AS (
      SELECT inventory.id, items.quantity
      FROM aggregated_items AS items
      JOIN LATERAL (
        SELECT id
        FROM public.inventory
        WHERE product_id = items.product_id
          AND branch = v_invoice.branch
        ORDER BY COALESCE(last_updated, updated_date, created_date) DESC, id DESC
        LIMIT 1
      ) AS inventory ON true
    ),
    rolled_back AS (
      UPDATE public.inventory AS inventory
      SET
        quantity = GREATEST(COALESCE(inventory.quantity, 0) - target.quantity, 0),
        total_value = GREATEST(
          (GREATEST(COALESCE(inventory.quantity, 0) - target.quantity, 0))
          * COALESCE(inventory.average_cost, 0),
          0
        ),
        last_updated = now(),
        updated_date = now()
      FROM target_inventory AS target
      WHERE inventory.id = target.id
      RETURNING inventory.id
    )
    SELECT COUNT(*) INTO v_inventory_rows FROM rolled_back;
  END IF;

  -- Remove price-history rows that exist only because of this invoice.
  DELETE FROM public.product_price_history
  WHERE invoice_id = p_invoice_id::text;

  -- Remove payment and supplier-balance detail rows before the parent invoice.
  DELETE FROM public.debt_payments
  WHERE debt_id IN (
    SELECT id FROM public.debt_records WHERE supplier_invoice_id = p_invoice_id
  );

  DELETE FROM public.supplier_payments WHERE invoice_id = p_invoice_id;
  DELETE FROM public.purchases WHERE supplier_invoice_id = p_invoice_id;

  -- Clear the optional back-reference before deleting the invoice-linked debt record.
  UPDATE public.supplier_invoices
  SET debt_record_id = NULL
  WHERE id = p_invoice_id;

  DELETE FROM public.debt_records WHERE supplier_invoice_id = p_invoice_id;
  DELETE FROM public.supplier_invoices WHERE id = p_invoice_id;

  RETURN jsonb_build_object(
    'invoice_id', p_invoice_id,
    'inventory_rows_rolled_back', v_inventory_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_supplier_invoice_with_rollback(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_supplier_invoice_with_rollback(uuid) TO authenticated;

COMMIT;
