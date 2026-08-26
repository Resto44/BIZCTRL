BEGIN;

-- Keep the canonical transaction as the single accounting implementation, but
-- expose distinct entry points so a draft save can never be mistaken for a
-- finalization request at the client or API boundary.
CREATE OR REPLACE FUNCTION public.erp_save_sales_closing_draft(
  p_payload jsonb,
  p_closing_id uuid DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.erp_save_sales_closing(
    jsonb_set(COALESCE(p_payload, '{}'::jsonb), '{closing_state}', to_jsonb('draft'::text), true),
    p_closing_id,
    p_request_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_finalize_sales_closing(
  p_payload jsonb,
  p_closing_id uuid DEFAULT NULL,
  p_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.erp_save_sales_closing(
    jsonb_set(COALESCE(p_payload, '{}'::jsonb), '{closing_state}', to_jsonb('finalized'::text), true),
    p_closing_id,
    p_request_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.erp_save_sales_closing_draft(jsonb, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.erp_finalize_sales_closing(jsonb, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_save_sales_closing_draft(jsonb, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_finalize_sales_closing(jsonb, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.erp_save_sales_closing_draft(jsonb, uuid, uuid) IS
  'Explicit draft-only Sales Closing entry point. It persists an editable session through the canonical transaction.';
COMMENT ON FUNCTION public.erp_finalize_sales_closing(jsonb, uuid, uuid) IS
  'Explicit finalization-only Sales Closing entry point. It validates and atomically persists all closing snapshots and audit data.';

COMMIT;
