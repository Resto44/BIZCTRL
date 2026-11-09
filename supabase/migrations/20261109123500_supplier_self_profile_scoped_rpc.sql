-- Resolve only the authenticated Supplier's OWN linked identity.
-- Do not broaden public.suppliers RLS or grant viewSuppliers management access.
-- Supports historical supplier records without a branch_id when the verified
-- ERP membership is explicitly linked to that supplier and one branch.
CREATE OR REPLACE FUNCTION public.erp_supplier_self_profile()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'id', s.id,
    'restaurant_id', s.restaurant_id,
    'branch_id', COALESCE(s.branch_id,m.branch_id),
    'name', s.name,
    'email', s.email,
    'phone', s.phone,
    'contact_person', s.contact_person,
    'status', s.status
  )
  FROM public.erp_memberships m
  JOIN public.suppliers s
    ON s.id=m.linked_entity_id
   AND s.restaurant_id=m.restaurant_id
   AND (s.branch_id IS NULL OR s.branch_id=m.branch_id)
  WHERE m.user_id=(SELECT auth.uid())
    AND m.role='supplier'
    AND m.status='approved'
    AND m.branch_id IS NOT NULL
    AND m.linked_entity_id IS NOT NULL
    AND COALESCE(s.status,TRUE)=TRUE
    AND public.erp_subscription_has_erp_access(m.restaurant_id)
  ORDER BY m.created_at DESC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.erp_supplier_self_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.erp_supplier_self_profile() TO authenticated;
