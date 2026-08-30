-- Owner-controlled ERP access core.
--
-- This migration establishes one canonical authorization contract for the four
-- supported store portals: Owner, Branch Manager, Employee, and Supplier.
-- Existing operational rows are preserved. Legacy authenticated roles are
-- migrated to the closest least-privileged supported role before constraints
-- are tightened.

begin;

-- ---------------------------------------------------------------------------
-- 1. Canonical roles and safe legacy migration
-- ---------------------------------------------------------------------------

-- Recover only deterministic legacy Owner tenant links. Test identities that
-- never created or joined a store remain intentionally unscoped and cannot
-- open an ERP portal.
update public.erp_memberships m
set restaurant_id=coalesce(p.organization_id,p.restaurant_id),updated_at=now()
from public.profiles p
where p.id=m.user_id
  and m.role='owner'
  and m.restaurant_id is null
  and coalesce(p.organization_id,p.restaurant_id) is not null
  and exists (
    select 1 from public.restaurants r
    where r.id=coalesce(p.organization_id,p.restaurant_id)
  );

update public.erp_memberships
set role = case
  when role = 'general_manager' then 'manager'
  when role in ('driver', 'kitchen') then 'employee'
  else role
end,
data_scope = case when role = 'owner' then 'all_branches' else 'assigned_branch' end,
selected_branch_ids = case when role = 'owner' then selected_branch_ids else '{}'::uuid[] end,
updated_at = now()
where role in ('general_manager', 'driver', 'kitchen')
   or (role <> 'owner' and coalesce(data_scope, '') <> 'assigned_branch');

update public.profiles
set role = case
  when role = 'general_manager' then 'manager'
  when role in ('driver', 'kitchen') then 'employee'
  else role
end,
updated_date = now()
where role in ('general_manager', 'driver', 'kitchen');

update public.branch_assignments
set role = case
  when role = 'general_manager' then 'manager'
  when role in ('driver', 'kitchen') then 'employee'
  else role
end,
updated_at = now()
where role in ('general_manager', 'driver', 'kitchen');

update public.erp_invitations
set role = case
  when role = 'general_manager' then 'manager'
  when role in ('driver', 'kitchen') then 'employee'
  else role
end
where role in ('general_manager', 'driver', 'kitchen');

alter table public.erp_memberships
  drop constraint if exists erp_memberships_role_check;

alter table public.erp_memberships
  add constraint erp_memberships_role_check
  check (role = any (array['owner'::text, 'manager'::text, 'employee'::text, 'supplier'::text]));

alter table public.erp_invitations
  drop constraint if exists erp_invitations_role_v2_check;

alter table public.erp_invitations
  add constraint erp_invitations_role_v2_check
  check (role = any (array['manager'::text, 'employee'::text, 'supplier'::text]));

-- ---------------------------------------------------------------------------
-- 2. Permission catalogue and deterministic effective permissions
-- ---------------------------------------------------------------------------

create table if not exists public.erp_permission_catalog (
  permission_key text primary key,
  module_key text not null,
  label text not null,
  description text not null default '',
  allowed_roles text[] not null default array['manager','employee']::text[],
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint erp_permission_catalog_allowed_roles_check
    check (allowed_roles <@ array['manager','employee','supplier']::text[])
);

alter table public.erp_permission_catalog enable row level security;

drop policy if exists erp_permission_catalog_authenticated_read on public.erp_permission_catalog;
create policy erp_permission_catalog_authenticated_read
on public.erp_permission_catalog for select to authenticated
using (true);

revoke all on table public.erp_permission_catalog from public, anon;
grant select on table public.erp_permission_catalog to authenticated;
grant all on table public.erp_permission_catalog to service_role;

insert into public.erp_permission_catalog
  (permission_key, module_key, label, description, allowed_roles, sort_order)
