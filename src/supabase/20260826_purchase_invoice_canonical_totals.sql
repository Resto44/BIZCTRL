-- Canonical purchase totals runtime repair.
-- Recompute every invoice financial total from the persisted line payload so a
-- stale client value can never create a positive-cost purchase with total_amount = 0.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_recalculate_supplier_invoice_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_cost jsonb;
  v_items jsonb := '[]'::jsonb;
  v_quantity numeric;
  v_unit_cost numeric;
  v_discount numeric;
  v_tax numeric;
  v_base numeric;
  v_discounted numeric;
  v_tax_amount numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_tax_total numeric := 0;
  v_discount_total numeric := 0;
  v_additional_total numeric := 0;
  v_cost_amount numeric;
BEGIN
  -- Three legacy invoices have no item payload. Preserve their existing history
  -- for unrelated status/payment updates, but never allow a new or edited line
  -- invoice to bypass canonical totals validation.
  IF NEW.items IS NULL OR jsonb_typeof(NEW.items) <> 'array' OR jsonb_array_length(NEW.items) = 0 THEN
    IF TG_OP = 'UPDATE'
       AND COALESCE(NEW.items, '[]'::jsonb) = COALESCE(OLD.items, '[]'::jsonb) THEN
      NEW.paid_amount := round(COALESCE(NEW.paid_amount, 0), 2);
      IF NEW.paid_amount > round(COALESCE(NEW.total_amount, 0), 2) + 0.005 THEN
        RAISE EXCEPTION 'PURCHASE_INVOICE_OVERPAYMENT';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'PURCHASE_INVOICE_LINES_REQUIRED';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(NEW.items) LOOP
    IF NULLIF(BTRIM(COALESCE(v_item ->> 'product_id', '')), '') IS NULL
       AND NULLIF(BTRIM(COALESCE(v_item ->> 'product_name', '')), '') IS NULL THEN
      RAISE EXCEPTION 'PURCHASE_INVOICE_PRODUCT_REQUIRED';
    END IF;

    v_quantity := COALESCE(NULLIF(v_item ->> 'quantity', '')::numeric, 0);
    v_unit_cost := COALESCE(NULLIF(v_item ->> 'unit_cost', '')::numeric, 0);
    v_discount := COALESCE(NULLIF(v_item ->> 'discount', '')::numeric, 0);
    v_tax := COALESCE(NULLIF(v_item ->> 'tax', '')::numeric, 0);

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'PURCHASE_INVOICE_QUANTITY_INVALID';
    END IF;
    IF v_unit_cost < 0 THEN
      RAISE EXCEPTION 'PURCHASE_INVOICE_UNIT_COST_INVALID';
    END IF;
    IF v_discount < 0 OR v_tax < 0 OR v_tax > 100 THEN
      RAISE EXCEPTION 'PURCHASE_INVOICE_LINE_ADJUSTMENT_INVALID';
    END IF;

    v_base := round(v_quantity * v_unit_cost, 2);
    IF v_discount > v_base THEN
      RAISE EXCEPTION 'PURCHASE_INVOICE_DISCOUNT_INVALID';
    END IF;
    v_discounted := round(v_base - v_discount, 2);
    v_tax_amount := round(v_discounted * (v_tax / 100), 2);
    v_line_total := round(v_discounted + v_tax_amount, 2);

    v_subtotal := round(v_subtotal + v_line_total, 2);
    v_tax_total := round(v_tax_total + v_tax_amount, 2);
    v_discount_total := round(v_discount_total + v_discount, 2);
    v_items := v_items || jsonb_build_array(
      v_item || jsonb_build_object(
        'quantity', v_quantity,
        'unit_cost', v_unit_cost,
        'discount', v_discount,
        'tax', v_tax,
        'line_total', v_line_total
      )
    );
  END LOOP;

  IF NEW.additional_costs IS NULL THEN
    NEW.additional_costs := '[]'::jsonb;
  END IF;
  IF jsonb_typeof(NEW.additional_costs) <> 'array' THEN
    RAISE EXCEPTION 'PURCHASE_INVOICE_ADDITIONAL_COSTS_INVALID';
  END IF;

  FOR v_cost IN SELECT value FROM jsonb_array_elements(NEW.additional_costs) LOOP
    v_cost_amount := COALESCE(NULLIF(v_cost ->> 'amount', '')::numeric, 0);
    IF v_cost_amount < 0 THEN
      RAISE EXCEPTION 'PURCHASE_INVOICE_ADDITIONAL_COST_INVALID';
    END IF;
    v_additional_total := round(v_additional_total + v_cost_amount, 2);
  END LOOP;

  NEW.items := v_items;
  NEW.subtotal := v_subtotal;
  NEW.tax_amount := v_tax_total;
  NEW.discount_amount := v_discount_total;
  NEW.total_amount := round(v_subtotal + v_additional_total, 2);
  NEW.paid_amount := round(COALESCE(NEW.paid_amount, 0), 2);

  IF NEW.paid_amount > NEW.total_amount + 0.005 THEN
    RAISE EXCEPTION 'PURCHASE_INVOICE_OVERPAYMENT';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS erp_recalculate_supplier_invoice_totals ON public.supplier_invoices;
CREATE TRIGGER erp_recalculate_supplier_invoice_totals
BEFORE INSERT OR UPDATE OF items, additional_costs, subtotal, tax_amount, discount_amount, total_amount, paid_amount
ON public.supplier_invoices
FOR EACH ROW
EXECUTE FUNCTION public.erp_recalculate_supplier_invoice_totals();

COMMIT;
