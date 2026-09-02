-- =============================================================================
-- Scalable Product Master Catalog + Branch Assortment
-- Date: 2026-09-02
-- Purpose:
--   * Keep one product master per organization (100k+ ready)
--   * Activate products per branch without duplicating master data
--   * Provide RLS-safe server pagination/search and chunked spreadsheet import
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sku_normalized text
    GENERATED ALWAYS AS (NULLIF(upper(btrim(sku)), '')) STORED,
  ADD COLUMN IF NOT EXISTS barcode_normalized text
    GENERATED ALWAYS AS (NULLIF(btrim(barcode), '')) STORED;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.products
    WHERE restaurant_id IS NOT NULL
      AND branch_id IS NULL
      AND sku_normalized IS NOT NULL
    GROUP BY restaurant_id, sku_normalized
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate tenant SKU values must be resolved before installing the scalable product catalog.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_master_sku
  ON public.products (restaurant_id, sku_normalized)
  WHERE branch_id IS NULL AND sku_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_master_catalog_page
  ON public.products (restaurant_id, status, name, id)
  WHERE branch_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_master_name_trgm
  ON public.products USING gin (lower(name) extensions.gin_trgm_ops)
  WHERE branch_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_master_sku_prefix
  ON public.products (restaurant_id, sku_normalized)
  WHERE branch_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_master_barcode_prefix
  ON public.products (restaurant_id, barcode_normalized)
  WHERE branch_id IS NULL;

CREATE TABLE IF NOT EXISTS public.branch_product_assortments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  sellable boolean NOT NULL DEFAULT true,
  purchasable boolean NOT NULL DEFAULT true,
  inventory_tracked boolean NOT NULL DEFAULT true,
  branch_sku text,
  selling_price_override numeric CHECK (selling_price_override IS NULL OR selling_price_override >= 0),
  purchase_cost_override numeric CHECK (purchase_cost_override IS NULL OR purchase_cost_override >= 0),
  min_stock numeric NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  max_stock numeric NOT NULL DEFAULT 0 CHECK (max_stock >= 0),
  reorder_point numeric NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  reorder_quantity numeric NOT NULL DEFAULT 0 CHECK (reorder_quantity >= 0),
  aisle text,
  shelf text,
  bin_location text,
  preferred_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_branch_product_assortment UNIQUE (restaurant_id, branch_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_product_assortment_branch
  ON public.branch_product_assortments (restaurant_id, branch_id, is_active, product_id);

CREATE INDEX IF NOT EXISTS idx_branch_product_assortment_product
  ON public.branch_product_assortments (restaurant_id, product_id, is_active);

CREATE INDEX IF NOT EXISTS idx_branch_product_assortment_supplier
  ON public.branch_product_assortments (preferred_supplier_id)
  WHERE preferred_supplier_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.product_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('csv', 'xlsx')),
  status text NOT NULL DEFAULT 'validating'
    CHECK (status IN ('validating', 'importing', 'completed', 'completed_with_errors', 'failed')),
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  processed_rows integer NOT NULL DEFAULT 0 CHECK (processed_rows >= 0),
  created_rows integer NOT NULL DEFAULT 0 CHECK (created_rows >= 0),
  updated_rows integer NOT NULL DEFAULT 0 CHECK (updated_rows >= 0),
  failed_rows integer NOT NULL DEFAULT 0 CHECK (failed_rows >= 0),
  error_summary jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(error_summary) = 'array'),
  created_by text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_import_jobs_tenant
  ON public.product_import_jobs (restaurant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_import_jobs_scope
  ON public.product_import_jobs (restaurant_id, branch_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.erp_validate_branch_product_assortment_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = NEW.branch_id AND b.restaurant_id = NEW.restaurant_id
  ) THEN
    RAISE EXCEPTION 'Branch assortment tenant/branch mismatch' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = NEW.product_id
      AND p.restaurant_id = NEW.restaurant_id
      AND p.branch_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Branch assortment tenant/product mismatch' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_branch_product_assortment_scope ON public.branch_product_assortments;
CREATE TRIGGER trg_validate_branch_product_assortment_scope
  BEFORE INSERT OR UPDATE OF restaurant_id, branch_id, product_id
  ON public.branch_product_assortments
  FOR EACH ROW EXECUTE FUNCTION public.erp_validate_branch_product_assortment_scope();

CREATE OR REPLACE FUNCTION public.erp_validate_product_import_job_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = NEW.branch_id AND b.restaurant_id = NEW.restaurant_id
  ) THEN
    RAISE EXCEPTION 'Product import tenant/branch mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_product_import_job_scope ON public.product_import_jobs;
CREATE TRIGGER trg_validate_product_import_job_scope
  BEFORE INSERT OR UPDATE OF restaurant_id, branch_id
  ON public.product_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.erp_validate_product_import_job_scope();