values
  ('viewDashboard','core','Dashboard','Open the assigned ERP dashboard',array['manager','employee','supplier'],10),
  ('viewSales','sales','Sales','View branch sales records',array['manager','employee'],20),
  ('uploadSales','sales','Create Sales','Create and update authorized branch sales',array['manager','employee'],21),
  ('viewOrders','sales','Orders','View branch orders',array['manager','employee'],22),
  ('placeOrders','sales','Create Orders','Create customer or internal orders',array['manager','employee'],23),
  ('viewPurchases','purchases','Purchases','View purchase records',array['manager','employee'],30),
  ('createPurchases','purchases','Create Purchases','Create purchase invoices and line items',array['manager','employee'],31),
  ('approvePurchases','purchases','Approve Purchases','Approve and post purchase records',array['manager'],32),
  ('viewPurchaseOrders','purchases','Purchase Orders','View assigned purchase orders',array['manager','employee','supplier'],33),
  ('updatePurchaseOrders','purchases','Update Purchase Orders','Update assigned purchase-order workflow',array['manager','employee','supplier'],34),
  ('viewInvoices','purchases','Invoices','View assigned invoices',array['manager','employee','supplier'],35),
  ('createInvoices','purchases','Create Invoices','Create invoices in the assigned workflow',array['manager','employee','supplier'],36),
  ('viewPayments','purchases','Payments','View assigned payment status',array['manager','employee','supplier'],37),
  ('viewInventory','inventory','Inventory','View assigned branch inventory',array['manager','employee'],40),
  ('updateInventory','inventory','Update Inventory','Post authorized inventory movements',array['manager','employee'],41),
  ('viewProducts','inventory','Products','View products and units',array['manager','employee','supplier'],42),
  ('viewSuppliers','purchases','Suppliers','View supplier records',array['manager','employee'],43),
  ('manageSuppliers','purchases','Manage Suppliers','Create or update suppliers',array['manager','employee'],44),
  ('viewExpenses','finance','Expenses','View branch expenses',array['manager','employee'],50),
  ('createExpenses','finance','Create Expenses','Create authorized expenses',array['manager','employee'],51),
  ('approveExpenses','finance','Approve Expenses','Approve branch expenses',array['manager'],52),
  ('viewTreasury','finance','Treasury','View cash and treasury records',array['manager','employee'],53),
  ('viewDebts','finance','Debt Management','View debt and receivable records',array['manager','employee'],54),
  ('viewFinancials','finance','Financials','View authorized financial summaries',array['manager'],55),
  ('viewProfitLoss','reports','Profit & Loss','View branch profit and loss',array['manager'],56),
  ('viewReports','reports','Reports','View authorized ERP reports',array['manager','employee'],60),
  ('exportPDF','reports','Export / Print','Export authorized records and reports',array['manager','employee'],61),
  ('viewEmployees','people','Employees','View assigned branch employees',array['manager'],70),
  ('manageEmployees','people','Manage Employees','Create and update assigned branch employees',array['manager'],71),
  ('viewPayroll','people','Payroll','View authorized payroll data',array['manager','employee'],72),
  ('viewAttendance','people','Attendance','View attendance',array['manager','employee'],73),
  ('recordAttendance','people','Record Attendance','Record own or authorized attendance',array['manager','employee'],74),
  ('viewSchedule','people','Schedule','View assigned schedule',array['manager','employee'],75),
  ('viewTasks','people','Tasks','View and update assigned tasks',array['manager','employee'],76),
  ('viewSalary','people','My Salary','View own salary statement',array['employee'],77),
  ('viewProfile','people','Profile','View own ERP profile',array['manager','employee','supplier'],78),
  ('viewDelivery','operations','Delivery','View branch delivery operations',array['manager','employee'],80),
  ('updateDelivery','operations','Update Delivery','Update assigned delivery status',array['manager','employee'],81),
  ('viewAlerts','operations','Alerts','View operational alerts',array['manager','employee'],82),
  ('viewSupport','core','Support','Contact ERP support',array['manager','employee','supplier'],90)
on conflict (permission_key) do update set
  module_key = excluded.module_key,
  label = excluded.label,
  description = excluded.description,
  allowed_roles = excluded.allowed_roles,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

create or replace function public.erp_default_permissions(p_role text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(p_role, ''))
    when 'owner' then '{"all":true}'::jsonb
    when 'manager' then '{
      "viewDashboard":true,"viewSales":true,"uploadSales":true,"viewOrders":true,
      "viewPurchases":true,"createPurchases":true,"viewPurchaseOrders":true,
      "viewInvoices":true,"viewInventory":true,"viewProducts":true,
      "viewSuppliers":true,"viewExpenses":true,"viewTreasury":true,
      "viewEmployees":true,"viewAttendance":true,"recordAttendance":true,
      "viewSchedule":true,"viewTasks":true,"viewDelivery":true,
      "updateDelivery":true,"viewAlerts":true,"viewSupport":true
    }'::jsonb
    when 'employee' then '{
      "viewDashboard":true,"viewAttendance":true,"recordAttendance":true,
      "viewSchedule":true,"viewTasks":true,"viewProfile":true,"viewSupport":true
    }'::jsonb
    when 'supplier' then '{
      "viewDashboard":true,"viewPurchaseOrders":true,"updatePurchaseOrders":true,
      "viewInvoices":true,"createInvoices":true,"viewPayments":true,
      "viewProducts":true,"viewProfile":true,"viewSupport":true
    }'::jsonb
    else '{}'::jsonb
  end;
$$;

