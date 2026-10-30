-- Seven opt-in owner PDF cadences. Default daily behavior is unchanged.
-- All business calendar boundaries are evaluated in Asia/Riyadh.
alter table public.organization_report_email
 add column report_frequencies text[] not null default array['daily']::text[]
 constraint valid_owner_report_frequencies
 check (report_frequencies <@ array['daily','weekly','monthly','quarterly','semiannual','nine_months','yearly']::text[]
        and array_position(report_frequencies,null) is null);
grant update(report_frequencies) on public.organization_report_email to authenticated;

-- Keep original daily rows, distinguish cadence when a completed period overlaps.
alter table public.report_email_deliveries
 add column frequency text not null default 'daily'
  check (frequency in ('daily','weekly','monthly','quarterly','semiannual','nine_months','yearly')),
 add column period_start date;
update public.report_email_deliveries set period_start=report_date where period_start is null;
alter table public.report_email_deliveries
 alter column period_start set not null,
 add constraint report_delivery_period_bounds check (period_start<=report_date),
 drop constraint report_email_deliveries_restaurant_id_report_date_key,
 add constraint report_delivery_unique_period unique (restaurant_id,frequency,report_date);

-- Extend immutable owner change log with schedule toggles.
create or replace function report_email_private.audit_owner_settings()
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
 if OLD.report_frequencies is distinct from NEW.report_frequencies then
  changes:=changes||jsonb_build_object('frequencies',jsonb_build_array(OLD.report_frequencies,NEW.report_frequencies));
 end if;
 if who is not null and changes<>'{}'::jsonb then
  insert into public.organization_report_email_audit(restaurant_id,actor_user_id,changes)
  values(NEW.restaurant_id,who,changes);
 end if;
 return NEW;
end $$;
drop trigger report_owner_settings_audit on public.organization_report_email;
create trigger report_owner_settings_audit
 after update of enabled,report_language,report_branch_id,report_frequencies
 on public.organization_report_email
 for each row execute function report_email_private.audit_owner_settings();

-- Only one job per organization, frequency and completed period end.
-- Saturday is the first weekday in this reporting convention (Saturday-Friday).
-- 9-month blocks use a fixed Jan 2026 anchor, and do not overlap.
create or replace function report_email_private.dispatch()
returns void language plpgsql security definer set search_path='' as $$
declare local_now timestamp:=now() at time zone 'Asia/Riyadh';
        business_date date:=(now() at time zone 'Asia/Riyadh')::date;
        month_index integer;
        secret text;
        i integer;
begin
 month_index:=(extract(year from business_date)::integer-2026)*12
              + extract(month from business_date)::integer-1;
 if local_now::time >= time '08:00' then
  insert into public.report_email_deliveries(restaurant_id,frequency,period_start,report_date)
  select s.restaurant_id, f.frequency,
   case f.frequency
    when 'daily' then business_date-1
    when 'weekly' then business_date-7
    when 'monthly' then (business_date-interval '1 month')::date
    when 'quarterly' then (business_date-interval '3 months')::date
    when 'semiannual' then (business_date-interval '6 months')::date
    when 'nine_months' then (business_date-interval '9 months')::date
    when 'yearly' then (business_date-interval '12 months')::date
   end,
   business_date-1
  from public.organization_report_email s
  cross join lateral unnest(s.report_frequencies) as f(frequency)
  where (s.created_at at time zone 'Asia/Riyadh')::date<business_date
   and report_email_private.eligible(s.restaurant_id)
   and (
    f.frequency='daily'
    or (f.frequency='weekly' and extract(dow from business_date)::integer=6)
    or (f.frequency='monthly' and extract(day from business_date)::integer=1)
    or (f.frequency='quarterly' and extract(day from business_date)::integer=1 and mod(month_index,3)=0)
    or (f.frequency='semiannual' and extract(day from business_date)::integer=1 and mod(month_index,6)=0)
    or (f.frequency='nine_months' and extract(day from business_date)::integer=1 and mod(month_index,9)=0)
    or (f.frequency='yearly' and extract(day from business_date)::integer=1 and mod(month_index,12)=0)
   )
  on conflict (restaurant_id,frequency,report_date) do nothing;
 end if;
 if not exists(select 1 from public.report_email_deliveries
               where state in ('pending','sending') and available_at<=now())
 then return; end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='report_email_dispatch';
 for i in 1..least(5,(select count(*)::integer from public.report_email_deliveries
                        where state in ('pending','sending') and available_at<=now())) loop
  perform net.http_post(url:='https://mqubwgbppncldyiicbtu.supabase.co/functions/v1/automatic-report-email',
   headers:=jsonb_build_object('Content-Type','application/json','x-dispatch-secret',secret),
   body:='{}'::jsonb,timeout_milliseconds:=55000);
 end loop;