CREATE OR REPLACE FUNCTION public.erp_touch_branch_product_assortment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.jwt() ->> 'email', NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_branch_product_assortment ON public.branch_product_assortments;
CREATE TRIGGER trg_touch_branch_product_assortment
  BEFORE UPDATE ON public.branch_product_assortments
  FOR EACH ROW EXECUTE FUNCTION public.erp_touch_branch_product_assortment();

CREATE OR REPLACE FUNCTION public.erp_touch_product_import_job()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_product_import_job ON public.product_import_jobs;
CREATE TRIGGER trg_touch_product_import_job
  BEFORE UPDATE ON public.product_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.erp_touch_product_import_job();

ALTER TABLE public.branch_product_assortments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branch_product_assortment_select" ON public.branch_product_assortments;
CREATE POLICY "branch_product_assortment_select"
  ON public.branch_product_assortments FOR SELECT TO authenticated
  USING (
    public.erp_can_access_scope(restaurant_id, branch_id)
    AND public.erp_has_any_permission(ARRAY['viewProducts', 'viewInventory'])
  );

DROP POLICY IF EXISTS "branch_product_assortment_insert" ON public.branch_product_assortments;
CREATE POLICY "branch_product_assortment_insert"
  ON public.branch_product_assortments FOR INSERT TO authenticated
  WITH CHECK (
    public.erp_can_write_module_scope_text(restaurant_id::text, branch_id::text, 'updateInventory')
  );

DROP POLICY IF EXISTS "branch_product_assortment_update" ON public.branch_product_assortments;
CREATE POLICY "branch_product_assortment_update"
  ON public.branch_product_assortments FOR UPDATE TO authenticated
  USING (
    public.erp_can_write_module_scope_text(restaurant_id::text, branch_id::text, 'updateInventory')
  )
  WITH CHECK (
    public.erp_can_write_module_scope_text(restaurant_id::text, branch_id::text, 'updateInventory')
  );

DROP POLICY IF EXISTS "branch_product_assortment_delete" ON public.branch_product_assortments;
CREATE POLICY "branch_product_assortment_delete"
  ON public.branch_product_assortments FOR DELETE TO authenticated
  USING (
    public.erp_can_write_module_scope_text(restaurant_id::text, branch_id::text, 'updateInventory')
  );

DROP POLICY IF EXISTS "product_import_jobs_select" ON public.product_import_jobs;
CREATE POLICY "product_import_jobs_select"
  ON public.product_import_jobs FOR SELECT TO authenticated
  USING (
    public.erp_can_access_scope(restaurant_id, branch_id)
    AND public.erp_has_any_permission(ARRAY['viewProducts', 'viewInventory'])
  );

DROP POLICY IF EXISTS "product_import_jobs_insert" ON public.product_import_jobs;
CREATE POLICY "product_import_jobs_insert"
  ON public.product_import_jobs FOR INSERT TO authenticated
  WITH CHECK (
    public.erp_can_write_module_scope_text(restaurant_id::text, branch_id::text, 'updateInventory')
  );

DROP POLICY IF EXISTS "product_import_jobs_update" ON public.product_import_jobs;
CREATE POLICY "product_import_jobs_update"
  ON public.product_import_jobs FOR UPDATE TO authenticated
  USING (
    public.erp_can_write_module_scope_text(restaurant_id::text, branch_id::text, 'updateInventory')
  )
  WITH CHECK (
    public.erp_can_write_module_scope_text(restaurant_id::text, branch_id::text, 'updateInventory')
  );

CREATE OR REPLACE FUNCTION public.erp_search_master_products(
  p_restaurant_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_scope text DEFAULT 'all',
  p_status text DEFAULT 'all',
  p_sort text DEFAULT 'name_asc',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  product_id text,
  name text,
  name_ar text,
  name_en text,
  name_fa text,
  sku text,
  barcode text,
  category_id uuid,
  category text,
  unit text,
  brand text,
  purchase_cost numeric,
  selling_price numeric,
  current_stock numeric,
  min_stock numeric,
  status text,
  is_active boolean,
  image_url text,
  custom_attributes jsonb,
  assigned_to_branch boolean,
  branch_assortment_id uuid,
  branch_selling_price numeric,
  branch_purchase_cost numeric,
  branch_min_stock numeric,
  branch_reorder_point numeric,
  branch_count bigint,
  product_data jsonb,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_query text := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 100);
