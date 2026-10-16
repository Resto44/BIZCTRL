-- Owner-only private accounting; no financial data is rewritten.
-- Privileged ERP restaurant access alone must not expose another owner user's
-- personal expenses, receipts, or income through the REST API.
ALTER POLICY erp_scope_select ON public.owner_personal_finance
  USING (
    public.erp_can_write_scope_text(restaurant_id::text, branch_id::text)
    AND created_by = (SELECT auth.jwt() ->> 'email')
  );

ALTER POLICY erp_scope_insert ON public.owner_personal_finance
  WITH CHECK (
    public.erp_can_write_scope_text(restaurant_id::text, branch_id::text)
    AND created_by = (SELECT auth.jwt() ->> 'email')
  );

ALTER POLICY erp_scope_update ON public.owner_personal_finance
  USING (
    public.erp_can_write_scope_text(restaurant_id::text, branch_id::text)
    AND created_by = (SELECT auth.jwt() ->> 'email')
  )
  WITH CHECK (
    public.erp_can_write_scope_text(restaurant_id::text, branch_id::text)
    AND created_by = (SELECT auth.jwt() ->> 'email')
  );

ALTER POLICY erp_scope_delete ON public.owner_personal_finance
  USING (
    public.erp_can_write_scope_text(restaurant_id::text, branch_id::text)
    AND created_by = (SELECT auth.jwt() ->> 'email')
  );

-- Fast, stable date/id pagination without partial 1,000-record totals.
CREATE INDEX IF NOT EXISTS owner_personal_finance_owner_date_id_idx
  ON public.owner_personal_finance (restaurant_id, created_by, date DESC, id);

-- Keep dual legacy/new type columns consistent for accounting reports.
ALTER TABLE public.owner_personal_finance
  ADD CONSTRAINT owner_personal_finance_type_consistency_chk
  CHECK (record_type IS NULL OR type IS NULL OR record_type = type);

-- Prevent invalid personal withdrawal categories even with a direct REST write.
ALTER TABLE public.owner_personal_finance
  ADD CONSTRAINT owner_personal_finance_wallet_source_chk
  CHECK (record_type <> 'withdrawal'
         OR wallet_source IN ('owner_cash','owner_network'));