create or replace function public.erp_sanitize_permissions(p_role text, p_permissions jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
  from jsonb_each(
    case when jsonb_typeof(coalesce(p_permissions, '{}'::jsonb)) = 'object'
      then coalesce(p_permissions, '{}'::jsonb)
      else '{}'::jsonb
    end
  ) entry
  join public.erp_permission_catalog catalog
    on catalog.permission_key = entry.key
   and catalog.is_active
   and lower(coalesce(p_role, '')) = any(catalog.allowed_roles)
  where jsonb_typeof(entry.value) = 'boolean';
$$;

create or replace function public.erp_effective_permissions(
  p_role text,
  p_membership_permissions jsonb,
  p_role_permissions jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case lower(coalesce(p_role, ''))
    when 'owner' then jsonb_build_object('all', true)
    else public.erp_default_permissions(p_role)
      || public.erp_sanitize_permissions(p_role, coalesce(p_role_permissions, '{}'::jsonb))
      || public.erp_sanitize_permissions(p_role, coalesce(p_membership_permissions, '{}'::jsonb))
  end;
$$;

create or replace function public.erp_enforce_membership_contract()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  new.role := lower(coalesce(new.role,''));
  if new.role not in ('owner','manager','employee','supplier') then
    raise exception 'Unsupported ERP portal role';
  end if;
  if new.role='owner' then
    new.data_scope := 'all_branches';
    new.selected_branch_ids := coalesce(new.selected_branch_ids,'{}'::uuid[]);
    new.permissions := '{}'::jsonb;
  else
    if new.status='approved' and (new.restaurant_id is null or new.branch_id is null) then
      raise exception 'Store and branch are required for an approved ERP portal';
    end if;
    new.data_scope := 'assigned_branch';
    new.selected_branch_ids := '{}'::uuid[];
    new.permissions := public.erp_sanitize_permissions(new.role,new.permissions);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists erp_membership_contract_trigger on public.erp_memberships;
create trigger erp_membership_contract_trigger
before insert or update of role,restaurant_id,branch_id,permissions,data_scope,selected_branch_ids
on public.erp_memberships
for each row execute function public.erp_enforce_membership_contract();

-- Clean legacy overrides without deleting memberships or operational records.
update public.erp_memberships m
set permissions = public.erp_sanitize_permissions(m.role, m.permissions),
    updated_at = now()
where m.role <> 'owner';

create or replace function public.erp_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.erp_memberships m
    left join public.erp_role_permissions rp
      on rp.restaurant_id = m.restaurant_id and rp.role = m.role
    where m.user_id = auth.uid()
      and m.status = 'approved'
      and (
        m.role = 'owner'
        or coalesce(
          (public.erp_effective_permissions(m.role, m.permissions, rp.permissions) ->> p_permission)::boolean,
          false
        )
      )
  );
$$;

-- One authoritative session payload for every portal. Frontend code must not
-- authorize from auth.user_metadata or from session/local storage.
create or replace function public.erp_get_session_context()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.erp_memberships;
  v_profile public.profiles;
  v_branch public.branches;
  v_role_permissions jsonb := '{}'::jsonb;
  v_effective jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select * into v_member
  from public.erp_memberships
  where user_id = v_uid
  order by updated_at desc
  limit 1;

  if v_member.id is null then
    raise exception using errcode = '42501', message = 'ERP_MEMBERSHIP_REQUIRED';
  end if;
  if v_member.status <> 'approved' then
    raise exception using errcode = '42501', message = 'ERP_MEMBERSHIP_' || upper(v_member.status);
  end if;
  if v_member.role not in ('owner','manager','employee','supplier') then
    raise exception using errcode = '42501', message = 'ERP_ROLE_NOT_SUPPORTED';
  end if;
  if v_member.restaurant_id is null then
    raise exception using errcode = '42501', message = 'ERP_STORE_SCOPE_REQUIRED';
  end if;
  if v_member.role <> 'owner' and v_member.branch_id is null then
    raise exception using errcode = '42501', message = 'ERP_BRANCH_SCOPE_REQUIRED';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  select * into v_branch from public.branches where id = v_member.branch_id;
  select permissions into v_role_permissions
  from public.erp_role_permissions
  where restaurant_id = v_member.restaurant_id and role = v_member.role
  limit 1;

  v_effective := public.erp_effective_permissions(
    v_member.role,
    v_member.permissions,
    coalesce(v_role_permissions, '{}'::jsonb)
  );

  update public.erp_memberships
  set last_login_at = now()
  where id = v_member.id
    and (last_login_at is null or last_login_at < now() - interval '15 minutes');

  return jsonb_build_object(
    'id', v_uid,
    'membership_id', v_member.id,
    'email', coalesce(v_member.email, v_profile.email),
    'full_name', coalesce(nullif(v_member.full_name, ''), v_profile.full_name, ''),
    'phone', coalesce(v_member.phone, v_profile.phone),
    'role', v_member.role,
    'status', v_member.status,
    'restaurant_id', v_member.restaurant_id,
    'organization_id', v_member.restaurant_id,
    'branch_id', v_member.branch_id,
    'branch', v_branch.branch_key,
    'branch_name', v_branch.name,
    'data_scope', case when v_member.role = 'owner' then 'all_branches' else 'assigned_branch' end,
    'selected_branch_ids', case when v_member.role = 'owner' then v_member.selected_branch_ids else array[]::uuid[] end,
    'linked_entity_id', v_member.linked_entity_id,
    'permissions', v_effective,
    'effective_permissions', v_effective,
    'home_path', case v_member.role
      when 'owner' then '/owner-command-center'
      when 'manager' then '/manager-dashboard'
      when 'employee' then '/employee-dashboard'
      when 'supplier' then '/supplier-portal'
    end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Owner-only lifecycle RPCs
-- ---------------------------------------------------------------------------

create or replace function public.update_user_role_and_permissions(
  p_membership_id uuid,
  p_new_role text default null,
  p_permissions jsonb default null,
  p_data_scope text default null,
  p_selected_branches uuid[] default null,
  p_action text default 'permission_change',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_mem public.erp_memberships;
  target_mem public.erp_memberships;
  upd_role text;
  upd_perms jsonb;
begin
  select * into actor_mem
  from public.erp_memberships
  where user_id = auth.uid() and role = 'owner' and status = 'approved'
  limit 1;
  if actor_mem.id is null then
    raise exception using errcode = '42501', message = 'OWNER_ACCESS_REQUIRED';
  end if;

  select * into target_mem
  from public.erp_memberships
  where id = p_membership_id and restaurant_id = actor_mem.restaurant_id
  for update;
  if target_mem.id is null then raise exception 'Membership not found'; end if;
  if target_mem.role = 'owner' then raise exception 'Owner access cannot be delegated or modified'; end if;

  upd_role := lower(coalesce(p_new_role, target_mem.role));
  if upd_role not in ('manager','employee','supplier') then
    raise exception 'Role must be manager, employee, or supplier';
  end if;
  if target_mem.branch_id is null then raise exception 'An assigned branch is required'; end if;

  upd_perms := public.erp_sanitize_permissions(
    upd_role,
    case when p_permissions is null then target_mem.permissions else p_permissions end
  );

  update public.erp_memberships
  set role = upd_role,
      permissions = upd_perms,
      data_scope = 'assigned_branch',
      selected_branch_ids = '{}'::uuid[],
      updated_at = now()
  where id = p_membership_id;

  update public.profiles
  set role = upd_role,
      permissions = upd_perms,
      restaurant_id = target_mem.restaurant_id,
      organization_id = target_mem.restaurant_id,
      branch_id = target_mem.branch_id,
      updated_date = now()
  where id = target_mem.user_id;

  update public.branch_assignments
  set role = upd_role, active = (target_mem.status = 'approved'), updated_at = now()
  where user_id = target_mem.user_id and restaurant_id = actor_mem.restaurant_id;

  insert into public.permission_audit_log (
    restaurant_id, target_user_id, target_email, target_name,
    owner_user_id, owner_email, action, old_role, new_role,
    old_permissions, new_permissions, notes
  ) values (
    actor_mem.restaurant_id, target_mem.user_id, target_mem.email, target_mem.full_name,
    actor_mem.user_id, actor_mem.email, p_action, target_mem.role, upd_role,
    target_mem.permissions, upd_perms, p_notes
  );

  return jsonb_build_object(
    'success', true, 'membership_id', p_membership_id,
    'role', upd_role, 'permissions', upd_perms, 'data_scope', 'assigned_branch'
  );
end;
$$;

create or replace function public.toggle_user_status(
  p_membership_id uuid,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_mem public.erp_memberships;
  target_mem public.erp_memberships;
begin
  select * into actor_mem from public.erp_memberships
  where user_id = auth.uid() and role = 'owner' and status = 'approved' limit 1;
  if actor_mem.id is null then raise exception using errcode='42501', message='OWNER_ACCESS_REQUIRED'; end if;

  select * into target_mem from public.erp_memberships
  where id = p_membership_id and restaurant_id = actor_mem.restaurant_id for update;
  if target_mem.id is null then raise exception 'Membership not found'; end if;
  if target_mem.role = 'owner' then raise exception 'Owner status cannot be modified'; end if;
  if p_status not in ('approved','suspended') then raise exception 'Status must be approved or suspended'; end if;

  update public.erp_memberships set status=p_status, updated_at=now() where id=p_membership_id;
  update public.profiles
    set approval_status=p_status, is_active=(p_status='approved'),
        archived_at=case when p_status='approved' then null else archived_at end,
        updated_date=now()
    where id=target_mem.user_id;
  update public.branch_assignments
    set active=(p_status='approved'), updated_at=now()
    where user_id=target_mem.user_id and restaurant_id=actor_mem.restaurant_id;
  if target_mem.role='employee' and target_mem.linked_entity_id is not null then
    update public.employees set is_active=(p_status='approved'), status=case when p_status='approved' then 'active' else 'inactive' end, updated_date=now()
    where id=target_mem.linked_entity_id and restaurant_id=actor_mem.restaurant_id;
  elsif target_mem.role='supplier' and target_mem.linked_entity_id is not null then
    update public.suppliers set status=(p_status='approved'), updated_date=now()
    where id=target_mem.linked_entity_id and restaurant_id=actor_mem.restaurant_id;
  end if;

  insert into public.permission_audit_log (
    restaurant_id,target_user_id,target_email,target_name,owner_user_id,owner_email,action,notes
  ) values (
    actor_mem.restaurant_id,target_mem.user_id,target_mem.email,target_mem.full_name,
    actor_mem.user_id,actor_mem.email,'status_change',coalesce(p_notes,'Status changed to '||p_status)
  );
  return jsonb_build_object('success',true,'new_status',p_status);
end;
$$;

create or replace function public.transfer_user_branch(
  p_membership_id uuid,
  p_new_branch_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_mem public.erp_memberships;
  target_mem public.erp_memberships;
  target_branch public.branches;
begin
  select * into actor_mem from public.erp_memberships
  where user_id=auth.uid() and role='owner' and status='approved' limit 1;
  if actor_mem.id is null then raise exception using errcode='42501', message='OWNER_ACCESS_REQUIRED'; end if;
  select * into target_mem from public.erp_memberships
  where id=p_membership_id and restaurant_id=actor_mem.restaurant_id for update;
  if target_mem.id is null then raise exception 'Membership not found'; end if;
  if target_mem.role='owner' then raise exception 'Owner branch scope cannot be modified'; end if;
  select * into target_branch from public.branches
  where id=p_new_branch_id and restaurant_id=actor_mem.restaurant_id and coalesce(is_active,true);
  if target_branch.id is null then raise exception 'Active branch not found in this store'; end if;

  update public.erp_memberships set branch_id=p_new_branch_id, data_scope='assigned_branch', selected_branch_ids='{}', updated_at=now()
  where id=p_membership_id;
  update public.profiles set branch_id=p_new_branch_id, branch=target_branch.branch_key, updated_date=now()
  where id=target_mem.user_id;
  update public.branch_assignments set active=false, is_primary=false, updated_at=now()
  where user_id=target_mem.user_id and restaurant_id=actor_mem.restaurant_id;
  insert into public.branch_assignments (
    user_id,restaurant_id,organization_id,branch_id,role,is_primary,assigned_by,active,created_at,updated_at
  ) values (
    target_mem.user_id,actor_mem.restaurant_id,actor_mem.restaurant_id,p_new_branch_id,target_mem.role,true,auth.uid(),true,now(),now()
  ) on conflict (user_id,branch_id) do update set
    restaurant_id=excluded.restaurant_id, organization_id=excluded.organization_id,
    role=excluded.role, is_primary=true, assigned_by=excluded.assigned_by,
    active=true, updated_at=now();
  if target_mem.role='employee' and target_mem.linked_entity_id is not null then
    update public.employees set branch_id=p_new_branch_id, branch=target_branch.branch_key, updated_date=now()
    where id=target_mem.linked_entity_id and restaurant_id=actor_mem.restaurant_id;
  elsif target_mem.role='supplier' and target_mem.linked_entity_id is not null then
    update public.suppliers set branch_id=p_new_branch_id, updated_date=now()
    where id=target_mem.linked_entity_id and restaurant_id=actor_mem.restaurant_id;
  end if;
  insert into public.permission_audit_log (
    restaurant_id,target_user_id,target_email,target_name,owner_user_id,owner_email,action,notes
  ) values (
    actor_mem.restaurant_id,target_mem.user_id,target_mem.email,target_mem.full_name,
    actor_mem.user_id,actor_mem.email,'transfer',coalesce(p_notes,'Transferred to '||target_branch.name)
  );
  return jsonb_build_object('success',true,'new_branch_id',p_new_branch_id,'branch_name',target_branch.name);
end;
$$;

-- Preserve identity and audit history. "Remove" revokes portal access instead
-- of deleting the canonical membership row.
create or replace function public.remove_user_from_org(
  p_membership_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  actor_mem public.erp_memberships;
  target_mem public.erp_memberships;
begin
  select * into actor_mem from public.erp_memberships
  where user_id=auth.uid() and role='owner' and status='approved' limit 1;
  if actor_mem.id is null then raise exception using errcode='42501', message='OWNER_ACCESS_REQUIRED'; end if;
  select * into target_mem from public.erp_memberships
  where id=p_membership_id and restaurant_id=actor_mem.restaurant_id for update;
  if target_mem.id is null then raise exception 'Membership not found'; end if;
  if target_mem.role='owner' then raise exception 'Owner membership cannot be removed'; end if;

  update public.erp_memberships
  set status='suspended',
      registration_data=coalesce(registration_data,'{}'::jsonb)||jsonb_build_object('removed_at',now(),'removed_by',auth.uid()),
      updated_at=now()
  where id=p_membership_id;
  update public.profiles set approval_status='suspended',is_active=false,archived_at=now(),updated_date=now()
  where id=target_mem.user_id;
  update public.branch_assignments set active=false,is_primary=false,updated_at=now()
  where user_id=target_mem.user_id and restaurant_id=actor_mem.restaurant_id;
  if target_mem.role='employee' and target_mem.linked_entity_id is not null then
    update public.employees set is_active=false,status='inactive',updated_date=now()
    where id=target_mem.linked_entity_id and restaurant_id=actor_mem.restaurant_id;
  elsif target_mem.role='supplier' and target_mem.linked_entity_id is not null then
    update public.suppliers set status=false,updated_date=now()
    where id=target_mem.linked_entity_id and restaurant_id=actor_mem.restaurant_id;
  end if;
  insert into public.permission_audit_log (
    restaurant_id,target_user_id,target_email,target_name,owner_user_id,owner_email,action,notes
  ) values (
    actor_mem.restaurant_id,target_mem.user_id,target_mem.email,target_mem.full_name,
    actor_mem.user_id,actor_mem.email,'remove_user',coalesce(p_notes,'Portal access revoked; history preserved')
  );
  return jsonb_build_object('success',true,'status','suspended','history_preserved',true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Module-scoped RLS writes
-- ---------------------------------------------------------------------------

create or replace function public.erp_can_access_scope_text(
  p_restaurant_id text,
  p_branch_id text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.erp_memberships m
    where m.user_id=auth.uid()
      and m.status='approved'
      and m.restaurant_id::text=nullif(p_restaurant_id,'')
      and (
        m.role='owner'
        or (nullif(p_branch_id,'') is not null and m.branch_id::text=nullif(p_branch_id,''))
      )
  ) and exists (
    select 1 from public.subscriptions s
    where s.restaurant_id::text=nullif(p_restaurant_id,'')
      and public.erp_subscription_has_erp_access(s.restaurant_id)
  );
$$;

-- Legacy generic write policies are deliberately fail-closed for non-owners.
-- Every staff write below pairs scope with a module-specific permission.
create or replace function public.erp_can_write_scope_text(
  p_restaurant_id text,
  p_branch_id text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.erp_can_access_scope_text(p_restaurant_id,p_branch_id)
    and exists (
      select 1 from public.erp_memberships m
      where m.user_id=auth.uid() and m.status='approved' and m.role='owner'
        and m.restaurant_id::text=nullif(p_restaurant_id,'')
    );
$$;

create or replace function public.erp_can_write_module_scope_text(
  p_restaurant_id text,
  p_branch_id text,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.erp_can_access_scope_text(p_restaurant_id,p_branch_id)
     and public.erp_has_permission(p_permission);
$$;

-- Sales
drop policy if exists erp_scope_insert on public.daily_sales;
drop policy if exists erp_scope_update on public.daily_sales;
drop policy if exists erp_scope_delete on public.daily_sales;
create policy erp_scope_insert on public.daily_sales for insert to authenticated
with check (public.erp_can_write_module_scope_text(coalesce(restaurant_id,''),coalesce(branch_id::text,''),'uploadSales'));
create policy erp_scope_update on public.daily_sales for update to authenticated
using (public.erp_can_write_module_scope_text(coalesce(restaurant_id,''),coalesce(branch_id::text,''),'uploadSales'))
with check (public.erp_can_write_module_scope_text(coalesce(restaurant_id,''),coalesce(branch_id::text,''),'uploadSales'));
create policy erp_scope_delete on public.daily_sales for delete to authenticated
using (public.erp_can_write_scope_text(coalesce(restaurant_id,''),coalesce(branch_id::text,'')));

drop policy if exists erp_scope_insert on public.sales_invoices;
drop policy if exists erp_scope_update on public.sales_invoices;
drop policy if exists erp_scope_delete on public.sales_invoices;
drop policy if exists supplier_invoices_insert on public.sales_invoices;
drop policy if exists supplier_invoices_update on public.sales_invoices;
create policy erp_scope_insert on public.sales_invoices for insert to authenticated
with check (
  public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'uploadSales')
  and nullif(created_by,'') in (coalesce(auth.jwt()->>'email',''),coalesce(auth.jwt()->>'phone',''))
);
create policy erp_scope_update on public.sales_invoices for update to authenticated
using (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'uploadSales'))
with check (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'uploadSales'));
create policy erp_scope_delete on public.sales_invoices for delete to authenticated
using (public.erp_can_write_scope_text(restaurant_id::text,branch_id::text));

-- Purchases and supplier workflow
drop policy if exists erp_scope_insert on public.purchases;
drop policy if exists erp_scope_update on public.purchases;
drop policy if exists erp_scope_delete on public.purchases;
create policy erp_scope_insert on public.purchases for insert to authenticated
with check (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'createPurchases'));
create policy erp_scope_update on public.purchases for update to authenticated
using (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'createPurchases'))
with check (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'createPurchases'));
create policy erp_scope_delete on public.purchases for delete to authenticated
using (public.erp_can_write_scope_text(restaurant_id::text,branch_id::text));

drop policy if exists erp_scope_insert on public.purchase_orders;
drop policy if exists erp_scope_update on public.purchase_orders;
drop policy if exists erp_scope_delete on public.purchase_orders;
drop policy if exists supplier_purchase_orders_update on public.purchase_orders;
create policy erp_scope_insert on public.purchase_orders for insert to authenticated
with check (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'createPurchases'));
create policy erp_scope_update on public.purchase_orders for update to authenticated
using (
  public.erp_can_access_scope_text(restaurant_id::text,branch_id::text)
  and (
    public.erp_has_any_permission(array['createPurchases','approvePurchases'])
    or (public.erp_has_permission('updatePurchaseOrders') and supplier_id=public.erp_current_linked_entity_id())
  )
)
with check (
  public.erp_can_access_scope_text(restaurant_id::text,branch_id::text)
  and (
    public.erp_has_any_permission(array['createPurchases','approvePurchases'])
    or (public.erp_has_permission('updatePurchaseOrders') and supplier_id=public.erp_current_linked_entity_id())
  )
);
create policy erp_scope_delete on public.purchase_orders for delete to authenticated
using (public.erp_can_write_scope_text(restaurant_id::text,branch_id::text));

drop policy if exists erp_scope_select on public.supplier_invoices;
drop policy if exists supplier_invoices_supplier_self_select on public.supplier_invoices;
drop policy if exists erp_scope_insert on public.supplier_invoices;
drop policy if exists erp_scope_update on public.supplier_invoices;
drop policy if exists erp_scope_delete on public.supplier_invoices;
create policy erp_scope_select on public.supplier_invoices for select to authenticated
using (
  public.erp_can_access_scope_text(restaurant_id::text,branch_id::text)
  and (
    public.erp_has_permission('viewPurchases')
    or (public.erp_has_permission('viewInvoices') and supplier_id=public.erp_current_linked_entity_id())
  )
);
create policy erp_scope_insert on public.supplier_invoices for insert to authenticated
with check (
  public.erp_can_access_scope_text(restaurant_id::text,branch_id::text)
  and (
    public.erp_has_permission('createPurchases')
    or (public.erp_has_permission('createInvoices') and supplier_id=public.erp_current_linked_entity_id())
  )
);
create policy erp_scope_update on public.supplier_invoices for update to authenticated
using (
  public.erp_can_access_scope_text(restaurant_id::text,branch_id::text)
  and (
    public.erp_has_any_permission(array['createPurchases','approvePurchases'])
    or (public.erp_has_permission('createInvoices') and supplier_id=public.erp_current_linked_entity_id())
  )
)
with check (
  public.erp_can_access_scope_text(restaurant_id::text,branch_id::text)
  and (
    public.erp_has_any_permission(array['createPurchases','approvePurchases'])
    or (public.erp_has_permission('createInvoices') and supplier_id=public.erp_current_linked_entity_id())
  )
);
create policy erp_scope_delete on public.supplier_invoices for delete to authenticated
using (public.erp_can_write_scope_text(restaurant_id::text,branch_id::text));

-- Expenses
drop policy if exists erp_scope_insert on public.expenses;
drop policy if exists erp_scope_update on public.expenses;
drop policy if exists erp_scope_delete on public.expenses;
create policy erp_scope_insert on public.expenses for insert to authenticated
with check (
  public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'createExpenses')
);
create policy erp_scope_update on public.expenses for update to authenticated
using (
  public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'createExpenses')
)
with check (
  public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'createExpenses')
);
create policy erp_scope_delete on public.expenses for delete to authenticated
using (public.erp_can_write_scope_text(restaurant_id::text,branch_id::text));

