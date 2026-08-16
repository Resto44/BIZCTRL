-- Keep Platform Owner provisioning strictly server-side.
REVOKE ALL ON FUNCTION public.platform_owner_provision(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_owner_provision(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.platform_owner_provision(uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_owner_provision(uuid, boolean) TO service_role;

-- No user, grant, membership, or customer data is created or modified by this migration.
