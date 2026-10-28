-- New organizations only. Existing manually saved report recipients are not enrolled.
create schema if not exists report_email_private;
revoke all on schema report_email_private from public, anon, authenticated;

create table public.organization_report_email (
 restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 last_accepted_at timestamptz,
 last_report_date date
);
alter table public.organization_report_email enable row level security;
revoke all on public.organization_report_email from anon, authenticated;
grant select on public.organization_report_email to authenticated;
grant update(enabled) on public.organization_report_email to authenticated;
grant all on public.organization_report_email to service_role;
create policy owner_report_read on public.organization_report_email for select to authenticated
 using (owner_user_id=(select auth.uid()) and exists(select 1 from public.erp_memberships m where m.user_id=(select auth.uid()) and m.restaurant_id=organization_report_email.restaurant_id and m.role='owner' and m.status='approved'));
create policy owner_report_pause on public.organization_report_email for update to authenticated
 using (owner_user_id=(select auth.uid()) and exists(select 1 from public.erp_memberships m where m.user_id=(select auth.uid()) and m.restaurant_id=organization_report_email.restaurant_id and m.role='owner' and m.status='approved'))
 with check (owner_user_id=(select auth.uid()) and exists(select 1 from public.erp_memberships m where m.user_id=(select auth.uid()) and m.restaurant_id=organization_report_email.restaurant_id and m.role='owner' and m.status='approved'));

create table public.report_email_deliveries (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.organization_report_email(restaurant_id) on delete cascade,
 report_date date not null,
 state text not null default 'pending' check(state in ('pending','sending','accepted','failed','cancelled')),
 attempts integer not null default 0,
 available_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 lease uuid,
 payload jsonb,
 provider_id text,
 last_error text,
 unique(restaurant_id,report_date)
);
alter table public.report_email_deliveries enable row level security;
revoke all on public.report_email_deliveries from public,anon,authenticated;
grant all on public.report_email_deliveries to service_role;
create index report_email_delivery_due on public.report_email_deliveries(available_at) where state in ('pending','sending');

create function report_email_private.enroll() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Membership is authoritative; tenant_id identifies the original registering owner.
 if NEW.role='owner' and NEW.status='approved' and exists(
  select 1 from public.restaurants r where r.id=NEW.restaurant_id and r.tenant_id=NEW.user_id::text
 ) then
  insert into public.organization_report_email(restaurant_id,owner_user_id)
  values(NEW.restaurant_id,NEW.user_id) on conflict do nothing;
 end if;
 return NEW;
end $$;
revoke all on function report_email_private.enroll() from public,anon,authenticated;
create trigger enroll_new_owner_report after insert on public.erp_memberships for each row execute function report_email_private.enroll();

-- Resolve the current verified identity, never an editable recipient or auth metadata.
create function report_email_private.eligible(p_restaurant uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_report_email s
 join auth.users u on u.id=s.owner_user_id
 join public.restaurants r on r.id=s.restaurant_id
 join public.erp_memberships m on m.restaurant_id=s.restaurant_id and m.user_id=s.owner_user_id
 where s.restaurant_id=p_restaurant and s.enabled and r.is_active is not false
 and m.role='owner' and m.status='approved' and u.email_confirmed_at is not null
 and nullif(u.email,'') is not null and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<now())
 and public.erp_subscription_has_erp_access(s.restaurant_id))
$$;
revoke all on function report_email_private.eligible(uuid) from public,anon,authenticated;

create function public.report_email_claim() returns setof public.report_email_deliveries
language plpgsql security definer set search_path='' as $$
begin
 update public.report_email_deliveries set state='failed',last_error='Retry limit or delivery expiry',payload=null
 where state in ('pending','sending') and available_at<=now() and (attempts>=6 or created_at<now()-interval '12 hours');
 update public.report_email_deliveries d set state='cancelled',payload=null
 where state in ('pending','sending') and available_at<=now() and not report_email_private.eligible(d.restaurant_id);
 return query with picked as (
  select id from public.report_email_deliveries where state in ('pending','sending') and available_at<=now()
  order by available_at for update skip locked limit 1
 ) update public.report_email_deliveries d set state='sending',attempts=attempts+1,
 available_at=now()+interval '10 minutes',lease=gen_random_uuid()
 from picked p where d.id=p.id returning d.*;
