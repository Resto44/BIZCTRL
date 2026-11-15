-- Drivers use the explicitly linked self-service RPCs, never general ERP scope.
-- Preserve existing owner, manager, employee and supplier access contracts.
CREATE OR REPLACE FUNCTION public.erp_can_access_scope_text(
  p_restaurant_id text, p_branch_id text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.erp_memberships m
    WHERE m.user_id = auth.uid()
      AND m.status = 'approved'
      AND m.role <> 'driver'
      AND m.restaurant_id::text = nullif(p_restaurant_id, '')
      AND (
        m.role = 'owner'
        OR (nullif(p_branch_id, '') IS NOT NULL AND m.branch_id::text = nullif(p_branch_id, ''))
      )
  ) AND EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.restaurant_id::text = nullif(p_restaurant_id, '')
      AND public.erp_subscription_has_erp_access(s.restaurant_id)
  );
$function$;
