-- ERP Printer Management v1: additive, non-financial and disabled until configured.
-- Browser routes are manual / operator-confirmed; no silent hardware printing claim.
create schema if not exists erp_print_private;
revoke all on schema erp_print_private from public,anon,authenticated;

create table if not exists erp_print_private.devices (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id),
 branch_id uuid not null references public.branches(id),
 name text not null check(length(btrim(name)) between 2 and 80),
 kind text not null check(kind in ('kitchen_ticket','cashier_receipt','sales_invoice','purchase_invoice','supplier_document','customer_statement','financial_report')),
 paper text not null default '80mm' check(paper in ('58mm','80mm','A4')),
 station text not null default '',
 active boolean not null default true,
 mode text not null default 'browser' check(mode='browser'),
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,restaurant_id,branch_id)
);
create index if not exists erp_print_devices_branch_idx on erp_print_private.devices(restaurant_id,branch_id,kind) where active;

create table if not exists erp_print_private.jobs (
 id uuid primary key default gen_random_uuid(),
 restaurant_id uuid not null,
 branch_id uuid not null,
 device_id uuid not null,
 source_id uuid not null,
 document_type text not null check(document_type in ('kitchen_ticket','cashier_receipt')),
 status text not null default 'pending' check(status in ('pending','dialog_opened','operator_confirmed','failed')),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 last_actor_id uuid,
 open_count integer not null default 0 check(open_count>=0),
 foreign key(device_id,restaurant_id,branch_id)
  references erp_print_private.devices(id,restaurant_id,branch_id),
 unique(device_id,source_id,document_type)
);
create index if not exists erp_print_jobs_queue_idx on erp_print_private.jobs(restaurant_id,branch_id,created_at desc);
alter table erp_print_private.devices enable row level security;
alter table erp_print_private.jobs enable row level security;
revoke all on all tables in schema erp_print_private from public,anon,authenticated;
revoke all on all sequences in schema erp_print_private from public,anon,authenticated;

create or replace function erp_print_private.member_for(p_restaurant_id uuid,p_branch_id uuid default null)
returns public.erp_memberships language plpgsql stable security definer set search_path='' as $$
declare m public.erp_memberships;
begin
 if auth.uid() is null then raise exception 'PRINT_SIGNIN_REQUIRED' using errcode='42501';end if;
 select * into m from public.erp_memberships
 where user_id=auth.uid() and restaurant_id=p_restaurant_id and status='approved'
 order by case when role='owner' then 0 else 1 end,created_at desc limit 1;
 if m.id is null or m.role not in ('owner','manager','employee','cashier') then
  raise exception 'PRINT_MEMBERSHIP_FORBIDDEN' using errcode='42501';
 end if;
 if p_branch_id is not null and
    not exists(select 1 from public.branches b where b.id=p_branch_id and b.restaurant_id=p_restaurant_id and b.is_active is true)
  then raise exception 'PRINT_BRANCH_INVALID' using errcode='42501';end if;
 if m.role<>'owner' and p_branch_id is not null and p_branch_id is distinct from m.branch_id then
  raise exception 'PRINT_BRANCH_FORBIDDEN' using errcode='42501';
 end if;
 return m;
end $$;
revoke all on function erp_print_private.member_for(uuid,uuid) from public,anon,authenticated;

