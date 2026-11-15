-- Read-only authorization regression. No business records are modified.
BEGIN;
DO $test$
DECLARE member record;
BEGIN
  FOR member IN SELECT user_id,restaurant_id,branch_id
    FROM public.erp_memberships WHERE role IN ('driver','supplier') AND status='approved'
  LOOP
    PERFORM set_config('request.jwt.claim.sub', member.user_id::text, true);
    IF public.erp_can_access_scope_text(member.restaurant_id::text,member.branch_id::text) THEN
      RAISE EXCEPTION 'Self-service role must not receive general ERP branch scope';
    END IF;
    IF public.erp_can_access_scope_text(member.restaurant_id::text,NULL) THEN
      RAISE EXCEPTION 'Self-service role must not receive organization scope';
    END IF;
    IF (public.erp_owner_drawer_cash_asof(member.restaurant_id,current_date,member.branch_id)->>'branches')::int <> 0 THEN
      RAISE EXCEPTION 'Self-service role must not receive owner drawer details';
    END IF;
  END LOOP;
END;
$test$;
ROLLBACK;
