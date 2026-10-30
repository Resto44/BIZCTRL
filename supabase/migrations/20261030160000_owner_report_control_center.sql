-- Owner report control center: additive, no delivery/cron re-enrollment.
-- Deploy before the UI and updated automatic-report-email worker.
alter table public.organization_report_email
 add column report_language text not null default 'en'
  check (report_language in ('en','ar','fa')),
 add column report_branch_id uuid references public.branches(id) on delete set null;

grant update(report_language,report_branch_id)
 on public.organization_report_email to authenticated;

-- Make it impossible to select a branch belonging to another organization.
create function report_email_private.validate_owner_settings()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if NEW.report_branch_id is not null and not exists (
  select 1 from public.branches b
   where b.id=NEW.report_branch_id and b.restaurant_id=NEW.restaurant_id
 ) then
  raise exception 'REPORT_BRANCH_NOT_IN_ORGANIZATION' using errcode='42501';
 end if;
 return NEW;
end $$;
revoke all on function report_email_private.validate_owner_settings() from public,anon,authenticated;
create trigger report_owner_settings_validate
 before update of report_branch_id on public.organization_report_email
 for each row execute function report_email_private.validate_owner_settings();

create table public.organization_report_email_audit (
 id bigint generated always as identity primary key,
 restaurant_id uuid not null references public.organization_report_email(restaurant_id) on delete cascade,
 actor_user_id uuid not null,
 changed_at timestamptz not null default now(),
 changes jsonb not null
);
create index organization_report_email_audit_latest
 on public.organization_report_email_audit(restaurant_id,changed_at desc);
alter table public.organization_report_email_audit enable row level security;
revoke all on public.organization_report_email_audit from public,anon,authenticated;
grant select on public.organization_report_email_audit to authenticated;
grant all on public.organization_report_email_audit to service_role;

create policy organization_report_email_audit_owner_read
 on public.organization_report_email_audit for select to authenticated
 using (exists (
  select 1 from public.organization_report_email s
  join public.erp_memberships m on m.restaurant_id=s.restaurant_id
   and m.user_id=(select auth.uid()) and m.role='owner' and m.status='approved'
  where s.restaurant_id=organization_report_email_audit.restaurant_id
   and s.owner_user_id=(select auth.uid())
 ));

create function report_email_private.audit_owner_settings()
returns trigger language plpgsql security definer set search_path='' as $$
declare changes jsonb:='{}'::jsonb; who uuid:=auth.uid();
begin
 if OLD.enabled is distinct from NEW.enabled then
  changes:=changes||jsonb_build_object('enabled',jsonb_build_array(OLD.enabled,NEW.enabled));
 end if;
 if OLD.report_language is distinct from NEW.report_language then
  changes:=changes||jsonb_build_object('language',jsonb_build_array(OLD.report_language,NEW.report_language));
 end if;
 if OLD.report_branch_id is distinct from NEW.report_branch_id then
  changes:=changes||jsonb_build_object('branch_id',jsonb_build_array(OLD.report_branch_id,NEW.report_branch_id));
 end if;
 if who is not null and changes<>'{}'::jsonb then
  insert into public.organization_report_email_audit(restaurant_id,actor_user_id,changes)
  values(NEW.restaurant_id,who,changes);
 end if;
 return NEW;
end $$;
revoke all on function report_email_private.audit_owner_settings() from public,anon,authenticated;
create trigger report_owner_settings_audit
 after update of enabled,report_language,report_branch_id on public.organization_report_email
 for each row execute function report_email_private.audit_owner_settings();

-- Return only display-safe delivery metadata, never an attachment, email or payload.
create function public.erp_owner_report_history(p_restaurant_id uuid,p_limit integer default 7)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if (select auth.uid()) is null or not exists (
  select 1 from public.organization_report_email s
  join public.erp_memberships m on m.restaurant_id=s.restaurant_id
   and m.user_id=(select auth.uid()) and m.role='owner' and m.status='approved'
  where s.restaurant_id=p_restaurant_id and s.owner_user_id=(select auth.uid())
 ) then
  raise exception 'REPORT_HISTORY_FORBIDDEN' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) into result from (
  select report_date,state,attempts,created_at,provider_id,last_error
  from public.report_email_deliveries
  where restaurant_id=p_restaurant_id
   and report_date >= (now() at time zone 'Asia/Riyadh')::date - (least(greatest(coalesce(p_limit,7),1),30)-1)
  order by report_date desc limit 30
 ) d;
 return result;
end $$;
revoke all on function public.erp_owner_report_history(uuid,integer) from public,anon,authenticated;
grant execute on function public.erp_owner_report_history(uuid,integer) to authenticated;

-- Provider "accepted" does NOT mean inbox delivery.
-- Audit is owner-only and intentionally excludes recipient address and PDF data.
create function public.erp_owner_report_audit(p_restaurant_id uuid,p_limit integer default 10)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if (select auth.uid()) is null or not exists (
  select 1 from public.organization_report_email s
  join public.erp_memberships m on m.restaurant_id=s.restaurant_id
   and m.user_id=(select auth.uid()) and m.role='owner' and m.status='approved'
  where s.restaurant_id=p_restaurant_id and s.owner_user_id=(select auth.uid())
 ) then
  raise exception 'REPORT_AUDIT_FORBIDDEN' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) into result from (
  select actor_user_id,changed_at,changes
  from public.organization_report_email_audit where restaurant_id=p_restaurant_id
  order by changed_at desc limit least(greatest(coalesce(p_limit,10),1),30)
 ) a;
 return result;
end $$;
revoke all on function public.erp_owner_report_audit(uuid,integer) from public,anon,authenticated;
grant execute on function public.erp_owner_report_audit(uuid,integer) to authenticated;

-- Keep the existing lease-locked security model; add the saved owner scope.
create or replace function public.report_email_context(p_delivery uuid,p_lease uuid,p_stock boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.report_email_deliveries; s public.organization_report_email; result jsonb; old_claims text; old_sub text;
begin
 select * into d from public.report_email_deliveries where id=p_delivery and lease=p_lease and state='sending' and available_at>now();
 if d.id is null or not report_email_private.eligible(d.restaurant_id) then raise exception 'REPORT_DELIVERY_DENIED' using errcode='42501'; end if;
 select * into s from public.organization_report_email where restaurant_id=d.restaurant_id;
 select jsonb_build_object('email',u.email,'restaurant_id',r.id,'name',r.name,'currency',r.currency,'language',s.report_language,'branch_id',s.report_branch_id)
 into result from auth.users u join public.restaurants r on r.id=d.restaurant_id where u.id=s.owner_user_id;
 if p_stock then
  old_claims:=current_setting('request.jwt.claims',true); old_sub:=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',s.owner_user_id,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',s.owner_user_id::text,true);
  result:=result||jsonb_build_object('inventoryTransactions',erp_report_private.stock_consumption(d.restaurant_id,s.report_branch_id,d.report_date,d.report_date));
  perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 end if;
 return result;
end $$;
revoke all on function public.report_email_context(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.report_email_context(uuid,uuid,boolean) to service_role;