end $$;

-- Revocation of one cadence cancels its pending messages without touching others.
create or replace function public.report_email_claim()
returns setof public.report_email_deliveries
language plpgsql security definer set search_path='' as $$
begin
 update public.report_email_deliveries set state='failed',
  last_error='Retry limit or delivery expiry',payload=null
 where state in ('pending','sending') and available_at<=now()
  and (attempts>=6 or created_at<now()-interval '12 hours');
 update public.report_email_deliveries d set state='cancelled',payload=null
 where state in ('pending','sending') and available_at<=now()
  and (not report_email_private.eligible(d.restaurant_id)
       or not exists(select 1 from public.organization_report_email s
        where s.restaurant_id=d.restaurant_id and d.frequency=any(s.report_frequencies)));
 return query with picked as (
  select id from public.report_email_deliveries
  where state in ('pending','sending') and available_at<=now()
  order by available_at for update skip locked limit 1
 ) update public.report_email_deliveries d
 set state='sending',attempts=attempts+1,
     available_at=now()+interval '10 minutes',lease=gen_random_uuid()
 from picked p where d.id=p.id returning d.*;
end $$;

-- Keep server-only lease checks, verified owner recipient and exact period scope.
create or replace function public.report_email_context(p_delivery uuid,p_lease uuid,p_stock boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.report_email_deliveries;
        s public.organization_report_email;
        result jsonb;
        old_claims text;
        old_sub text;
begin
 select * into d from public.report_email_deliveries
 where id=p_delivery and lease=p_lease and state='sending' and available_at>now();
 if d.id is null or not report_email_private.eligible(d.restaurant_id) then
  raise exception 'REPORT_DELIVERY_DENIED' using errcode='42501';
 end if;
 select * into s from public.organization_report_email where restaurant_id=d.restaurant_id;
 if not (d.frequency=any(s.report_frequencies)) then
  raise exception 'REPORT_FREQUENCY_REVOKED' using errcode='42501';
 end if;
 select jsonb_build_object('email',u.email,'restaurant_id',r.id,'name',r.name,
   'currency',r.currency,'language',s.report_language,'branch_id',s.report_branch_id,
   'frequency',d.frequency,'period_start',d.period_start,'period_end',d.report_date)
 into result from auth.users u join public.restaurants r on r.id=d.restaurant_id
 where u.id=s.owner_user_id;
 if p_stock then
  old_claims:=current_setting('request.jwt.claims',true);
  old_sub:=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',s.owner_user_id,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',s.owner_user_id::text,true);
  result:=result||jsonb_build_object('inventoryTransactions',
   erp_report_private.stock_consumption(d.restaurant_id,s.report_branch_id,d.period_start,d.report_date));
  perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 end if;
 return result;
end $$;

-- Owner sees sent date, covered period and cadence, never finance payload or recipient.
create or replace function public.erp_owner_report_history(p_restaurant_id uuid,p_limit integer default 7)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if (select auth.uid()) is null or not exists (
  select 1 from public.organization_report_email s
  join public.erp_memberships m on m.restaurant_id=s.restaurant_id
   and m.user_id=(select auth.uid()) and m.role='owner' and m.status='approved'
  where s.restaurant_id=p_restaurant_id and s.owner_user_id=(select auth.uid())
 ) then raise exception 'REPORT_HISTORY_FORBIDDEN' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) into result from (
  select report_date,period_start,frequency,state,attempts,created_at,provider_id,last_error
  from public.report_email_deliveries where restaurant_id=p_restaurant_id
   and (created_at at time zone 'Asia/Riyadh')::date >=
    (now() at time zone 'Asia/Riyadh')::date-(least(greatest(coalesce(p_limit,7),1),30)-1)
  order by created_at desc limit 100
 ) d;
 return result;
end $$;
