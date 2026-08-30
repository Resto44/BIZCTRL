begin;

-- Finalized Closing snapshots contain customer-credit and cash-ledger history.
-- They are append-only and may only be read inside the caller's approved ERP
-- scope. Direct browser writes stay disabled; canonical SECURITY DEFINER
-- closing routines remain the only writers.
alter table public.sales_closing_customer_credit_snapshots enable row level security;
alter table public.sales_closing_cash_ledger_snapshots enable row level security;

drop policy if exists sales_closing_customer_credit_snapshots_scoped_read
  on public.sales_closing_customer_credit_snapshots;
create policy sales_closing_customer_credit_snapshots_scoped_read
on public.sales_closing_customer_credit_snapshots
for select
to authenticated
using (
  exists (
    select 1
    from public.daily_sales closing
    where closing.id = sales_closing_customer_credit_snapshots.closing_id
      and public.erp_can_access_scope_text(
        closing.restaurant_id::text,
        closing.branch_id::text
      )
      and public.erp_has_permission('viewSales')
  )
);

drop policy if exists sales_closing_cash_ledger_snapshots_scoped_read
  on public.sales_closing_cash_ledger_snapshots;
create policy sales_closing_cash_ledger_snapshots_scoped_read
on public.sales_closing_cash_ledger_snapshots
for select
to authenticated
using (
  exists (
    select 1
    from public.daily_sales closing
    where closing.id = sales_closing_cash_ledger_snapshots.closing_id
      and public.erp_can_access_scope_text(
        closing.restaurant_id::text,
        closing.branch_id::text
      )
      and public.erp_has_permission('viewSales')
  )
);

revoke all on table public.sales_closing_customer_credit_snapshots
  from public, anon, authenticated;
revoke all on table public.sales_closing_cash_ledger_snapshots
  from public, anon, authenticated;
grant select on table public.sales_closing_customer_credit_snapshots to authenticated;
grant select on table public.sales_closing_cash_ledger_snapshots to authenticated;
grant all on table public.sales_closing_customer_credit_snapshots to service_role;
grant all on table public.sales_closing_cash_ledger_snapshots to service_role;

-- A SECURITY DEFINER function in an exposed schema is an RPC endpoint unless
-- EXECUTE is explicitly revoked. Preserve the existing signed-in application
-- surface, but remove all anonymous/PUBLIC access. Trigger functions never
-- need direct browser execution, so remove authenticated access as well.
do $hardening$
declare
  routine record;
  authenticated_had_execute boolean;
  service_had_execute boolean;
begin
  for routine in
    select
      p.oid,
      p.oid::regprocedure as signature,
      p.prorettype = 'pg_catalog.trigger'::regtype as is_trigger
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    authenticated_had_execute :=
      pg_catalog.has_function_privilege('authenticated', routine.oid, 'EXECUTE');
    service_had_execute :=
      pg_catalog.has_function_privilege('service_role', routine.oid, 'EXECUTE');

    execute format(
      'revoke execute on function %s from public, anon',
      routine.signature
    );

    if routine.is_trigger then
      execute format(
        'revoke execute on function %s from authenticated',
        routine.signature
      );
    elsif authenticated_had_execute then
      execute format(
        'grant execute on function %s to authenticated',
        routine.signature
      );
    end if;

    if service_had_execute then
      execute format(
        'grant execute on function %s to service_role',
        routine.signature
      );
    end if;
  end loop;
end
$hardening$;

-- Prevent new public functions created by the migration role from silently
-- regaining anonymous execution. Individual public endpoints must opt in.
alter default privileges in schema public
  revoke execute on functions from public, anon;

-- Pin the lookup namespace of legacy public functions. pg_catalog remains
-- implicitly available, while attacker-controlled schemas cannot shadow
-- unqualified ERP objects.
do $search_path_hardening$
declare
  routine record;
begin
  for routine in
    select p.oid::regprocedure as signature
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, '{}'::text[])) setting
        where setting like 'search_path=%'
      )
  loop
    execute format(
      'alter function %s set search_path = public',
      routine.signature
    );
  end loop;
end
$search_path_hardening$;

commit;