-- Inventory and products
drop policy if exists inventory_org_isolation on public.inventory;
drop policy if exists erp_scope_insert on public.inventory;
drop policy if exists erp_scope_update on public.inventory;
drop policy if exists erp_scope_delete on public.inventory;
create policy erp_scope_insert on public.inventory for insert to authenticated
with check (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'updateInventory'));
create policy erp_scope_update on public.inventory for update to authenticated
using (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'updateInventory'))
with check (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'updateInventory'));
create policy erp_scope_delete on public.inventory for delete to authenticated
using (public.erp_can_write_scope_text(restaurant_id::text,branch_id::text));

drop policy if exists erp_scope_insert on public.inventory_transactions;
drop policy if exists erp_scope_update on public.inventory_transactions;
drop policy if exists erp_scope_delete on public.inventory_transactions;
create policy erp_scope_insert on public.inventory_transactions for insert to authenticated
with check (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'updateInventory'));
create policy erp_scope_update on public.inventory_transactions for update to authenticated
using (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'updateInventory'))
with check (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'updateInventory'));
create policy erp_scope_delete on public.inventory_transactions for delete to authenticated
using (public.erp_can_write_scope_text(restaurant_id::text,branch_id::text));

drop policy if exists supplier_products_insert on public.products;
drop policy if exists supplier_products_update on public.products;
drop policy if exists erp_scope_insert on public.products;
drop policy if exists erp_scope_update on public.products;
drop policy if exists erp_scope_delete on public.products;
create policy erp_scope_insert on public.products for insert to authenticated
with check (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'updateInventory'));
create policy erp_scope_update on public.products for update to authenticated
using (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'updateInventory'))
with check (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'updateInventory'));
create policy erp_scope_delete on public.products for delete to authenticated
using (public.erp_can_write_scope_text(restaurant_id::text,branch_id::text));