BEGIN
  IF auth.uid() IS NULL OR NOT public.erp_can_access_scope(p_restaurant_id, p_branch_id) THEN
    RAISE EXCEPTION 'Product catalog access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.product_id,
    p.name,
    p.name_ar,
    p.name_en,
    p.name_fa,
    p.sku,
    p.barcode,
    p.category_id,
    p.category,
    p.unit,
    p.brand,
    COALESCE(p.purchase_cost, p.default_cost, 0),
    COALESCE(p.selling_price, p.default_price, 0),
    COALESCE(p.current_stock, 0),
    COALESCE(p.min_stock, 0),
    COALESCE(p.status, CASE WHEN p.is_active = false THEN 'inactive' ELSE 'active' END),
    COALESCE(p.is_active, true),
    p.image_url,
    COALESCE(p.custom_attributes, '{}'::jsonb),
    CASE
      WHEN p_branch_id IS NULL THEN assortment_totals.branch_count > 0
      ELSE branch_assortment.id IS NOT NULL AND branch_assortment.is_active
    END,
    branch_assortment.id,
    branch_assortment.selling_price_override,
    branch_assortment.purchase_cost_override,
    branch_assortment.min_stock,
    branch_assortment.reorder_point,
    assortment_totals.branch_count,
    to_jsonb(p),
    count(*) OVER ()
  FROM public.products p
  LEFT JOIN public.branch_product_assortments branch_assortment
    ON branch_assortment.restaurant_id = p.restaurant_id
   AND branch_assortment.product_id = p.id
   AND branch_assortment.branch_id = p_branch_id
   AND branch_assortment.is_active = true
  LEFT JOIN LATERAL (
    SELECT count(*)::bigint AS branch_count
    FROM public.branch_product_assortments assortment
    WHERE assortment.restaurant_id = p.restaurant_id
      AND assortment.product_id = p.id
      AND assortment.is_active = true
  ) assortment_totals ON true
  WHERE p.restaurant_id = p_restaurant_id
    AND p.branch_id IS NULL
    AND (
      v_query IS NULL
      OR lower(p.name) LIKE '%' || lower(v_query) || '%'
      OR p.sku_normalized LIKE upper(v_query) || '%'
      OR p.barcode_normalized LIKE v_query || '%'
      OR lower(COALESCE(p.brand, '')) LIKE '%' || lower(v_query) || '%'
    )
    AND (
      NULLIF(p_category, '') IS NULL
      OR p_category = 'all'
      OR p.category_id::text = p_category
      OR lower(COALESCE(p.category, '')) = lower(p_category)
    )
    AND (
      p_status = 'all'
      OR (p_status = 'active' AND COALESCE(p.status, 'active') = 'active' AND COALESCE(p.is_active, true))
      OR (p_status = 'inactive' AND (COALESCE(p.status, 'active') <> 'active' OR NOT COALESCE(p.is_active, true)))
    )
    AND (
      p_scope = 'all'
      OR p_branch_id IS NULL
      OR (p_scope = 'in_branch' AND branch_assortment.id IS NOT NULL)
      OR (p_scope = 'not_in_branch' AND branch_assortment.id IS NULL)
    )
  ORDER BY
    CASE WHEN p_sort = 'name_asc' THEN lower(p.name) END ASC,
    CASE WHEN p_sort = 'name_desc' THEN lower(p.name) END DESC,
    CASE WHEN p_sort = 'price_desc' THEN COALESCE(branch_assortment.selling_price_override, p.selling_price, p.default_price, 0) END DESC,
    CASE WHEN p_sort = 'price_asc' THEN COALESCE(branch_assortment.selling_price_override, p.selling_price, p.default_price, 0) END ASC,
    CASE WHEN p_sort = 'newest' THEN p.created_date END DESC,
    p.id ASC
  OFFSET (v_page - 1) * v_page_size
  LIMIT v_page_size;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_product_catalog_counts(
  p_restaurant_id uuid,
  p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.erp_can_access_scope(p_restaurant_id, p_branch_id) THEN
    RAISE EXCEPTION 'Product catalog access denied' USING ERRCODE = '42501';
  END IF;

  WITH master AS (
    SELECT p.id, p.product_id, p.is_active, p.status
    FROM public.products p
    WHERE p.restaurant_id = p_restaurant_id
      AND p.branch_id IS NULL
  ), assortment AS (
    SELECT DISTINCT a.product_id
    FROM public.branch_product_assortments a
    WHERE a.restaurant_id = p_restaurant_id
      AND a.is_active = true
      AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
  ), inventory_rollup AS (
    SELECT
      i.product_id,
      sum(COALESCE(i.opening_stock, i.quantity, 0)) AS quantity,
      max(COALESCE(i.low_stock_threshold, 0)) AS low_stock_threshold,
      sum(COALESCE(i.total_value, COALESCE(i.opening_stock, i.quantity, 0) * COALESCE(i.average_cost, i.last_purchase_price, 0))) AS inventory_value
    FROM public.inventory i
    WHERE i.restaurant_id = p_restaurant_id
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
    GROUP BY i.product_id
  ), branch_inventory AS (
    SELECT
      count(*) FILTER (WHERE quantity <= 0) AS out_of_stock,
      count(*) FILTER (
        WHERE quantity > 0
          AND low_stock_threshold > 0
          AND quantity <= low_stock_threshold
      ) AS low_stock,
      COALESCE(sum(inventory_value), 0) AS inventory_value
    FROM inventory_rollup
  )
  SELECT jsonb_build_object(
    'master_total', (SELECT count(*) FROM master),
    'active_total', (SELECT count(*) FROM master WHERE COALESCE(status, 'active') = 'active' AND COALESCE(is_active, true)),
    'branch_assigned', (SELECT count(*) FROM assortment),
    'branch_unassigned', GREATEST((SELECT count(*) FROM master) - (SELECT count(*) FROM assortment), 0),
    'low_stock', COALESCE((SELECT low_stock FROM branch_inventory), 0),
    'out_of_stock', COALESCE((SELECT out_of_stock FROM branch_inventory), 0),
    'inventory_value', COALESCE((SELECT inventory_value FROM branch_inventory), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_set_branch_product_assortment(
  p_restaurant_id uuid,
  p_branch_id uuid,
  p_product_ids uuid[],
  p_active boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_changed integer := 0;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.erp_can_write_module_scope_text(p_restaurant_id::text, p_branch_id::text, 'updateInventory') THEN
    RAISE EXCEPTION 'Branch assortment update denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.restaurant_id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'The selected branch does not belong to this organization' USING ERRCODE = '23514';
  END IF;

  IF COALESCE(array_length(p_product_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  IF NOT p_active AND EXISTS (
    SELECT 1
    FROM public.inventory i
    JOIN public.products p
      ON p.restaurant_id = i.restaurant_id
     AND (i.product_id = p.id::text OR i.product_id = p.product_id)
    WHERE i.restaurant_id = p_restaurant_id
      AND i.branch_id = p_branch_id
      AND p.id = ANY(p_product_ids)
      AND COALESCE(i.opening_stock, i.quantity, 0) <> 0
  ) THEN
    RAISE EXCEPTION 'Products with on-hand stock cannot be removed from a branch assortment' USING ERRCODE = '23514';
  END IF;

  IF p_active THEN
    INSERT INTO public.branch_product_assortments (
      restaurant_id, branch_id, product_id, is_active, created_by, updated_by
    )
    SELECT
      p_restaurant_id,
      p_branch_id,
      p.id,
      true,
      auth.jwt() ->> 'email',
      auth.jwt() ->> 'email'
    FROM public.products p
    WHERE p.restaurant_id = p_restaurant_id
      AND p.branch_id IS NULL
      AND p.id = ANY(p_product_ids)
    ON CONFLICT (restaurant_id, branch_id, product_id)
    DO UPDATE SET
      is_active = true,
      updated_at = now(),
      updated_by = auth.jwt() ->> 'email';
    GET DIAGNOSTICS v_changed = ROW_COUNT;
  ELSE
    UPDATE public.branch_product_assortments a
    SET is_active = false,
        updated_at = now(),
        updated_by = auth.jwt() ->> 'email'
    WHERE a.restaurant_id = p_restaurant_id
      AND a.branch_id = p_branch_id
      AND a.product_id = ANY(p_product_ids)
      AND a.is_active = true;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
  END IF;

  RETURN v_changed;
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

  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Import rows must be a JSON array' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_rows) > 1000 THEN
    RAISE EXCEPTION 'Import chunks may contain at most 1000 rows' USING ERRCODE = '22023';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.restaurant_id = p_restaurant_id
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

REVOKE ALL ON public.branch_product_assortments FROM anon;
REVOKE ALL ON public.product_import_jobs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_product_assortments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.product_import_jobs TO authenticated;

REVOKE ALL ON FUNCTION public.erp_search_master_products(uuid, uuid, text, text, text, text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_product_catalog_counts(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_set_branch_product_assortment(uuid, uuid, uuid[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_bulk_upsert_master_products(uuid, jsonb, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.erp_search_master_products(uuid, uuid, text, text, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_product_catalog_counts(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_set_branch_product_assortment(uuid, uuid, uuid[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_bulk_upsert_master_products(uuid, jsonb, uuid) TO authenticated;

COMMENT ON TABLE public.branch_product_assortments IS
  'Branch-specific activation and overrides for organization master products; inventory quantity stays in the inventory ledger.';
COMMENT ON FUNCTION public.erp_search_master_products IS
  'RLS-safe paginated product master search designed for catalogs larger than 100,000 records.';
COMMENT ON FUNCTION public.erp_bulk_upsert_master_products IS
  'RLS-safe chunked master product upsert for validated CSV/XLSX imports (maximum 1,000 rows per call).';