-- Owner manages printers. Everyone else can only read permitted printing queues.
create or replace function public.erp_print_manage(
 p_restaurant_id uuid,p_branch_id uuid,p_id uuid,p_action text,p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.erp_memberships; d erp_print_private.devices; k text; paper text; station text; label text;
begin
 m:=erp_print_private.member_for(p_restaurant_id,p_branch_id);
 if m.role<>'owner' or p_branch_id is null then
  raise exception 'PRINT_OWNER_ONLY' using errcode='42501';
 end if;
 if p_action='create' then
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'PRINT_INVALID' using errcode='22023';end if;
  k:=p_payload->>'kind'; paper:=coalesce(p_payload->>'paper','80mm');
  station:=btrim(coalesce(p_payload->>'station',''));label:=btrim(coalesce(p_payload->>'name',''));
  if k not in ('kitchen_ticket','cashier_receipt','sales_invoice','purchase_invoice','supplier_document','customer_statement','financial_report')
    or paper not in ('58mm','80mm','A4') or length(label) not between 2 and 80 or length(station)>60
    then raise exception 'PRINT_INVALID_DEVICE' using errcode='22023';end if;
  insert into erp_print_private.devices(restaurant_id,branch_id,name,kind,paper,station,created_by)
  values(p_restaurant_id,p_branch_id,label,k,paper,station,auth.uid()) returning * into d;
 elsif p_action in ('enable','disable') then
  select * into d from erp_print_private.devices where id=p_id
   and restaurant_id=p_restaurant_id and branch_id=p_branch_id for update;
  if d.id is null then raise exception 'PRINT_DEVICE_FORBIDDEN' using errcode='42501';end if;
  update erp_print_private.devices set active=(p_action='enable'),updated_at=now()
   where id=d.id returning * into d;
 else raise exception 'PRINT_BAD_ACTION' using errcode='22023';end if;
 return jsonb_build_object('id',d.id,'active',d.active,'kind',d.kind,'paper',d.paper);
end $$;

-- Read-only queue. Kitchen sees names/quantities ONLY, not prices or customer contact.
-- Cashier receipt is visible only to owner/manager or a verified sales role.
create or replace function public.erp_print_state(
 p_restaurant_id uuid,p_branch_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.erp_memberships; b uuid; can_sales boolean;can_kitchen boolean;
 printers jsonb; jobs jsonb;
begin
 m:=erp_print_private.member_for(p_restaurant_id,p_branch_id);
 b:=case when m.role='owner' then p_branch_id else m.branch_id end;
 can_sales:=m.role in ('owner','manager','cashier') or public.erp_has_any_permission(array['viewSales']);
 can_kitchen:=m.role in ('owner','manager') or public.erp_has_any_permission(array['viewOrders']);
 if not (can_sales or can_kitchen) then raise exception 'PRINT_PERMISSION_DENIED' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'branch_id',d.branch_id,'name',d.name,
    'kind',d.kind,'paper',d.paper,'station',d.station,'active',d.active,'mode',d.mode)
    order by d.name),'[]'::jsonb) into printers
 from erp_print_private.devices d
 where d.restaurant_id=p_restaurant_id and (b is null or d.branch_id=b)
   and (m.role in ('owner','manager') or
    (d.kind='kitchen_ticket' and can_kitchen) or (d.kind='cashier_receipt' and can_sales));
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'branch_id',j.branch_id,
   'device_id',j.device_id,'device_name',d.name,'document_type',j.document_type,
   'paper',d.paper,'status',j.status,'created_at',j.created_at,'payload',j.payload,
   'open_count',j.open_count) order by j.created_at desc),'[]'::jsonb) into jobs
 from (select * from erp_print_private.jobs
   where restaurant_id=p_restaurant_id and (b is null or branch_id=b)
   and ((document_type='kitchen_ticket' and can_kitchen) or
        (document_type='cashier_receipt' and can_sales))
   order by created_at desc limit 100) j
 join erp_print_private.devices d on d.id=j.device_id;
 return jsonb_build_object('printers',printers,'jobs',jobs,
   'can_manage',m.role='owner','browser_only',true);
end $$;