-- People
drop policy if exists employees_branch_isolation on public.employees;
drop policy if exists employees_org_isolation on public.employees;
drop policy if exists erp_scope_insert on public.employees;
drop policy if exists erp_scope_update on public.employees;
drop policy if exists erp_scope_delete on public.employees;
create policy erp_scope_insert on public.employees for insert to authenticated
with check (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'manageEmployees'));
create policy erp_scope_update on public.employees for update to authenticated
using (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'manageEmployees'))
with check (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'manageEmployees'));
create policy erp_scope_delete on public.employees for delete to authenticated
using (public.erp_can_write_scope_text(restaurant_id::text,branch_id::text));

drop policy if exists erp_scope_insert on public.attendance;
drop policy if exists erp_scope_update on public.attendance;
drop policy if exists erp_scope_delete on public.attendance;
drop policy if exists employee_attendance_insert on public.attendance;
drop policy if exists employee_attendance_update on public.attendance;
create policy erp_scope_insert on public.attendance for insert to authenticated
with check (
  public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'recordAttendance')
  and (employee_id=public.erp_current_linked_entity_id() or public.erp_has_permission('manageEmployees'))
);
create policy erp_scope_update on public.attendance for update to authenticated
using (
  public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'recordAttendance')
  and (employee_id=public.erp_current_linked_entity_id() or public.erp_has_permission('manageEmployees'))
)
with check (
  public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'recordAttendance')
  and (employee_id=public.erp_current_linked_entity_id() or public.erp_has_permission('manageEmployees'))
);
create policy erp_scope_delete on public.attendance for delete to authenticated
using (public.erp_can_write_scope_text(restaurant_id::text,branch_id::text));

