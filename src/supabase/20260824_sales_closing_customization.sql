-- Sales Closing Customization
--
-- Additive only: this migration creates tenant-scoped configuration structures and
-- a historical-data guard. It does not alter, truncate, or backfill existing
-- financial closing records.

BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[a-z0-9_]{1,64}$'),
  name_en text NOT NULL CHECK (char_length(btrim(name_en)) BETWEEN 1 AND 100),
  name_ar text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, code)
);

CREATE TABLE IF NOT EXISTS public.sales_closing_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  field_key text NOT NULL CHECK (field_key ~ '^[a-z0-9_]{1,64}$'),
  label_en text NOT NULL CHECK (char_length(btrim(label_en)) BETWEEN 1 AND 120),
  label_ar text,
  field_type text NOT NULL CHECK (field_type IN (
    'currency', 'number', 'text', 'long_text', 'dropdown', 'date', 'time',
    'checkbox', 'sales_source', 'payment_method', 'customer', 'branch',
    'cashier', 'shift', 'notes'
  )),
  options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array'),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_required boolean NOT NULL DEFAULT false,
  visible_mobile boolean NOT NULL DEFAULT true,
  visible_desktop boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, field_key)
);

CREATE TABLE IF NOT EXISTS public.sales_closing_config (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{"version":1,"calculations":{"automatic_totals":true},"validation_rules":{"require_cash_reconciliation":true},"permissions":{"owner_only_customization":true}}'::jsonb
    CHECK (jsonb_typeof(settings) = 'object'),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_sales
  ADD COLUMN IF NOT EXISTS sales_closing_custom_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'daily_sales_custom_fields_array'
      AND conrelid = 'public.daily_sales'::regclass
  ) THEN
    ALTER TABLE public.daily_sales
      ADD CONSTRAINT daily_sales_custom_fields_array
      CHECK (jsonb_typeof(sales_closing_custom_fields) = 'array');
  END IF;
END;
$constraint$;

CREATE INDEX IF NOT EXISTS idx_payment_methods_restaurant_sort
  ON public.payment_methods (restaurant_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_sales_closing_fields_restaurant_sort
  ON public.sales_closing_fields (restaurant_id, sort_order, created_at);

CREATE OR REPLACE FUNCTION public.erp_sales_closing_customization_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS payment_methods_touch_updated_at ON public.payment_methods;
CREATE TRIGGER payment_methods_touch_updated_at
BEFORE UPDATE ON public.payment_methods
FOR EACH ROW EXECUTE FUNCTION public.erp_sales_closing_customization_touch_updated_at();

DROP TRIGGER IF EXISTS sales_closing_fields_touch_updated_at ON public.sales_closing_fields;
CREATE TRIGGER sales_closing_fields_touch_updated_at
BEFORE UPDATE ON public.sales_closing_fields
FOR EACH ROW EXECUTE FUNCTION public.erp_sales_closing_customization_touch_updated_at();

DROP TRIGGER IF EXISTS sales_closing_config_touch_updated_at ON public.sales_closing_config;
CREATE TRIGGER sales_closing_config_touch_updated_at
BEFORE UPDATE ON public.sales_closing_config
FOR EACH ROW EXECUTE FUNCTION public.erp_sales_closing_customization_touch_updated_at();

-- Configuration changes can never erase a sales source that is referenced by a
-- historical daily closing. Deactivation remains available for future closings.
CREATE OR REPLACE FUNCTION public.erp_prevent_used_sales_source_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.daily_sales AS closing_record
    WHERE closing_record.restaurant_id = OLD.restaurant_id
      AND (
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(COALESCE(closing_record.sales_sources_json, '[]'::jsonb)) = 'array'
              THEN COALESCE(closing_record.sales_sources_json, '[]'::jsonb)
              ELSE '[]'::jsonb END
          ) AS source_entry
          WHERE source_entry ->> 'source_id' = OLD.id::text
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(COALESCE(closing_record.custom_sources, '[]'::jsonb)) = 'array'
              THEN COALESCE(closing_record.custom_sources, '[]'::jsonb)
              ELSE '[]'::jsonb END
          ) AS source_entry
          WHERE source_entry ->> 'source_id' = OLD.id::text
        )
      )
  ) THEN
    RAISE EXCEPTION 'SALES_SOURCE_IN_USE'
      USING DETAIL = 'A source referenced by historical closings may be deactivated but not deleted.';
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS erp_prevent_used_sales_source_delete ON public.sales_sources;
CREATE TRIGGER erp_prevent_used_sales_source_delete
BEFORE DELETE ON public.sales_sources
FOR EACH ROW EXECUTE FUNCTION public.erp_prevent_used_sales_source_delete();

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_closing_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_closing_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_methods_scope_select ON public.payment_methods;
CREATE POLICY payment_methods_scope_select
ON public.payment_methods
FOR SELECT
TO authenticated
USING (public.erp_can_access_scope(restaurant_id, NULL));