create or replace function public.erp_print_job_action(
 p_restaurant_id uuid,p_job_id uuid,p_action text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare j erp_print_private.jobs;m public.erp_memberships; can_sales boolean;can_kitchen boolean;
begin
 if p_action not in ('open','confirm','fail','retry') then raise exception 'PRINT_BAD_ACTION' using errcode='22023';end if;
 select * into j from erp_print_private.jobs
 where id=p_job_id and restaurant_id=p_restaurant_id for update;
 if j.id is null then raise exception 'PRINT_JOB_MISSING' using errcode='42501';end if;
 m:=erp_print_private.member_for(p_restaurant_id,j.branch_id);
 can_sales:=m.role in ('owner','manager','cashier') or public.erp_has_any_permission(array['viewSales']);
 can_kitchen:=m.role in ('owner','manager') or public.erp_has_any_permission(array['viewOrders']);
 if not ((j.document_type='kitchen_ticket' and can_kitchen) or
         (j.document_type='cashier_receipt' and can_sales)) then
  raise exception 'PRINT_JOB_FORBIDDEN' using errcode='42501';end if;
 if p_action='confirm' and j.status<>'dialog_opened' then
  raise exception 'PRINT_CONFIRM_REQUIRES_OPEN' using errcode='22023';end if;
 update erp_print_private.jobs set status=case p_action
    when 'open' then 'dialog_opened'
    when 'confirm' then 'operator_confirmed'
    when 'fail' then 'failed'
    else 'pending' end,
    updated_at=now(),last_actor_id=auth.uid(),
    open_count=open_count+case when p_action='open' then 1 else 0 end
 where id=j.id returning * into j;
 return jsonb_build_object('id',j.id,'status',j.status,'open_count',j.open_count);
end $$;

-- Idempotent, branch-scoped job creation AFTER the existing POS commits its
-- authoritative kitchen submission / receipt. No POS row is written by printing.
create or replace function erp_print_private.capture_pos_job()
returns trigger language plpgsql security definer set search_path='' as $$
declare terminal restaurant_pos_private.terminals; d erp_print_private.devices;
 lines jsonb; should_kitchen boolean; should_receipt boolean; payload jsonb;
begin
 should_kitchen:=new.submitted_at is not null and
      (tg_op='INSERT' or old.submitted_at is distinct from new.submitted_at);
 should_receipt:=new.paid_at is not null and new.receipt is not null and
     jsonb_typeof(new.receipt)='object' and
     (tg_op='INSERT' or old.paid_at is distinct from new.paid_at);
 if not (should_kitchen or should_receipt) then return new;end if;
 select * into terminal from restaurant_pos_private.terminals where id=new.device_id;
 if terminal.id is null then return new;end if;
 for d in select * from erp_print_private.devices where restaurant_id=terminal.restaurant_id
   and branch_id=terminal.branch_id and active and kind in ('kitchen_ticket','cashier_receipt')
 loop
  if d.kind='kitchen_ticket' and should_kitchen then
    select coalesce(jsonb_agg(value),'[]'::jsonb) into lines
    from jsonb_array_elements(coalesce(new.lines,'[]'::jsonb)) as value
    where d.station='' or coalesce(value->>'station','Kitchen')=d.station;
    if jsonb_array_length(lines)=0 then continue;end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'name',coalesce(v->>'name_ar',v->>'name'),'name_ar',v->>'name_ar',
      'name_fa',v->>'name_fa','quantity',coalesce(v->>'quantity','1'),
      'station',coalesce(v->>'station','Kitchen'))),'[]'::jsonb)
    into lines from jsonb_array_elements(lines) as v;
    payload:=jsonb_build_object('number',new.number,'lines',lines,
      'notes',left(coalesce(new.notes,''),500),'order_type',new.order_type,
      'table_label',new.table_label,'submitted_at',new.submitted_at);
    insert into erp_print_private.jobs(restaurant_id,branch_id,device_id,source_id,document_type,payload)
    values(terminal.restaurant_id,terminal.branch_id,d.id,new.id,'kitchen_ticket',payload)
    on conflict(device_id,source_id,document_type) do nothing;
  elsif d.kind='cashier_receipt' and should_receipt then
    payload:=jsonb_build_object('number',new.number,'receipt',new.receipt,
      'paid_at',new.paid_at,'net_total',new.net_total);
    insert into erp_print_private.jobs(restaurant_id,branch_id,device_id,source_id,document_type,payload)
    values(terminal.restaurant_id,terminal.branch_id,d.id,new.id,'cashier_receipt',payload)
    on conflict(device_id,source_id,document_type) do nothing;
  end if;
 end loop;
 return new;
exception when others then
 -- A print problem must NEVER block or roll back a paid sale.
 raise warning 'PRINT_QUEUE_FAILURE %',sqlstate;
 return new;
end $$;

drop trigger if exists erp_print_pos_capture on restaurant_pos_private.orders;
create trigger erp_print_pos_capture
after insert or update of submitted_at,paid_at on restaurant_pos_private.orders
for each row execute function erp_print_private.capture_pos_job();

revoke all on function public.erp_print_manage(uuid,uuid,uuid,text,jsonb),
 public.erp_print_state(uuid,uuid),
 public.erp_print_job_action(uuid,uuid,text)
 from public,anon,authenticated;
grant execute on function public.erp_print_manage(uuid,uuid,uuid,text,jsonb),
 public.erp_print_state(uuid,uuid),
 public.erp_print_job_action(uuid,uuid,text)
 to authenticated;
revoke all on function erp_print_private.capture_pos_job() from public,anon,authenticated;