drop policy if exists erp_scope_insert on public.tasks;
drop policy if exists erp_scope_update on public.tasks;
drop policy if exists erp_scope_delete on public.tasks;
drop policy if exists employee_tasks_update on public.tasks;
create policy erp_scope_insert on public.tasks for insert to authenticated
with check (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'manageEmployees'));
create policy erp_scope_update on public.tasks for update to authenticated
using (
  public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'viewTasks')
  and (assigned_to=auth.uid()::text or public.erp_has_permission('manageEmployees'))
)
with check (
  public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'viewTasks')
  and (assigned_to=auth.uid()::text or public.erp_has_permission('manageEmployees'))
);
create policy erp_scope_delete on public.tasks for delete to authenticated
using (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'manageEmployees'));

-- Suppliers
drop policy if exists erp_scope_insert on public.suppliers;
drop policy if exists erp_scope_update on public.suppliers;
drop policy if exists erp_scope_delete on public.suppliers;
create policy erp_scope_insert on public.suppliers for insert to authenticated
with check (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'manageSuppliers'));
create policy erp_scope_update on public.suppliers for update to authenticated
using (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'manageSuppliers'))
with check (public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'manageSuppliers'));
create policy erp_scope_delete on public.suppliers for delete to authenticated
using (public.erp_can_write_scope_text(restaurant_id::text,branch_id::text));

