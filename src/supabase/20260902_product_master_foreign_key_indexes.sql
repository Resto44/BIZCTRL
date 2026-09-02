-- Cover foreign-key lookups used by branch assortment and import cleanup paths.
-- These indexes complement the tenant-first catalog indexes in the base migration.

CREATE INDEX IF NOT EXISTS idx_branch_product_assortments_branch_fk
  ON public.branch_product_assortments (branch_id);

CREATE INDEX IF NOT EXISTS idx_branch_product_assortments_product_fk
  ON public.branch_product_assortments (product_id);

CREATE INDEX IF NOT EXISTS idx_product_import_jobs_branch_fk
  ON public.product_import_jobs (branch_id)
  WHERE branch_id IS NOT NULL;
