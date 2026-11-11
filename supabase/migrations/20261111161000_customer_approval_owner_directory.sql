-- Read-only, owner-approved customer directory for Approval Center.
-- Customer portal invitations are NOT ERP staff memberships.
-- This endpoint never returns customer invite token hashes or secret tokens.
CREATE OR REPLACE FUNCTION public.erp_customer_portal_owner_directory(
  p_restaurant_id uuid,
  p_branch_id uuid DEFAULT NULL,
  p_search text DEFAULT '',
  p_limit integer DEFAULT 100
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_total bigint;
        v_items jsonb;
        v_needle text := lower(btrim(left(coalesce(p_search,''),120)));
        v_limit integer := greatest(1,least(coalesce(p_limit,100),150));
BEGIN
  IF auth.uid() IS NULL OR p_restaurant_id IS NULL OR
     NOT public.erp_is_approved_owner(p_restaurant_id) THEN
    RAISE EXCEPTION 'CUSTOMER_PORTAL_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id=p_branch_id AND b.restaurant_id=p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'CUSTOMER_PORTAL_BRANCH_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT count(*) INTO v_total
  FROM public.customers c
  WHERE c.restaurant_id=p_restaurant_id AND c.is_active IS TRUE
    AND (p_branch_id IS NULL OR c.branch_id=p_branch_id OR c.branch_id IS NULL)
    AND (v_needle='' OR position(v_needle in lower(concat_ws(' ',c.name,c.email,c.phone,c.customer_code)))>0);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
     'id',x.id,'name',x.name,'email',x.email,'phone',x.phone,
     'branch_id',x.branch_id,'branch_name',x.branch_name,
     'invited_email',x.invited_email,'status',x.invitation_status,
     'updated_at',x.updated_at
  ) ORDER BY x.name,x.id),'[]'::jsonb) INTO v_items
  FROM (
    SELECT c.id,c.name,c.email,c.phone,c.branch_id,b.name AS branch_name,
      a.invited_email,a.updated_at,
      CASE WHEN a.active IS TRUE AND a.user_id IS NOT NULL THEN 'activated'
        WHEN a.token_hash IS NOT NULL AND a.expires_at>now() THEN 'pending'
        WHEN a.token_hash IS NOT NULL AND a.expires_at<=now() THEN 'expired'
        WHEN a.customer_id IS NOT NULL THEN 'revoked'
        ELSE 'not_invited' END AS invitation_status
    FROM public.customers c
    LEFT JOIN public.branches b ON b.id=c.branch_id AND b.restaurant_id=c.restaurant_id
    LEFT JOIN public.customer_portal_access a ON a.customer_id=c.id
    WHERE c.restaurant_id=p_restaurant_id AND c.is_active IS TRUE
      AND (p_branch_id IS NULL OR c.branch_id=p_branch_id OR c.branch_id IS NULL)
      AND (v_needle='' OR position(v_needle in lower(concat_ws(' ',c.name,c.email,c.phone,c.customer_code)))>0)
    ORDER BY c.name,c.id LIMIT v_limit
  ) x;
  RETURN jsonb_build_object('total',v_total,'customers',v_items);
END $$;

REVOKE ALL ON FUNCTION public.erp_customer_portal_owner_directory(uuid,uuid,text,integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_customer_portal_owner_directory(uuid,uuid,text,integer)
  TO authenticated;