-- ---------------------------------------------------------------------------
-- 5. Employee operational identity link
-- ---------------------------------------------------------------------------

create or replace function public.erp_link_employee_membership()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_employee_id uuid;
  v_branch_key text;
begin
  if new.role <> 'employee' or new.status <> 'approved' or new.linked_entity_id is not null
     or new.restaurant_id is null or new.branch_id is null then
    return new;
  end if;

  select e.id into v_employee_id
  from public.employees e
  where e.restaurant_id=new.restaurant_id
    and lower(coalesce(e.email,''))=lower(coalesce(new.email,''))
    and new.email is not null
  order by e.created_date asc limit 1;

  if v_employee_id is null then
    select branch_key into v_branch_key from public.branches where id=new.branch_id;
    insert into public.employees (
      restaurant_id,branch_id,full_name,email,phone,position,status,is_active,
      employee_id,branch,created_by,created_date,updated_date
    ) values (
      new.restaurant_id,new.branch_id,new.full_name,new.email,new.phone,'Employee','active',true,
      'EMP-'||upper(substr(replace(new.id::text,'-',''),1,8)),v_branch_key,
      new.email,now(),now()
    ) returning id into v_employee_id;
  end if;

  update public.erp_memberships set linked_entity_id=v_employee_id,updated_at=now() where id=new.id;
  return new;
