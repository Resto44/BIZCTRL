begin;

create table if not exists public.role_templates (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  base_role text not null default 'manager'
    check (base_role in ('manager','employee','supplier')),
  permissions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(permissions) = 'object'),
  description text,
  is_system boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name)
);

create index if not exists role_templates_restaurant_id_idx
  on public.role_templates (restaurant_id);

alter table public.role_templates enable row level security;

drop policy if exists role_templates_owner_manage
  on public.role_templates;
create policy role_templates_owner_manage
on public.role_templates
for all
to authenticated
using (public.erp_is_approved_owner(restaurant_id))
with check (
  public.erp_is_approved_owner(restaurant_id)
  and base_role in ('manager','employee','supplier')
  and jsonb_typeof(permissions) = 'object'
);

revoke all on table public.role_templates from public, anon;
grant select, insert, update, delete on table public.role_templates to authenticated;
grant all on table public.role_templates to service_role;

create or replace function public.clone_role_template(
  p_template_id uuid,
  p_new_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $function$
declare
  actor_membership public.erp_memberships;
  source_template public.role_templates;
  clean_name text;
  new_template_id uuid;
begin
  clean_name := nullif(btrim(p_new_name), '');
  if clean_name is null or length(clean_name) > 100 then
    raise exception using errcode = '22023', message = 'Template name must be between 1 and 100 characters';
  end if;

  select membership.* into actor_membership
  from public.erp_memberships membership
  where membership.user_id = auth.uid()
    and membership.role = 'owner'
    and membership.status = 'approved'
  limit 1;

  if actor_membership.id is null then
    raise exception using errcode = '42501', message = 'OWNER_ACCESS_REQUIRED';
  end if;

  select template.* into source_template
  from public.role_templates template
  where template.id = p_template_id
    and template.restaurant_id = actor_membership.restaurant_id;

  if source_template.id is null then
    raise exception using errcode = 'P0002', message = 'Role template not found in this store';
  end if;

  insert into public.role_templates (
    restaurant_id,
    name,
    base_role,
    permissions,
    description,
    is_system,
    created_by
  ) values (
    actor_membership.restaurant_id,
    clean_name,
    source_template.base_role,
    public.erp_sanitize_permissions(source_template.base_role, source_template.permissions),
    'Cloned from: ' || source_template.name,
    false,
    auth.uid()
  )
  returning id into new_template_id;

  return jsonb_build_object(
    'success', true,
    'new_id', new_template_id,
    'restaurant_id', actor_membership.restaurant_id
  );
end;
$function$;

revoke all on function public.clone_role_template(uuid,text)
  from public, anon;
grant execute on function public.clone_role_template(uuid,text)
  to authenticated, service_role;

commit;