end $$;
revoke all on function public.report_email_claim() from public,anon,authenticated;
grant execute on function public.report_email_claim() to service_role;

-- A lease-bound context is rechecked immediately before each provider attempt.
-- Only the worker may call this; the scoped stock reader still enforces the owner's
-- current membership/subscription using a transaction-local identity.
create function public.report_email_context(p_delivery uuid,p_lease uuid,p_stock boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.report_email_deliveries; s public.organization_report_email; result jsonb; old_claims text; old_sub text;
begin
 select * into d from public.report_email_deliveries where id=p_delivery and lease=p_lease and state='sending' and available_at>now();
 if d.id is null or not report_email_private.eligible(d.restaurant_id) then raise exception 'REPORT_DELIVERY_DENIED' using errcode='42501'; end if;
 select * into s from public.organization_report_email where restaurant_id=d.restaurant_id;
 select jsonb_build_object('email',u.email,'restaurant_id',r.id,'name',r.name,'currency',r.currency)
 into result from auth.users u join public.restaurants r on r.id=d.restaurant_id where u.id=s.owner_user_id;
 if p_stock then
  old_claims:=current_setting('request.jwt.claims',true); old_sub:=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',s.owner_user_id,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',s.owner_user_id::text,true);
  result:=result||jsonb_build_object('inventoryTransactions',erp_report_private.stock_consumption(d.restaurant_id,null,d.report_date,d.report_date));
  perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 end if;
 return result;
end $$;
revoke all on function public.report_email_context(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.report_email_context(uuid,uuid,boolean) to service_role;

-- The dispatch credential is generated/stored inside Vault; it never enters source
-- control or a browser bundle. The service-only RPC is the worker's secret source.
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'report_email_dispatch');
create function public.report_email_dispatch_secret() returns text language sql security definer set search_path='' as $$
 select decrypted_secret from vault.decrypted_secrets where name='report_email_dispatch'
$$;
revoke all on function public.report_email_dispatch_secret() from public,anon,authenticated;
grant execute on function public.report_email_dispatch_secret() to service_role;

create function report_email_private.dispatch() returns void language plpgsql security definer set search_path='' as $$
declare local_now timestamp:=now() at time zone 'Asia/Riyadh'; secret text; i integer;
begin
 -- No catch-up backlog: only the previous Riyadh day, from 08:00 until midnight.
 if local_now::time >= time '08:00' then
  insert into public.report_email_deliveries(restaurant_id,report_date)
  select restaurant_id,local_now::date-1 from public.organization_report_email s
  where (s.created_at at time zone 'Asia/Riyadh')::date<local_now::date
   and report_email_private.eligible(s.restaurant_id)
  on conflict(restaurant_id,report_date) do nothing;
 end if;
 if not exists(select 1 from public.report_email_deliveries where state in ('pending','sending') and available_at<=now()) then return; end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='report_email_dispatch';
 for i in 1..least(5,(select count(*)::integer from public.report_email_deliveries where state in ('pending','sending') and available_at<=now())) loop
  perform net.http_post(url:='https://mqubwgbppncldyiicbtu.supabase.co/functions/v1/automatic-report-email',
   headers:=jsonb_build_object('Content-Type','application/json','x-dispatch-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=55000);
 end loop;
end $$;
revoke all on function report_email_private.dispatch() from public,anon,authenticated;
-- Activated by operations after worker deployment and verification.
select cron.schedule('automatic-owner-report-email','* * * * *','select report_email_private.dispatch()');
select cron.alter_job((select jobid from cron.job where jobname='automatic-owner-report-email'),active:=false);
select cron.schedule('report-email-retention','19 3 * * *',$job$
 update public.report_email_deliveries set payload=null where payload is not null and created_at<now()-interval '24 hours';
 delete from public.report_email_deliveries where created_at<now()-interval '30 days';
$job$);
