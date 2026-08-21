-- Reusable Store Owner Dashboard customization
--
-- Presentation preferences are stored by restaurant. Widget IDs are stable
-- application keys; titles/descriptions never change underlying metrics.

CREATE TABLE IF NOT EXISTS public.dashboard_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  widget_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT dashboard_configurations_restaurant_unique UNIQUE (restaurant_id),
  CONSTRAINT dashboard_configurations_widget_overrides_object
    CHECK (jsonb_typeof(widget_overrides) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_dashboard_configurations_restaurant_id
  ON public.dashboard_configurations (restaurant_id);

-- A delegated role is allowed only when its approved membership explicitly has
-- manageDashboardCustomization=true. Owners remain authorized by role.
CREATE OR REPLACE FUNCTION public.erp_can_manage_dashboard_customization(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $function$
  SELECT public.erp_is_approved_owner(p_restaurant_id)
    OR EXISTS (
      SELECT 1
      FROM public.erp_memberships membership
      WHERE membership.user_id = auth.uid()
        AND membership.status = 'approved'
        AND membership.restaurant_id = p_restaurant_id
        AND COALESCE((membership.permissions ->> 'manageDashboardCustomization')::boolean, false)
    );
$function$;

CREATE OR REPLACE FUNCTION public.set_dashboard_configuration_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS dashboard_configurations_set_audit_fields ON public.dashboard_configurations;
CREATE TRIGGER dashboard_configurations_set_audit_fields
BEFORE INSERT OR UPDATE ON public.dashboard_configurations
FOR EACH ROW
EXECUTE FUNCTION public.set_dashboard_configuration_audit_fields();

ALTER TABLE public.dashboard_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dashboard_configurations_member_select ON public.dashboard_configurations;
CREATE POLICY dashboard_configurations_member_select
ON public.dashboard_configurations
FOR SELECT
TO authenticated
USING (public.erp_can_access_scope(restaurant_id, NULL));

DROP POLICY IF EXISTS dashboard_configurations_owner_or_delegate_insert ON public.dashboard_configurations;
CREATE POLICY dashboard_configurations_owner_or_delegate_insert
ON public.dashboard_configurations
FOR INSERT
TO authenticated
WITH CHECK (public.erp_can_manage_dashboard_customization(restaurant_id));

DROP POLICY IF EXISTS dashboard_configurations_owner_or_delegate_update ON public.dashboard_configurations;
CREATE POLICY dashboard_configurations_owner_or_delegate_update
ON public.dashboard_configurations
FOR UPDATE
TO authenticated
USING (public.erp_can_manage_dashboard_customization(restaurant_id))
WITH CHECK (public.erp_can_manage_dashboard_customization(restaurant_id));

DROP POLICY IF EXISTS dashboard_configurations_owner_or_delegate_delete ON public.dashboard_configurations;
CREATE POLICY dashboard_configurations_owner_or_delegate_delete
ON public.dashboard_configurations
FOR DELETE
TO authenticated
USING (public.erp_can_manage_dashboard_customization(restaurant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_configurations TO authenticated;
-- SECURITY DEFINER functions are invoked by RLS/trigger paths only. Remove
-- PostgreSQL's default PUBLIC execution grant, then grant the policy helper
-- only to signed-in users who need it while evaluating table policies.
REVOKE EXECUTE ON FUNCTION public.erp_can_manage_dashboard_customization(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_dashboard_configuration_audit_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_can_manage_dashboard_customization(uuid) TO authenticated;