DROP POLICY IF EXISTS payment_methods_owner_write ON public.payment_methods;
CREATE POLICY payment_methods_owner_write
ON public.payment_methods
FOR ALL
TO authenticated
USING (public.erp_can_manage_workspace_customization(restaurant_id))
WITH CHECK (public.erp_can_manage_workspace_customization(restaurant_id));

DROP POLICY IF EXISTS sales_closing_fields_scope_select ON public.sales_closing_fields;
CREATE POLICY sales_closing_fields_scope_select
ON public.sales_closing_fields
FOR SELECT
TO authenticated
USING (public.erp_can_access_scope(restaurant_id, NULL));

DROP POLICY IF EXISTS sales_closing_fields_owner_write ON public.sales_closing_fields;
CREATE POLICY sales_closing_fields_owner_write
ON public.sales_closing_fields
FOR ALL
TO authenticated
USING (public.erp_can_manage_workspace_customization(restaurant_id))
WITH CHECK (public.erp_can_manage_workspace_customization(restaurant_id));

DROP POLICY IF EXISTS sales_closing_config_scope_select ON public.sales_closing_config;
CREATE POLICY sales_closing_config_scope_select
ON public.sales_closing_config
FOR SELECT
TO authenticated
USING (public.erp_can_access_scope(restaurant_id, NULL));

DROP POLICY IF EXISTS sales_closing_config_owner_write ON public.sales_closing_config;
CREATE POLICY sales_closing_config_owner_write
ON public.sales_closing_config
FOR ALL
TO authenticated
USING (public.erp_can_manage_workspace_customization(restaurant_id))
WITH CHECK (public.erp_can_manage_workspace_customization(restaurant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_closing_fields TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_closing_config TO authenticated;

-- Seed tenant defaults only when no matching configuration exists. Existing
-- historical sales data and existing sales-source configuration remain untouched.
INSERT INTO public.payment_methods (restaurant_id, code, name_en, name_ar, sort_order, is_active, is_system)
SELECT restaurant.id, default_method.code, default_method.name_en, default_method.name_ar,
       default_method.sort_order, true, true
FROM public.restaurants AS restaurant
CROSS JOIN (
  VALUES
    ('cash', 'Cash', 'نقدي', 10),
    ('card', 'Card', 'بطاقة', 20),
    ('bank_transfer', 'Bank Transfer', 'تحويل بنكي', 30),
    ('online_payment', 'Online Payment', 'دفع إلكتروني', 40),
    ('wallet', 'Wallet', 'محفظة', 50),
    ('credit', 'Credit', 'آجل', 60),
    ('other', 'Other', 'أخرى', 70)
) AS default_method(code, name_en, name_ar, sort_order)
ON CONFLICT (restaurant_id, code) DO NOTHING;

INSERT INTO public.sales_closing_fields (
  restaurant_id, field_key, label_en, label_ar, field_type, sort_order,
  is_required, is_system
)
SELECT restaurant.id, default_field.field_key, default_field.label_en,
       default_field.label_ar, default_field.field_type, default_field.sort_order,
       default_field.is_required, true
FROM public.restaurants AS restaurant
CROSS JOIN (
  VALUES
    ('branch', 'Branch', 'الفرع', 'branch', 10, true),
    ('date', 'Date', 'التاريخ', 'date', 20, true),
    ('shift', 'Shift', 'الوردية', 'shift', 30, true),
    ('cashier', 'Cashier', 'الكاشير', 'cashier', 40, true),
    ('sales_sources', 'Sales Sources', 'مصادر المبيعات', 'sales_source', 50, false),
    ('payment_methods', 'Payment Methods', 'طرق الدفع', 'payment_method', 60, false),
    ('purchases', 'Purchases', 'المشتريات', 'currency', 70, false),
    ('expenses', 'Expenses', 'المصروفات', 'currency', 80, false),
    ('customer_credit', 'Customer Credit', 'ائتمان العملاء', 'customer', 90, false),
    ('cash_reconciliation', 'Cash Reconciliation', 'مطابقة النقدية', 'currency', 100, true),
    ('notes', 'Notes', 'ملاحظات', 'notes', 110, false)
) AS default_field(field_key, label_en, label_ar, field_type, sort_order, is_required)
ON CONFLICT (restaurant_id, field_key) DO NOTHING;

INSERT INTO public.sales_closing_config (restaurant_id)
SELECT id FROM public.restaurants
ON CONFLICT (restaurant_id) DO NOTHING;

COMMIT;
