-- Fix supplier payment cash-movement processing against the deployed schema.
-- supplier_payments exposes date, branch, and amount; it does not expose
-- payment_date, branch_key, or cash_amount. Replace only this table's
-- AFTER trigger so the shared multi-table trigger remains unchanged.

CREATE OR REPLACE FUNCTION public.trg_supplier_payment_cash_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_movement_id UUID;
  v_old_settlement_id UUID;
  v_settlement_id UUID;
  v_current_is_cash BOOLEAN := FALSE;
  v_old_is_cash BOOLEAN := FALSE;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_is_cash := LOWER(COALESCE(OLD.payment_method, 'cash')) = 'cash';

    IF v_old_is_cash THEN
      SELECT id, settlement_id
      INTO v_old_movement_id, v_old_settlement_id
      FROM public.cash_movements
      WHERE source_module = 'SupplierPayments'
        AND source_record_id = OLD.id::TEXT
        AND movement_type = 'supplier_payment'
        AND is_reversed = FALSE
      ORDER BY posted_at DESC
      LIMIT 1;

      IF FOUND THEN
        UPDATE public.cash_movements
        SET is_reversed = TRUE,
            updated_date = NOW()
        WHERE id = v_old_movement_id;

        IF v_old_settlement_id IS NOT NULL THEN
          UPDATE public.daily_cash_settlements
          SET supplier_payments = GREATEST(COALESCE(supplier_payments, 0) - COALESCE(OLD.amount, 0), 0)
          WHERE id = v_old_settlement_id;
          PERFORM public.recompute_settlement(v_old_settlement_id);
        END IF;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  v_current_is_cash := LOWER(COALESCE(NEW.payment_method, 'cash')) = 'cash';
  IF NOT v_current_is_cash OR COALESCE(NEW.amount, 0) = 0 THEN
    RETURN NEW;
  END IF;

  v_settlement_id := public.get_or_create_settlement(
    NEW.date,
    NEW.branch,
    NEW.created_by,
    NEW.restaurant_id
  );

  INSERT INTO public.cash_movements (
    date,
    branch,
    restaurant_id,
    created_by,
    direction,
    amount,
    movement_type,
    source_module,
    source_record_id,
    description,
    posted_by,
    posted_by_name,
    settlement_id
  ) VALUES (
    NEW.date,
    NEW.branch,
    NEW.restaurant_id,
    NEW.created_by,
    'out',
    NEW.amount,
    'supplier_payment',
    'SupplierPayments',
    NEW.id::TEXT,
    'Supplier Payment',
    NEW.created_by,
    NEW.created_by,
    v_settlement_id
  );

  UPDATE public.daily_cash_settlements
  SET supplier_payments = COALESCE(supplier_payments, 0) + NEW.amount
  WHERE id = v_settlement_id;
  PERFORM public.recompute_settlement(v_settlement_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_payments_cash_movement ON public.supplier_payments;

CREATE TRIGGER trg_supplier_payments_cash_movement
AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
FOR EACH ROW
EXECUTE FUNCTION public.trg_supplier_payment_cash_movement();
