-- Customer portal account selector: provide the real branch display name, not the internal key.
-- No customer, branch, authorization, or financial records are modified.
CREATE OR REPLACE FUNCTION customer_portal_private.accounts()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
 IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'CUSTOMER_PORTAL_FORBIDDEN';
 END IF;
 RETURN coalesce((
  SELECT jsonb_agg(
   jsonb_build_object(
    'id',c.id,
    'name',c.name,
    'business',r.name,
    'currency',r.currency,
    'branch',NULLIF(btrim(b.name),''),
    'branch_name',NULLIF(btrim(b.name),'')
   ) ORDER BY r.name,b.name,c.name
  )
  FROM public.customer_portal_access a
  JOIN public.customers c ON c.id=a.customer_id
  JOIN public.restaurants r ON r.id=c.restaurant_id
  LEFT JOIN public.branches b
    ON b.id=c.branch_id AND b.restaurant_id=c.restaurant_id
  WHERE a.user_id=auth.uid() AND a.active AND c.is_active
 ),'[]'::jsonb);
END $$;
-- Existing function ownership and EXECUTE grants are preserved by CREATE OR REPLACE.
