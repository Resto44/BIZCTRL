-- =============================================================================
-- Supermarket-only Product Spreadsheet Import Boundary
-- Date: 2026-09-04
-- Purpose:
--   * Keep Excel/CSV product import exclusive to the Supermarket (Retail) portal
--   * Reject direct database calls from Restaurant and every other portal
--   * Preserve tenant/branch isolation for imported product masters
-- =============================================================================

CREATE OR REPLACE FUNCTION public.erp_is_supermarket_product_portal(
  p_restaurant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.restaurants restaurant
    WHERE restaurant.id = p_restaurant_id
      AND (
        lower(btrim(COALESCE(restaurant.business_type::text, ''))) IN ('retail', 'supermarket')
        OR (
          NULLIF(btrim(COALESCE(restaurant.business_type::text, '')), '') IS NULL
          AND lower(btrim(COALESCE(restaurant.business_mode::text, ''))) IN ('retail', 'supermarket')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.erp_validate_product_import_job_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.erp_is_supermarket_product_portal(NEW.restaurant_id) THEN
    RAISE EXCEPTION 'Product spreadsheet import is available only in the Supermarket portal'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches branch
    WHERE branch.id = NEW.branch_id AND branch.restaurant_id = NEW.restaurant_id
  ) THEN
    RAISE EXCEPTION 'Product import tenant/branch mismatch' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_bulk_upsert_master_products(
  p_restaurant_id uuid,
  p_rows jsonb,
  p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_product_id uuid;
  v_inserted boolean;
  v_sku text;
  v_name text;
  v_created integer := 0;
  v_updated integer := 0;
  v_branch_added integer := 0;
  v_failed integer := 0;
  v_row_number integer := 0;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.erp_can_write_module_scope_text(p_restaurant_id::text, NULL, 'updateInventory') THEN
    RAISE EXCEPTION 'Master product import denied' USING ERRCODE = '42501';
  END IF;

  IF NOT public.erp_is_supermarket_product_portal(p_restaurant_id) THEN
    RAISE EXCEPTION 'Product spreadsheet import is available only in the Supermarket portal'
      USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Import rows must be a JSON array' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_rows) > 1000 THEN
    RAISE EXCEPTION 'Import chunks may contain at most 1000 rows' USING ERRCODE = '22023';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches branch
    WHERE branch.id = p_branch_id AND branch.restaurant_id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'The selected branch does not belong to this organization' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text || ':product-import', 0));

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_row_number := v_row_number + 1;
    BEGIN
      v_name := NULLIF(btrim(COALESCE(v_row ->> 'name', '')), '');
      v_sku := upper(NULLIF(btrim(COALESCE(v_row ->> 'sku', v_row ->> 'barcode', '')), ''));

      IF v_name IS NULL OR v_sku IS NULL THEN
        RAISE EXCEPTION 'Name and SKU (or barcode) are required';
      END IF;

      INSERT INTO public.products (
        restaurant_id, branch_id, product_id, name, name_ar, name_en, name_fa,
        sku, barcode, category, unit, brand, purchase_cost, selling_price,
        default_cost, default_price, tax_rate, min_stock, max_stock,
        reorder_point, reorder_quantity, status, is_active, custom_attributes,
        created_by, created_date, updated_date
      ) VALUES (
        p_restaurant_id,
        NULL,
        COALESCE(NULLIF(v_row ->> 'product_id', ''), v_sku),
        v_name,
        NULLIF(v_row ->> 'name_ar', ''),
        NULLIF(v_row ->> 'name_en', ''),
        NULLIF(v_row ->> 'name_fa', ''),
        v_sku,
        NULLIF(btrim(COALESCE(v_row ->> 'barcode', '')), ''),
        NULLIF(v_row ->> 'category', ''),
        NULLIF(v_row ->> 'unit', ''),
        NULLIF(v_row ->> 'brand', ''),
        GREATEST(COALESCE((v_row ->> 'purchase_cost')::numeric, 0), 0),
        GREATEST(COALESCE((v_row ->> 'selling_price')::numeric, 0), 0),
        GREATEST(COALESCE((v_row ->> 'purchase_cost')::numeric, 0), 0),
        GREATEST(COALESCE((v_row ->> 'selling_price')::numeric, 0), 0),
        GREATEST(COALESCE((v_row ->> 'tax_rate')::numeric, 0), 0),
        GREATEST(COALESCE((v_row ->> 'min_stock')::numeric, 0), 0),
        GREATEST(COALESCE((v_row ->> 'max_stock')::numeric, 0), 0),
        GREATEST(COALESCE((v_row ->> 'reorder_point')::numeric, 0), 0),
        GREATEST(COALESCE((v_row ->> 'reorder_quantity')::numeric, 0), 0),
        CASE WHEN v_row ->> 'status' IN ('active', 'inactive', 'discontinued') THEN v_row ->> 'status' ELSE 'active' END,
        COALESCE(v_row ->> 'status', 'active') = 'active',
        CASE WHEN jsonb_typeof(v_row -> 'custom_attributes') = 'object' THEN v_row -> 'custom_attributes' ELSE '{}'::jsonb END,
        auth.jwt() ->> 'email',
        now(),
        now()
      )
      ON CONFLICT (restaurant_id, sku_normalized)
        WHERE branch_id IS NULL AND sku_normalized IS NOT NULL
      DO UPDATE SET
        name = EXCLUDED.name,
        name_ar = COALESCE(EXCLUDED.name_ar, products.name_ar),
        name_en = COALESCE(EXCLUDED.name_en, products.name_en),
        name_fa = COALESCE(EXCLUDED.name_fa, products.name_fa),
        barcode = COALESCE(EXCLUDED.barcode, products.barcode),
        category = COALESCE(EXCLUDED.category, products.category),
        unit = COALESCE(EXCLUDED.unit, products.unit),
        brand = COALESCE(EXCLUDED.brand, products.brand),
        purchase_cost = EXCLUDED.purchase_cost,
        selling_price = EXCLUDED.selling_price,
        default_cost = EXCLUDED.default_cost,
        default_price = EXCLUDED.default_price,
        tax_rate = EXCLUDED.tax_rate,
        min_stock = EXCLUDED.min_stock,
        max_stock = EXCLUDED.max_stock,
        reorder_point = EXCLUDED.reorder_point,
        reorder_quantity = EXCLUDED.reorder_quantity,
        status = EXCLUDED.status,
        is_active = EXCLUDED.is_active,
        custom_attributes = public.products.custom_attributes || EXCLUDED.custom_attributes,
        updated_date = now()
      RETURNING public.products.id, (xmax = 0) INTO v_product_id, v_inserted;

      IF v_inserted THEN
        v_created := v_created + 1;
      ELSE
        v_updated := v_updated + 1;
      END IF;

      IF p_branch_id IS NOT NULL THEN
        INSERT INTO public.branch_product_assortments (
          restaurant_id, branch_id, product_id, is_active, sellable, purchasable,
          inventory_tracked, selling_price_override, purchase_cost_override,
          min_stock, max_stock, reorder_point, reorder_quantity,
          aisle, shelf, bin_location, created_by, updated_by
        ) VALUES (
          p_restaurant_id,
          p_branch_id,
          v_product_id,
          true,
          COALESCE((v_row ->> 'sellable')::boolean, true),
          COALESCE((v_row ->> 'purchasable')::boolean, true),
          COALESCE((v_row ->> 'inventory_tracked')::boolean, true),
          CASE WHEN NULLIF(v_row ->> 'branch_selling_price', '') IS NULL THEN NULL ELSE GREATEST((v_row ->> 'branch_selling_price')::numeric, 0) END,
          CASE WHEN NULLIF(v_row ->> 'branch_purchase_cost', '') IS NULL THEN NULL ELSE GREATEST((v_row ->> 'branch_purchase_cost')::numeric, 0) END,
          GREATEST(COALESCE((v_row ->> 'min_stock')::numeric, 0), 0),
          GREATEST(COALESCE((v_row ->> 'max_stock')::numeric, 0), 0),
          GREATEST(COALESCE((v_row ->> 'reorder_point')::numeric, 0), 0),
          GREATEST(COALESCE((v_row ->> 'reorder_quantity')::numeric, 0), 0),
          NULLIF(v_row ->> 'aisle', ''),
          NULLIF(v_row ->> 'shelf', ''),
          NULLIF(v_row ->> 'bin_location', ''),
          auth.jwt() ->> 'email',
          auth.jwt() ->> 'email'
        )
        ON CONFLICT (restaurant_id, branch_id, product_id)
        DO UPDATE SET
          is_active = true,
          selling_price_override = COALESCE(EXCLUDED.selling_price_override, branch_product_assortments.selling_price_override),
          purchase_cost_override = COALESCE(EXCLUDED.purchase_cost_override, branch_product_assortments.purchase_cost_override),
          min_stock = EXCLUDED.min_stock,
          max_stock = EXCLUDED.max_stock,
          reorder_point = EXCLUDED.reorder_point,
          reorder_quantity = EXCLUDED.reorder_quantity,
          aisle = COALESCE(EXCLUDED.aisle, branch_product_assortments.aisle),
          shelf = COALESCE(EXCLUDED.shelf, branch_product_assortments.shelf),
          bin_location = COALESCE(EXCLUDED.bin_location, branch_product_assortments.bin_location),
          updated_at = now(),
          updated_by = auth.jwt() ->> 'email';
        v_branch_added := v_branch_added + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      IF jsonb_array_length(v_errors) < 100 THEN
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'row', v_row_number,
          'sku', v_sku,
          'message', SQLERRM
        ));
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', jsonb_array_length(p_rows),
    'created', v_created,
    'updated', v_updated,
    'failed', v_failed,
    'branch_added', v_branch_added,
    'errors', v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.erp_is_supermarket_product_portal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_bulk_upsert_master_products(uuid, jsonb, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.erp_is_supermarket_product_portal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_bulk_upsert_master_products(uuid, jsonb, uuid) TO authenticated;

COMMENT ON FUNCTION public.erp_is_supermarket_product_portal(uuid) IS
  'Returns true only for the Supermarket/Retail organization that owns a product spreadsheet import.';
COMMENT ON FUNCTION public.erp_bulk_upsert_master_products(uuid, jsonb, uuid) IS
  'Supermarket-only, RLS-safe chunked master product upsert for validated CSV/XLSX imports.';
