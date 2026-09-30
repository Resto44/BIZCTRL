-- Owner background notifications. Secrets stay in Vault; browsers can only manage their own devices.
create schema if not exists push_private;
revoke all on schema push_private from public, anon, authenticated;
create extension if not exists pg_net with schema extensions;

create table public.owner_push_devices (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<4096), p256dh text not null, auth_key text not null,
 enabled boolean not null default true, created_at timestamptz not null default now()
);
alter table public.owner_push_devices enable row level security;
grant select,delete on public.owner_push_devices to authenticated;
grant all on public.owner_push_devices to service_role;
create policy owner_device_read on public.owner_push_devices for select to authenticated using(user_id=auth.uid() and public.erp_is_approved_owner(restaurant_id));
create policy owner_device_delete on public.owner_push_devices for delete to authenticated using(user_id=auth.uid());

create table public.owner_record_events (
 id uuid primary key default gen_random_uuid(), restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 entity text not null, action text not null, record_id text, reference text, branch text, actor_id uuid,
 created_at timestamptz not null default now()
);
create index on public.owner_record_events(restaurant_id,created_at desc);
alter table public.owner_record_events enable row level security;
grant select on public.owner_record_events to authenticated;
grant all on public.owner_record_events to service_role;
create policy owner_event_read on public.owner_record_events for select to authenticated using(public.erp_is_approved_owner(restaurant_id));

create table public.owner_push_deliveries (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.owner_record_events(id) on delete cascade,
 device_id uuid not null references public.owner_push_devices(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','cancelled')),
 attempts int not null default 0, available_at timestamptz not null default now(), last_error text,
 created_at timestamptz not null default now(), unique(event_id,device_id)
);
create index on public.owner_push_deliveries(available_at) where state in ('pending','sending');
alter table public.owner_push_deliveries enable row level security;
revoke all on public.owner_push_deliveries from anon,authenticated;
grant all on public.owner_push_deliveries to service_role;

create function public.owner_push_config(p_keys jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin
 -- Only service_role may execute. Serialize initialization across cold starts.
 perform pg_advisory_xact_lock(94837201);
 select decrypted_secret::jsonb into v from vault.decrypted_secrets where name='owner_push_config';
 if v is null and p_keys is not null then
  v:=p_keys || jsonb_build_object('dispatchSecret',encode(extensions.gen_random_bytes(32),'hex'));
  perform vault.create_secret(v::text,'owner_push_config');
 end if;
 return v;
end $$;
revoke all on function public.owner_push_config(jsonb) from public,anon,authenticated;
grant execute on function public.owner_push_config(jsonb) to service_role;

create function push_private.capture_record() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; tenant uuid; ev uuid;
begin
 r:=case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
 if TG_OP='UPDATE' and (to_jsonb(OLD)-array['updated_at','updated_date','last_login_at','last_seen_at'])=(r-array['updated_at','updated_date','last_login_at','last_seen_at']) then return NEW; end if;
 -- Resolve legacy org-only rows through the authoritative restaurants mapping.
 select id into tenant from public.restaurants where id::text=r->>'restaurant_id'
  or (nullif(r->>'restaurant_id','') is null and org_id=r->>'org_id') limit 1;
 if tenant is null then return coalesce(NEW,OLD); end if;
 if not exists(select 1 from public.erp_memberships where restaurant_id=tenant and role='owner' and status='approved') then return coalesce(NEW,OLD); end if;
 insert into public.owner_record_events(restaurant_id,entity,action,record_id,reference,branch,actor_id)
 values(tenant,TG_TABLE_NAME,lower(TG_OP),r->>'id',left(coalesce(r->>'invoice_number',r->>'order_number',r->>'name',r->>'id'),100),left(coalesce(r->>'branch',r->>'branch_id'),100),auth.uid()) returning id into ev;
 insert into public.owner_push_deliveries(event_id,device_id)
 select ev,d.id from public.owner_push_devices d where d.restaurant_id=tenant and d.enabled and exists(
 select 1 from public.erp_memberships m where m.user_id=d.user_id and m.restaurant_id=tenant and m.role='owner' and m.status='approved');
 return coalesce(NEW,OLD);
end $$;
revoke all on function push_private.capture_record() from public,anon,authenticated;

-- Business records, including all inserts, meaningful updates and deletions.
-- Exclude internal logs/queues, transient carts, telemetry, and notification machinery.
do $$ declare t record; begin
 for t in select distinct c.table_name from information_schema.columns c join information_schema.tables x using(table_schema,table_name)
 where c.table_schema='public' and x.table_type='BASE TABLE' and c.column_name in ('restaurant_id','org_id')
 and c.table_name not like 'owner_push_%' and c.table_name not like 'copilot_%'
 and c.table_name not in ('owner_record_events','notifications','push_subscriptions','audit_logs','permission_audit_log','platform_owner_activity_logs','sales_closing_audit_log','retail_inventory_audit','cart_items','customer_favorites','driver_locations','order_tracking','order_status_history','product_analytics','product_price_history','invoice_sequences','ocr_logs','subscription_usage','subscription_events','retail_pos_device_events','retail_pos_device_commands','whatsapp_outbound_queue','workspace_saved_views','dashboard_configurations','restaurants','profiles','erp_memberships','inventory_consumption_log','sales_closing_finalized_versions')
 loop execute format('create trigger owner_record_push after insert or update or delete on public.%I for each row execute function push_private.capture_record()',t.table_name); end loop;
end $$;

create function public.owner_push_claim() returns setof public.owner_push_deliveries
language sql security definer set search_path='' as $$
 with picked as (select id from public.owner_push_deliveries where state in ('pending','sending') and available_at<=now() and attempts<8 and created_at>now()-interval '24 hours' order by available_at for update skip locked limit 40)
 update public.owner_push_deliveries d set state='sending', attempts=attempts+1,available_at=now()+interval '5 minutes' from picked p where d.id=p.id returning d.*;
$$;
revoke all on function public.owner_push_claim() from public,anon,authenticated;
grant execute on function public.owner_push_claim() to service_role;

create function push_private.dispatch() returns void language plpgsql security definer set search_path='' as $$
declare secret text;
begin
 update public.owner_push_deliveries set state='failed',last_error='Retry limit or delivery expiry' where state in ('pending','sending') and (attempts>=8 or created_at<now()-interval '24 hours') and available_at<=now();
 if not exists(select 1 from public.owner_push_deliveries where state in ('pending','sending') and available_at<=now()) then return; end if;
 select decrypted_secret::jsonb->>'dispatchSecret' into secret from vault.decrypted_secrets where name='owner_push_config';
 if secret is null then return; end if;
 perform net.http_post(url:='https://mqubwgbppncldyiicbtu.supabase.co/functions/v1/owner-push/dispatch',headers:=jsonb_build_object('Content-Type','application/json','x-dispatch-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=55000);
end $$;
revoke all on function push_private.dispatch() from public,anon,authenticated;
select cron.schedule('owner-push-dispatch','10 seconds','select push_private.dispatch()');
select cron.schedule('owner-push-retention','23 3 * * *', $job$delete from public.owner_record_events where created_at<now()-interval '30 days'$job$);
