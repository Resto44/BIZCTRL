-- An invoice may reference an already recorded operating expense or a
-- reusable expense category. References are metadata ONLY: linking never
-- inserts an expense or adds amounts to invoice totals, P&L or stock COGS.
ALTER TABLE public.supplier_invoices
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expense_category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS supplier_invoices_expense_link_idx
  ON public.supplier_invoices(restaurant_id,expense_id)
  WHERE expense_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.erp_validate_invoice_expense_link()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  linked_exp public.expenses%ROWTYPE;
  linked_category public.expense_categories%ROWTYPE;
  effective_category uuid;
BEGIN
  IF NEW.expense_id IS NULL AND NEW.expense_category_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.restaurant_id IS NULL OR NEW.branch_id IS NULL OR
     NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=NEW.branch_id
         AND b.restaurant_id=NEW.restaurant_id) THEN
    RAISE EXCEPTION 'INVOICE_EXPENSE_BRANCH_REQUIRED' USING ERRCODE='23514';
  END IF;
  IF NEW.expense_id IS NOT NULL THEN
    SELECT * INTO linked_exp FROM public.expenses e WHERE e.id=NEW.expense_id;
    IF NOT FOUND OR linked_exp.restaurant_id IS DISTINCT FROM NEW.restaurant_id
       OR NOT (
         linked_exp.branch_id=NEW.branch_id
         OR (linked_exp.branch_id IS NULL AND linked_exp.branch_key=NEW.branch)
       ) THEN
      RAISE EXCEPTION 'INVOICE_EXPENSE_SCOPE_MISMATCH' USING ERRCODE='23514';
    END IF;
    effective_category:=COALESCE(linked_exp.expense_category_id,linked_exp.category_id);
  END IF;
  IF NEW.expense_category_id IS NOT NULL THEN
    SELECT * INTO linked_category FROM public.expense_categories c
      WHERE c.id=NEW.expense_category_id;
    IF NOT FOUND OR linked_category.restaurant_id IS DISTINCT FROM NEW.restaurant_id
       OR (linked_category.branch_id IS NOT NULL
         AND linked_category.branch_id<>NEW.branch_id) THEN
      RAISE EXCEPTION 'INVOICE_EXPENSE_CATEGORY_SCOPE_MISMATCH' USING ERRCODE='23514';
    END IF;
    IF effective_category IS NOT NULL AND effective_category<>NEW.expense_category_id THEN
      RAISE EXCEPTION 'INVOICE_EXPENSE_CATEGORY_CONFLICT' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.erp_validate_invoice_expense_link() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_invoice_expense_link ON public.supplier_invoices;
CREATE TRIGGER trg_validate_invoice_expense_link
BEFORE INSERT OR UPDATE OF expense_id,expense_category_id,restaurant_id,branch_id,branch
ON public.supplier_invoices FOR EACH ROW
EXECUTE FUNCTION public.erp_validate_invoice_expense_link();

COMMENT ON COLUMN public.supplier_invoices.expense_id IS
 'Optional read-only association to a pre-existing expense transaction; never posts a new expense.';
COMMENT ON COLUMN public.supplier_invoices.expense_category_id IS
 'Optional classification using the same tenant/branch expense category; never adds invoice charges.';

-- Existing 180+ invoices and all original expenses remain unchanged.
