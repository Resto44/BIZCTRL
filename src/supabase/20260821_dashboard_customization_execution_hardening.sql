-- Security hardening for dashboard customization helpers.
-- The RLS policy helper must be callable only by authenticated sessions;
-- the audit trigger function is never intended as an RPC surface.

REVOKE EXECUTE ON FUNCTION public.erp_can_manage_dashboard_customization(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_dashboard_configuration_audit_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_can_manage_dashboard_customization(uuid) TO authenticated;
