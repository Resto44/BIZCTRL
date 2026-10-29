begin;
-- Preparation only: no tax rates, payment behavior, or authority submissions change.
create schema if not exists pos_tax_private;
revoke all on schema pos_tax_private from public, anon, authenticated;
create table pos_tax_private.profiles (
 branch_id uuid primary key references public.branches(id),
 restaurant_id uuid not null references public.restaurants(id),
 country_code text not null check(country_code ~ '^[A-Z]{2}$'),
 legal_name text not null check(length(btrim(legal_name)) between 1 and 200),
 registration_status text not null check(registration_status in ('unknown','registered','not_registered')),
 registration_number text not null default '' check(length(registration_number)<=40),
 mode text not null default 'disabled' check(mode in ('disabled','shadow')),
 version integer not null default 1,
 updated_by uuid not null, updated_at timestamptz not null default now(),
 check(registration_status<>'registered' or length(btrim(registration_number))>0)
);
create index pos_tax_profiles_tenant on pos_tax_private.profiles(restaurant_id);
create table pos_tax_private.observations (
 order_id uuid primary key references restaurant_pos_private.orders(id),
 restaurant_id uuid not null references public.restaurants(id),
 branch_id uuid not null references public.branches(id),
 profile_snapshot jsonb not null,
 lines_snapshot jsonb not null,
 totals_snapshot jsonb not null,
 authority_status text not null default 'not_submitted' check(authority_status='not_submitted'),
 recorded_at timestamptz not null default now()
);
create index pos_tax_observations_scope on pos_tax_private.observations(restaurant_id,branch_id,recorded_at desc);
alter table pos_tax_private.profiles enable row level security;
alter table pos_tax_private.observations enable row level security;
revoke all on all tables in schema pos_tax_private from public, anon, authenticated;

-- Definer needed for private tables. Every RPC verifies membership and branch ownership.
create function pos_tax_private.settings(r uuid,b uuid,p jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare profile pos_tax_private.profiles; expected_version integer;
begin
 perform restaurant_pos_private.guard(r,b,'manageSettings',true);
 if b is null or not exists(select 1 from public.erp_memberships
   where restaurant_id=r and user_id=auth.uid() and status='approved' and role='owner') then
  raise exception 'Only the business owner can manage branch tax settings.' using errcode='42501';
 end if;
 -- Serialize create as well as update; optimistic version rejects stale browser saves.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(b::text,0));
 select * into profile from pos_tax_private.profiles where branch_id=b;
 if p is not null then
  if jsonb_typeof(p)<>'object' or exists(select 1 from jsonb_object_keys(p) k
    where k not in ('country_code','legal_name','registration_status','registration_number','mode','version')) then
   raise exception 'Unsupported tax setting.' using errcode='23514';
  end if;
  expected_version:=(p->>'version')::integer;
  if expected_version is distinct from coalesce(profile.version,0) then
   raise exception 'Tax settings changed. Reload before saving.' using errcode='40001';
  end if;
  insert into pos_tax_private.profiles(branch_id,restaurant_id,country_code,legal_name,registration_status,registration_number,mode,updated_by)
  values(b,r,upper(btrim(p->>'country_code')),btrim(p->>'legal_name'),p->>'registration_status',btrim(coalesce(p->>'registration_number','')),p->>'mode',auth.uid())
  on conflict(branch_id) do update set country_code=excluded.country_code,legal_name=excluded.legal_name,
   registration_status=excluded.registration_status,registration_number=excluded.registration_number,mode=excluded.mode,
   version=pos_tax_private.profiles.version+1,updated_by=auth.uid(),updated_at=now()
  returning * into profile;
 end if;
 return jsonb_build_object('profile',case when profile.branch_id is null then null else to_jsonb(profile) end,
  'authority_status','not_connected','live_supported',false,
  'menu_review',jsonb_build_object('active_count',(select count(*) from restaurant_pos_private.menu where restaurant_id=r and branch_id=b and active),
   'zero_rate_count',(select count(*) from restaurant_pos_private.menu where restaurant_id=r and branch_id=b and active and tax_rate=0)),
  'observations',coalesce((select jsonb_agg(to_jsonb(x)) from (select order_id,recorded_at,totals_snapshot,authority_status
   from pos_tax_private.observations where restaurant_id=r and branch_id=b order by recorded_at desc limit 20) x),'[]'::jsonb));
end $$;

create function pos_tax_private.observe_payment() returns trigger
language plpgsql security definer set search_path='' as $$
declare profile pos_tax_private.profiles;
begin
 if new.status<>'paid' or old.status='paid' then return new; end if;
 select p.* into profile from pos_tax_private.profiles p
 join restaurant_pos_private.terminals d on d.branch_id=p.branch_id and d.restaurant_id=p.restaurant_id
 where d.id=new.device_id;
 if profile.mode='shadow' then
  insert into pos_tax_private.observations(order_id,restaurant_id,branch_id,profile_snapshot,lines_snapshot,totals_snapshot)
  values(new.id,profile.restaurant_id,profile.branch_id,to_jsonb(profile),new.lines,
   jsonb_build_object('subtotal',new.subtotal,'tax_total',new.tax_total,'net_total',new.net_total,'pricing','inclusive'))
  on conflict(order_id) do nothing;
 end if;
 return new;
end $$;
create trigger pos_tax_observe_payment after update of status on restaurant_pos_private.orders
 for each row execute function pos_tax_private.observe_payment();

create function public.erp_restaurant_tax_settings(p_restaurant_id uuid,p_branch_id uuid,p_profile jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$
 select pos_tax_private.settings(p_restaurant_id,p_branch_id,p_profile)
$$;
revoke all on all functions in schema pos_tax_private from public,anon,authenticated;
revoke all on function public.erp_restaurant_tax_settings(uuid,uuid,jsonb) from public,anon;
grant usage on schema pos_tax_private to authenticated;
grant execute on function pos_tax_private.settings(uuid,uuid,jsonb) to authenticated;
grant execute on function public.erp_restaurant_tax_settings(uuid,uuid,jsonb) to authenticated;
commit;
