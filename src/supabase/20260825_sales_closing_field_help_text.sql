-- Persist optional helper guidance for future Sales Closing custom fields.
-- Additive only: historical closing records remain unchanged.

BEGIN;

ALTER TABLE public.sales_closing_fields
  ADD COLUMN IF NOT EXISTS help_text text;

ALTER TABLE public.sales_closing_fields
  DROP CONSTRAINT IF EXISTS sales_closing_fields_help_text_length;

ALTER TABLE public.sales_closing_fields
  ADD CONSTRAINT sales_closing_fields_help_text_length
  CHECK (help_text IS NULL OR char_length(btrim(help_text)) <= 300);

COMMIT;