end;
$$;

drop trigger if exists erp_link_employee_membership_trigger on public.erp_memberships;
create trigger erp_link_employee_membership_trigger
after insert or update of role,status,restaurant_id,branch_id,linked_entity_id
on public.erp_memberships
for each row execute function public.erp_link_employee_membership();

-- Link or create identities for already-approved employee memberships.
update public.erp_memberships m
set linked_entity_id = (
      select e.id from public.employees e
      where e.restaurant_id=m.restaurant_id
        and lower(coalesce(e.email,''))=lower(coalesce(m.email,''))
        and m.email is not null
      order by e.created_date asc limit 1
    ),
    updated_at=now()
where m.role='employee' and m.status='approved' and m.linked_entity_id is null
  and exists (
    select 1 from public.employees e
    where e.restaurant_id=m.restaurant_id
      and lower(coalesce(e.email,''))=lower(coalesce(m.email,''))
      and m.email is not null
  );

-- Trigger the linker for remaining approved employee memberships without
-- changing business data.
update public.erp_memberships
set updated_at=now()
where role='employee' and status='approved' and linked_entity_id is null;

-- ---------------------------------------------------------------------------
-- 6. RPC least privilege
-- ---------------------------------------------------------------------------

revoke all on function public.erp_sanitize_permissions(text,jsonb) from public, anon;
revoke all on function public.erp_effective_permissions(text,jsonb,jsonb) from public, anon;
revoke all on function public.erp_get_session_context() from public, anon;
revoke all on function public.erp_has_permission(text) from public, anon;
revoke all on function public.erp_has_any_permission(text[]) from public, anon;
revoke all on function public.erp_current_role() from public, anon;
revoke all on function public.erp_current_linked_entity_id() from public, anon;
revoke all on function public.erp_can_access_scope_text(text,text) from public, anon;
revoke all on function public.erp_can_write_scope_text(text,text) from public, anon;
revoke all on function public.erp_can_write_module_scope_text(text,text,text) from public, anon;
revoke all on function public.erp_get_authenticated_portal_identity(uuid) from public, anon;
revoke all on function public.update_user_role_and_permissions(uuid,text,jsonb,text,uuid[],text,text) from public, anon;
revoke all on function public.toggle_user_status(uuid,text,text) from public, anon;
revoke all on function public.transfer_user_branch(uuid,uuid,text) from public, anon;
revoke all on function public.remove_user_from_org(uuid,text) from public, anon;
revoke all on function public.create_erp_invitation(text,uuid,uuid,text,text,text,jsonb) from public, anon;
revoke all on function public.erp_link_employee_membership() from public, anon, authenticated;
revoke all on function public.erp_enforce_membership_contract() from public, anon, authenticated;

grant execute on function public.erp_sanitize_permissions(text,jsonb) to authenticated, service_role;
grant execute on function public.erp_effective_permissions(text,jsonb,jsonb) to authenticated, service_role;
grant execute on function public.erp_get_session_context() to authenticated, service_role;
grant execute on function public.erp_has_permission(text) to authenticated, service_role;
grant execute on function public.erp_has_any_permission(text[]) to authenticated, service_role;
grant execute on function public.erp_current_role() to authenticated, service_role;
grant execute on function public.erp_current_linked_entity_id() to authenticated, service_role;
grant execute on function public.erp_can_access_scope_text(text,text) to authenticated, service_role;
grant execute on function public.erp_can_write_scope_text(text,text) to authenticated, service_role;
grant execute on function public.erp_can_write_module_scope_text(text,text,text) to authenticated, service_role;
grant execute on function public.erp_get_authenticated_portal_identity(uuid) to authenticated, service_role;
grant execute on function public.update_user_role_and_permissions(uuid,text,jsonb,text,uuid[],text,text) to authenticated, service_role;
grant execute on function public.toggle_user_status(uuid,text,text) to authenticated, service_role;
grant execute on function public.transfer_user_branch(uuid,uuid,text) to authenticated, service_role;
grant execute on function public.remove_user_from_org(uuid,text) to authenticated, service_role;
grant execute on function public.create_erp_invitation(text,uuid,uuid,text,text,text,jsonb) to authenticated, service_role;
grant execute on function public.erp_link_employee_membership() to service_role;
grant execute on function public.erp_enforce_membership_contract() to service_role;

commit;
