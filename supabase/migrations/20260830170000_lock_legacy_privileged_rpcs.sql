begin;

-- The onboarding initializer remains a browser RPC, but an approved Owner may
-- initialize only their own organization and one of its active branches.
create or replace function public.initialize_tenant(
  p_organization_id uuid,
  p_branch_id uuid,
  p_currency_code text default 'USD',
  p_currency_symbol text default '$',
  p_currency_name text default 'US Dollar'
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $function$
declare
  result jsonb := '{}'::jsonb;
begin
  if not public.erp_is_approved_owner(p_organization_id) then
    raise exception using errcode = '42501', message = 'OWNER_ACCESS_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.branches branch
    where branch.id = p_branch_id
      and branch.restaurant_id = p_organization_id
      and coalesce(branch.is_active, true)
  ) then
    raise exception using errcode = '22023', message = 'ACTIVE_BRANCH_REQUIRED';
  end if;

  if nullif(btrim(p_currency_code), '') is null
     or length(btrim(p_currency_code)) > 8
     or nullif(btrim(p_currency_symbol), '') is null
     or length(btrim(p_currency_symbol)) > 8
     or nullif(btrim(p_currency_name), '') is null
     or length(btrim(p_currency_name)) > 80 then
    raise exception using errcode = '22023', message = 'INVALID_CURRENCY_CONFIGURATION';
  end if;

  insert into public.org_currencies (
    organization_id, code, name, symbol, is_default, exchange_rate
  ) values (
    p_organization_id, upper(btrim(p_currency_code)), btrim(p_currency_name),
    btrim(p_currency_symbol), true, 1
  ) on conflict (organization_id, code) do nothing;

  insert into public.org_warehouses (
    organization_id, branch_id, name, is_default, is_active
  ) values (
    p_organization_id, p_branch_id, 'Main Warehouse', true, true
  ) on conflict do nothing;

  insert into public.org_cash_registers (
    organization_id, branch_id, name, register_code, is_default, is_active
  ) values (
    p_organization_id, p_branch_id, 'Main Register', 'REG-001', true, true
  ) on conflict do nothing;

  insert into public.sales_sources (
    restaurant_id, name, color, icon, is_active, is_default, sort_order
  ) values
    (p_organization_id, 'Dine In', '#10b981', 'utensils', true, true, 1),
    (p_organization_id, 'Takeaway', '#3b82f6', 'shopping-bag', true, false, 2),
    (p_organization_id, 'Delivery', '#f59e0b', 'truck', true, false, 3),
    (p_organization_id, 'Online', '#8b5cf6', 'globe', true, false, 4),
    (p_organization_id, 'Phone', '#ec4899', 'phone', true, false, 5)
  on conflict do nothing;

  insert into public.product_categories (
    restaurant_id, name, type, color, sort_order
  ) values
    (p_organization_id, 'Food', 'product', '#ef4444', 1),
    (p_organization_id, 'Beverages', 'product', '#3b82f6', 2),
    (p_organization_id, 'Desserts', 'product', '#f59e0b', 3),
    (p_organization_id, 'Snacks', 'product', '#10b981', 4),
    (p_organization_id, 'Other', 'product', '#6b7280', 5)
  on conflict do nothing;

  insert into public.expense_categories (restaurant_id, name, color)
  values
    (p_organization_id, 'Rent', '#ef4444'),
    (p_organization_id, 'Utilities', '#f59e0b'),
    (p_organization_id, 'Salaries', '#3b82f6'),
    (p_organization_id, 'Supplies', '#10b981'),
    (p_organization_id, 'Marketing', '#8b5cf6'),
    (p_organization_id, 'Maintenance', '#ec4899'),
    (p_organization_id, 'Other', '#6b7280')
  on conflict do nothing;

  insert into public.org_settings (organization_id, settings)
  values (
    p_organization_id,
    jsonb_build_object(
      'allow_negative_stock', false,
      'require_branch_for_sales', true,
      'auto_approve_owners', true,
      'default_currency', upper(btrim(p_currency_code)),
      'default_currency_symbol', btrim(p_currency_symbol),
      'tax_rate', 0,
      'receipt_footer', '',
      'initialized_at', now()::text
    )
  ) on conflict (organization_id) do update
    set settings = public.org_settings.settings || excluded.settings,
        updated_at = now();

  update public.restaurants
  set is_initialized = true
  where id = p_organization_id;

  result := jsonb_build_object(
    'success', true,
    'organization_id', p_organization_id,
    'branch_id', p_branch_id
  );
  return result;
end;
$function$;

revoke all on function public.initialize_tenant(uuid,uuid,text,text,text)
  from public, anon;
grant execute on function public.initialize_tenant(uuid,uuid,text,text,text)
  to authenticated, service_role;

-- Superseded registration selection/approval RPCs violate the invitation-only
-- model and are not used by the current application. Keep them for controlled
-- maintenance compatibility, but remove direct tenant-user execution.
revoke all on function public.erp_registration_options()
  from public, anon, authenticated;
grant execute on function public.erp_registration_options() to service_role;

revoke all on function public.process_registration_approval(uuid,text,uuid,text,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.process_registration_approval(uuid,text,uuid,text,uuid,jsonb)
  to service_role;

-- Internal financial helpers are called by canonical privileged routines or
-- triggers. They are not supported public RPC endpoints.
revoke all on function public.get_or_create_settlement(date,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.get_or_create_settlement(date,text,text,uuid)
  to service_role;

revoke all on function public.recompute_settlement(uuid)
  from public, anon, authenticated;
grant execute on function public.recompute_settlement(uuid) to service_role;

revoke all on function public.erp_refresh_customer_receivable_cache(uuid)
  from public, anon, authenticated;
grant execute on function public.erp_refresh_customer_receivable_cache(uuid)
  to service_role;

revoke all on function public.erp_sales_closing_assert_existing_branch_context(uuid,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.erp_sales_closing_assert_existing_branch_context(uuid,text,uuid,text)
  to service_role;

revoke all on function public.erp_sales_closing_branch_wallet_balance(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.erp_sales_closing_branch_wallet_balance(uuid,uuid,text)
  to service_role;

revoke all on function public.erp_sales_closing_expected_cash(uuid,uuid,text,date,text,uuid,uuid,numeric)
  from public, anon, authenticated;
grant execute on function public.erp_sales_closing_expected_cash(uuid,uuid,text,date,text,uuid,uuid,numeric)
  to service_role;

revoke all on function public.erp_sales_closing_opening_cash(uuid,uuid,text,date,text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.erp_sales_closing_opening_cash(uuid,uuid,text,date,text,uuid,uuid)
  to service_role;

commit;
