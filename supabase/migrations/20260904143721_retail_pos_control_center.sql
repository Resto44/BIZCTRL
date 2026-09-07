begin;

-- Retail POS Control Center
-- Company -> Branch -> POS device -> Cashier shift -> Transaction.
-- Barcode scanners and payment terminals are hardware attached to a POS device;
-- they are deliberately not treated as the financial account themselves.

create or replace function public.erp_retail_pos_portal_allowed(p_restaurant_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.restaurants restaurant
    where restaurant.id = p_restaurant_id
      and lower(btrim(coalesce(nullif(restaurant.business_type::text, ''), restaurant.business_mode::text, ''))) in ('retail', 'supermarket')
  );
$$;

revoke all on function public.erp_retail_pos_portal_allowed(uuid) from public, anon;
grant execute on function public.erp_retail_pos_portal_allowed(uuid) to authenticated, service_role;

create table if not exists public.retail_pos_devices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null,
  display_name text,
  serial_number text,
  status text not null default 'offline'
    check (status in ('online', 'offline', 'maintenance', 'locked', 'retired')),
  scanner_status text not null default 'not_configured'
    check (scanner_status in ('online', 'offline', 'error', 'not_configured')),
  printer_status text not null default 'not_configured'
    check (printer_status in ('online', 'offline', 'error', 'not_configured')),
  cash_drawer_status text not null default 'not_configured'
    check (cash_drawer_status in ('online', 'offline', 'error', 'open', 'not_configured')),
  network_latency_ms integer check (network_latency_ms is null or network_latency_ms >= 0),
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retail_pos_devices_code_format check (code ~ '^POS-[0-9]{2,4}$'),
  constraint retail_pos_devices_branch_code_key unique (restaurant_id, branch_id, code),
  constraint retail_pos_devices_scope_key unique (id, restaurant_id, branch_id)
);

create table if not exists public.retail_pos_shifts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  branch_id uuid not null,
  device_id uuid not null,
  cashier_user_id uuid,
  cashier_employee_id uuid references public.employees(id) on delete set null,
  cashier_name text not null,
  shift_name text not null default 'default',
  status text not null default 'open'
    check (status in ('open', 'closing', 'closed', 'suspended')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash numeric(16,2) not null default 0 check (opening_cash >= 0),
  expected_cash numeric(16,2),
  counted_cash numeric(16,2),
  cash_difference numeric(16,2),
  notes text,
  created_by uuid default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retail_pos_shifts_device_scope_fk
    foreign key (device_id, restaurant_id, branch_id)
    references public.retail_pos_devices(id, restaurant_id, branch_id) on delete restrict,
  constraint retail_pos_shifts_scope_key unique (id, restaurant_id, branch_id, device_id),
  constraint retail_pos_shifts_close_state check (
    (status = 'closed' and closed_at is not null)
    or (status <> 'closed')
  )
);

create unique index if not exists retail_pos_one_open_shift_per_device_idx
  on public.retail_pos_shifts(device_id)
  where status in ('open', 'closing', 'suspended');

create table if not exists public.retail_pos_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  branch_id uuid not null,
  device_id uuid not null,
  shift_id uuid not null,
  original_transaction_id uuid,
  receipt_number text not null,
  idempotency_key text not null,
  transaction_type text not null default 'sale'
    check (transaction_type in ('sale', 'refund', 'void')),
  status text not null default 'posted'
    check (status in ('posted', 'pending', 'approved', 'rejected')),
  cashier_user_id uuid,
  cashier_name text not null,
  business_date date not null default (timezone('Asia/Riyadh', now()))::date,
  subtotal numeric(16,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(16,2) not null default 0 check (discount_total >= 0),
  tax_total numeric(16,2) not null default 0 check (tax_total >= 0),
  net_total numeric(16,2) not null default 0 check (net_total >= 0),
  item_count integer not null default 0 check (item_count >= 0),
  notes text,
  occurred_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint retail_pos_transactions_shift_scope_fk
    foreign key (shift_id, restaurant_id, branch_id, device_id)
    references public.retail_pos_shifts(id, restaurant_id, branch_id, device_id) on delete restrict,
  constraint retail_pos_transactions_original_scope_fk
    foreign key (original_transaction_id)
    references public.retail_pos_transactions(id) on delete restrict,
  constraint retail_pos_transactions_receipt_key unique (restaurant_id, branch_id, device_id, receipt_number),
  constraint retail_pos_transactions_idempotency_key unique (restaurant_id, idempotency_key),
  constraint retail_pos_transactions_scope_key unique (id, restaurant_id, branch_id, device_id, shift_id),
  constraint retail_pos_transactions_reversal_source check (
    (transaction_type = 'sale' and original_transaction_id is null)
    or (transaction_type in ('refund', 'void') and original_transaction_id is not null)
  )
);

create table if not exists public.retail_pos_transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  restaurant_id uuid not null,
  branch_id uuid not null,
  device_id uuid not null,
  shift_id uuid not null,
  product_id uuid references public.products(id) on delete restrict,
  sku text,
  product_name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(16,2) not null check (unit_price >= 0),
  discount_total numeric(16,2) not null default 0 check (discount_total >= 0),
  tax_total numeric(16,2) not null default 0 check (tax_total >= 0),
  line_total numeric(16,2) not null check (line_total >= 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint retail_pos_items_transaction_scope_fk
    foreign key (transaction_id, restaurant_id, branch_id, device_id, shift_id)
    references public.retail_pos_transactions(id, restaurant_id, branch_id, device_id, shift_id) on delete restrict
);

create table if not exists public.retail_pos_transaction_payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  restaurant_id uuid not null,
  branch_id uuid not null,
  device_id uuid not null,
  shift_id uuid not null,
  payment_method text not null
    check (payment_method in ('cash', 'mada', 'apple_pay', 'card', 'credit', 'wallet', 'other')),
  amount numeric(16,2) not null check (amount >= 0),
  provider text,
  reference text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint retail_pos_payments_transaction_scope_fk
    foreign key (transaction_id, restaurant_id, branch_id, device_id, shift_id)
    references public.retail_pos_transactions(id, restaurant_id, branch_id, device_id, shift_id) on delete restrict
);

create table if not exists public.retail_pos_approval_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  branch_id uuid not null,
  device_id uuid not null,
  shift_id uuid,
  transaction_id uuid,
  request_type text not null
    check (request_type in ('refund', 'void', 'discount', 'shift_reopen', 'device_unlock')),
  amount numeric(16,2) not null default 0 check (amount >= 0),
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid not null default auth.uid(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retail_pos_approvals_device_scope_fk
    foreign key (device_id, restaurant_id, branch_id)
    references public.retail_pos_devices(id, restaurant_id, branch_id) on delete restrict,
  constraint retail_pos_approvals_shift_scope_fk
    foreign key (shift_id, restaurant_id, branch_id, device_id)
    references public.retail_pos_shifts(id, restaurant_id, branch_id, device_id) on delete restrict,
  constraint retail_pos_approvals_transaction_scope_fk
    foreign key (transaction_id, restaurant_id, branch_id, device_id, shift_id)
    references public.retail_pos_transactions(id, restaurant_id, branch_id, device_id, shift_id) on delete restrict
);

create table if not exists public.retail_pos_device_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  branch_id uuid not null,
  device_id uuid not null,
  shift_id uuid,
  transaction_id uuid,
  event_type text not null,
  severity text not null default 'info'
    check (severity in ('info', 'warning', 'critical')),
  title text not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  actor_user_id uuid default auth.uid(),
  occurred_at timestamptz not null default now(),
  constraint retail_pos_events_device_scope_fk
    foreign key (device_id, restaurant_id, branch_id)
    references public.retail_pos_devices(id, restaurant_id, branch_id) on delete restrict,
  constraint retail_pos_events_shift_scope_fk
    foreign key (shift_id, restaurant_id, branch_id, device_id)
    references public.retail_pos_shifts(id, restaurant_id, branch_id, device_id) on delete restrict,
  constraint retail_pos_events_transaction_scope_fk
    foreign key (transaction_id, restaurant_id, branch_id, device_id, shift_id)
    references public.retail_pos_transactions(id, restaurant_id, branch_id, device_id, shift_id) on delete restrict
);

create table if not exists public.retail_pos_device_commands (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  branch_id uuid not null,
  device_id uuid not null,
  command_type text not null
    check (command_type in ('lock', 'unlock', 'sync', 'restart', 'remote_support')),
  status text not null default 'queued'
    check (status in ('queued', 'acknowledged', 'completed', 'failed', 'expired')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  requested_by uuid not null default auth.uid(),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retail_pos_commands_device_scope_fk
    foreign key (device_id, restaurant_id, branch_id)
    references public.retail_pos_devices(id, restaurant_id, branch_id) on delete cascade
);

create index if not exists retail_pos_devices_restaurant_branch_idx
  on public.retail_pos_devices(restaurant_id, branch_id, status, code);
create index if not exists retail_pos_devices_last_seen_idx
  on public.retail_pos_devices(restaurant_id, last_seen_at desc);
create index if not exists retail_pos_shifts_device_opened_idx
  on public.retail_pos_shifts(device_id, opened_at desc);
create index if not exists retail_pos_shifts_restaurant_branch_status_idx
  on public.retail_pos_shifts(restaurant_id, branch_id, status, opened_at desc);
create index if not exists retail_pos_transactions_scope_time_idx
  on public.retail_pos_transactions(restaurant_id, branch_id, occurred_at desc);
create index if not exists retail_pos_transactions_device_time_idx
  on public.retail_pos_transactions(device_id, occurred_at desc);
create index if not exists retail_pos_transactions_shift_time_idx
  on public.retail_pos_transactions(shift_id, occurred_at desc);
create index if not exists retail_pos_transactions_original_idx
  on public.retail_pos_transactions(original_transaction_id)
  where original_transaction_id is not null;
create index if not exists retail_pos_items_transaction_idx
  on public.retail_pos_transaction_items(transaction_id);
create index if not exists retail_pos_items_product_idx
  on public.retail_pos_transaction_items(product_id)
  where product_id is not null;
create index if not exists retail_pos_payments_transaction_method_idx
  on public.retail_pos_transaction_payments(transaction_id, payment_method);
create index if not exists retail_pos_approvals_queue_idx
  on public.retail_pos_approval_requests(restaurant_id, status, created_at desc);
create index if not exists retail_pos_events_scope_time_idx
  on public.retail_pos_device_events(restaurant_id, branch_id, occurred_at desc);
create index if not exists retail_pos_commands_device_queue_idx
  on public.retail_pos_device_commands(device_id, status, created_at desc);

create or replace function public.erp_retail_pos_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.erp_retail_pos_validate_device_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.erp_retail_pos_portal_allowed(new.restaurant_id) then
    raise exception 'Retail POS Control is available only in the Supermarket portal'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.branches branch
    where branch.id = new.branch_id
      and branch.restaurant_id = new.restaurant_id
      and coalesce(branch.is_active, true)
  ) then
    raise exception 'POS branch does not belong to this supermarket'
      using errcode = '23503';
  end if;
  new.code := upper(btrim(new.code));
  return new;
end;
$$;

create or replace function public.erp_retail_pos_append_only()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'Retail POS financial ledger rows are append-only'
    using errcode = '55000';
end;
$$;

-- Trigger functions are invoked by PostgreSQL, never directly by API roles.
revoke all on function public.erp_retail_pos_touch_updated_at() from public, anon, authenticated;
revoke all on function public.erp_retail_pos_validate_device_scope() from public, anon, authenticated;
revoke all on function public.erp_retail_pos_append_only() from public, anon, authenticated;

drop trigger if exists retail_pos_devices_validate_scope on public.retail_pos_devices;
create trigger retail_pos_devices_validate_scope
  before insert or update of restaurant_id, branch_id, code on public.retail_pos_devices
  for each row execute function public.erp_retail_pos_validate_device_scope();

drop trigger if exists retail_pos_devices_touch on public.retail_pos_devices;
create trigger retail_pos_devices_touch before update on public.retail_pos_devices
  for each row execute function public.erp_retail_pos_touch_updated_at();
drop trigger if exists retail_pos_shifts_touch on public.retail_pos_shifts;
create trigger retail_pos_shifts_touch before update on public.retail_pos_shifts
  for each row execute function public.erp_retail_pos_touch_updated_at();
drop trigger if exists retail_pos_approvals_touch on public.retail_pos_approval_requests;
create trigger retail_pos_approvals_touch before update on public.retail_pos_approval_requests
  for each row execute function public.erp_retail_pos_touch_updated_at();
drop trigger if exists retail_pos_commands_touch on public.retail_pos_device_commands;
create trigger retail_pos_commands_touch before update on public.retail_pos_device_commands
  for each row execute function public.erp_retail_pos_touch_updated_at();

drop trigger if exists retail_pos_transactions_immutable on public.retail_pos_transactions;
create trigger retail_pos_transactions_immutable before update or delete on public.retail_pos_transactions
  for each row execute function public.erp_retail_pos_append_only();
drop trigger if exists retail_pos_items_immutable on public.retail_pos_transaction_items;
create trigger retail_pos_items_immutable before update or delete on public.retail_pos_transaction_items
  for each row execute function public.erp_retail_pos_append_only();
drop trigger if exists retail_pos_payments_immutable on public.retail_pos_transaction_payments;
create trigger retail_pos_payments_immutable before update or delete on public.retail_pos_transaction_payments
  for each row execute function public.erp_retail_pos_append_only();
drop trigger if exists retail_pos_events_immutable on public.retail_pos_device_events;
create trigger retail_pos_events_immutable before update or delete on public.retail_pos_device_events
  for each row execute function public.erp_retail_pos_append_only();

alter table public.retail_pos_devices enable row level security;
alter table public.retail_pos_shifts enable row level security;
alter table public.retail_pos_transactions enable row level security;
alter table public.retail_pos_transaction_items enable row level security;
alter table public.retail_pos_transaction_payments enable row level security;
alter table public.retail_pos_approval_requests enable row level security;
alter table public.retail_pos_device_events enable row level security;
alter table public.retail_pos_device_commands enable row level security;

create policy retail_pos_devices_read on public.retail_pos_devices for select to authenticated
  using (public.erp_retail_pos_portal_allowed(restaurant_id) and public.erp_can_access_scope(restaurant_id, branch_id));
create policy retail_pos_devices_write on public.retail_pos_devices for insert to authenticated
  with check (public.erp_retail_pos_portal_allowed(restaurant_id) and public.erp_can_write_scope(restaurant_id, branch_id));
create policy retail_pos_devices_update on public.retail_pos_devices for update to authenticated
  using (public.erp_can_write_scope(restaurant_id, branch_id))
  with check (public.erp_retail_pos_portal_allowed(restaurant_id) and public.erp_can_write_scope(restaurant_id, branch_id));

create policy retail_pos_shifts_read on public.retail_pos_shifts for select to authenticated
  using (public.erp_retail_pos_portal_allowed(restaurant_id) and public.erp_can_access_scope(restaurant_id, branch_id));
create policy retail_pos_shifts_insert on public.retail_pos_shifts for insert to authenticated
  with check (
    public.erp_retail_pos_portal_allowed(restaurant_id)
    and public.erp_can_access_scope(restaurant_id, branch_id)
    and (cashier_user_id = (select auth.uid()) or public.erp_can_write_scope(restaurant_id, branch_id))
  );
create policy retail_pos_shifts_update on public.retail_pos_shifts for update to authenticated
  using (
    public.erp_can_access_scope(restaurant_id, branch_id)
    and (cashier_user_id = (select auth.uid()) or public.erp_can_write_scope(restaurant_id, branch_id))
  )
  with check (
    public.erp_retail_pos_portal_allowed(restaurant_id)
    and public.erp_can_access_scope(restaurant_id, branch_id)
    and (cashier_user_id = (select auth.uid()) or public.erp_can_write_scope(restaurant_id, branch_id))
  );

create policy retail_pos_transactions_read on public.retail_pos_transactions for select to authenticated
  using (public.erp_retail_pos_portal_allowed(restaurant_id) and public.erp_can_access_scope(restaurant_id, branch_id));
create policy retail_pos_transactions_insert on public.retail_pos_transactions for insert to authenticated
  with check (
    public.erp_retail_pos_portal_allowed(restaurant_id)
    and public.erp_can_access_scope(restaurant_id, branch_id)
    and (cashier_user_id = (select auth.uid()) or public.erp_can_write_scope(restaurant_id, branch_id))
  );

create policy retail_pos_items_read on public.retail_pos_transaction_items for select to authenticated
  using (public.erp_retail_pos_portal_allowed(restaurant_id) and public.erp_can_access_scope(restaurant_id, branch_id));
create policy retail_pos_items_insert on public.retail_pos_transaction_items for insert to authenticated
  with check (
    public.erp_retail_pos_portal_allowed(restaurant_id)
    and public.erp_can_access_scope(restaurant_id, branch_id)
    and (created_by = (select auth.uid()) or public.erp_can_write_scope(restaurant_id, branch_id))
  );

create policy retail_pos_payments_read on public.retail_pos_transaction_payments for select to authenticated
  using (public.erp_retail_pos_portal_allowed(restaurant_id) and public.erp_can_access_scope(restaurant_id, branch_id));
create policy retail_pos_payments_insert on public.retail_pos_transaction_payments for insert to authenticated
  with check (
    public.erp_retail_pos_portal_allowed(restaurant_id)
    and public.erp_can_access_scope(restaurant_id, branch_id)
    and (created_by = (select auth.uid()) or public.erp_can_write_scope(restaurant_id, branch_id))
  );

create policy retail_pos_approvals_read on public.retail_pos_approval_requests for select to authenticated
  using (public.erp_retail_pos_portal_allowed(restaurant_id) and public.erp_can_access_scope(restaurant_id, branch_id));
create policy retail_pos_approvals_insert on public.retail_pos_approval_requests for insert to authenticated
  with check (public.erp_retail_pos_portal_allowed(restaurant_id) and public.erp_can_access_scope(restaurant_id, branch_id));
create policy retail_pos_approvals_update on public.retail_pos_approval_requests for update to authenticated
  using (public.erp_can_write_scope(restaurant_id, branch_id))
  with check (public.erp_retail_pos_portal_allowed(restaurant_id) and public.erp_can_write_scope(restaurant_id, branch_id));

create policy retail_pos_events_read on public.retail_pos_device_events for select to authenticated
  using (public.erp_retail_pos_portal_allowed(restaurant_id) and public.erp_can_access_scope(restaurant_id, branch_id));
create policy retail_pos_events_insert on public.retail_pos_device_events for insert to authenticated
  with check (public.erp_retail_pos_portal_allowed(restaurant_id) and public.erp_can_access_scope(restaurant_id, branch_id));

create policy retail_pos_commands_read on public.retail_pos_device_commands for select to authenticated
  using (public.erp_retail_pos_portal_allowed(restaurant_id) and public.erp_can_access_scope(restaurant_id, branch_id));
create policy retail_pos_commands_insert on public.retail_pos_device_commands for insert to authenticated
  with check (public.erp_retail_pos_portal_allowed(restaurant_id) and public.erp_can_write_scope(restaurant_id, branch_id));
create policy retail_pos_commands_update on public.retail_pos_device_commands for update to authenticated
  using (public.erp_can_write_scope(restaurant_id, branch_id))
  with check (public.erp_retail_pos_portal_allowed(restaurant_id) and public.erp_can_write_scope(restaurant_id, branch_id));

revoke all on table public.retail_pos_devices from public, anon, authenticated;
revoke all on table public.retail_pos_shifts from public, anon, authenticated;
revoke all on table public.retail_pos_transactions from public, anon, authenticated;
revoke all on table public.retail_pos_transaction_items from public, anon, authenticated;
revoke all on table public.retail_pos_transaction_payments from public, anon, authenticated;
revoke all on table public.retail_pos_approval_requests from public, anon, authenticated;
revoke all on table public.retail_pos_device_events from public, anon, authenticated;
revoke all on table public.retail_pos_device_commands from public, anon, authenticated;

grant select on table public.retail_pos_devices to authenticated;
grant select on table public.retail_pos_shifts to authenticated;
grant select on table public.retail_pos_transactions to authenticated;
grant select on table public.retail_pos_transaction_items to authenticated;
grant select on table public.retail_pos_transaction_payments to authenticated;
grant select on table public.retail_pos_approval_requests to authenticated;
grant select on table public.retail_pos_device_events to authenticated;
grant select on table public.retail_pos_device_commands to authenticated;
grant all on table public.retail_pos_devices to service_role;
grant all on table public.retail_pos_shifts to service_role;
grant all on table public.retail_pos_transactions to service_role;
grant all on table public.retail_pos_transaction_items to service_role;
grant all on table public.retail_pos_transaction_payments to service_role;
grant all on table public.retail_pos_approval_requests to service_role;
grant all on table public.retail_pos_device_events to service_role;
grant all on table public.retail_pos_device_commands to service_role;

create or replace function public.erp_retail_pos_seed_branch_devices(
  p_branch_id uuid,
  p_count integer default 10
)
returns setof public.retail_pos_devices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid;
begin
  if p_count < 1 or p_count > 50 then
    raise exception 'POS device count must be between 1 and 50' using errcode = '22023';
  end if;
  select branch.restaurant_id into v_restaurant_id
  from public.branches branch
  where branch.id = p_branch_id;
  if v_restaurant_id is null
    or not public.erp_retail_pos_portal_allowed(v_restaurant_id)
    or not public.erp_can_write_scope(v_restaurant_id, p_branch_id) then
    raise exception 'POS device provisioning is not allowed for this branch' using errcode = '42501';
  end if;

  insert into public.retail_pos_devices (restaurant_id, branch_id, code, display_name)
  select v_restaurant_id, p_branch_id,
    'POS-' || lpad(series.number::text, 2, '0'),
    'Cashier lane ' || lpad(series.number::text, 2, '0')
  from generate_series(1, p_count) as series(number)
  on conflict (restaurant_id, branch_id, code) do nothing;

  return query
  select device.*
  from public.retail_pos_devices device
  where device.restaurant_id = v_restaurant_id
    and device.branch_id = p_branch_id
  order by device.code;
end;
$$;

create or replace function public.erp_retail_pos_heartbeat(
  p_device_id uuid,
  p_state jsonb default '{}'::jsonb
)
returns public.retail_pos_devices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.retail_pos_devices;
  v_status text := lower(coalesce(nullif(p_state ->> 'status', ''), 'online'));
  v_scanner text := lower(coalesce(nullif(p_state ->> 'scanner_status', ''), 'online'));
  v_printer text := lower(coalesce(nullif(p_state ->> 'printer_status', ''), 'online'));
  v_drawer text := lower(coalesce(nullif(p_state ->> 'cash_drawer_status', ''), 'online'));
begin
  if jsonb_typeof(coalesce(p_state, '{}'::jsonb)) <> 'object' then
    raise exception 'POS heartbeat state must be an object' using errcode = '22023';
  end if;
  select * into v_device from public.retail_pos_devices where id = p_device_id;
  if v_device.id is null
    or not (
      coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      or public.erp_can_access_scope(v_device.restaurant_id, v_device.branch_id)
    ) then
    raise exception 'POS heartbeat access denied' using errcode = '42501';
  end if;
  if v_status not in ('online', 'offline', 'maintenance', 'locked', 'retired')
    or v_scanner not in ('online', 'offline', 'error', 'not_configured')
    or v_printer not in ('online', 'offline', 'error', 'not_configured')
    or v_drawer not in ('online', 'offline', 'error', 'open', 'not_configured') then
    raise exception 'Invalid POS hardware state' using errcode = '22023';
  end if;

  update public.retail_pos_devices
  set status = v_status,
      scanner_status = v_scanner,
      printer_status = v_printer,
      cash_drawer_status = v_drawer,
      network_latency_ms = coalesce(nullif(p_state ->> 'network_latency_ms', '')::integer, network_latency_ms),
      serial_number = coalesce(nullif(btrim(p_state ->> 'serial_number'), ''), serial_number),
      metadata = metadata || case when jsonb_typeof(p_state -> 'metadata') = 'object' then p_state -> 'metadata' else '{}'::jsonb end,
      last_seen_at = now()
  where id = v_device.id
  returning * into v_device;
  return v_device;
end;
$$;

create or replace function public.erp_retail_pos_open_shift(
  p_device_id uuid,
  p_cashier_name text,
  p_opening_cash numeric default 0,
  p_shift_name text default 'default'
)
returns public.retail_pos_shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.retail_pos_devices;
  v_shift public.retail_pos_shifts;
begin
  select * into v_device from public.retail_pos_devices where id = p_device_id;
  if v_device.id is null
    or not public.erp_retail_pos_portal_allowed(v_device.restaurant_id)
    or not public.erp_can_access_scope(v_device.restaurant_id, v_device.branch_id) then
    raise exception 'POS shift access denied' using errcode = '42501';
  end if;
  if auth.uid() is null or nullif(btrim(p_cashier_name), '') is null then
    raise exception 'Authenticated cashier name is required' using errcode = '22023';
  end if;
  if coalesce(p_opening_cash, 0) < 0 then
    raise exception 'Opening cash cannot be negative' using errcode = '22023';
  end if;

  select * into v_shift from public.retail_pos_shifts
  where device_id = v_device.id and status in ('open', 'closing', 'suspended')
  order by opened_at desc limit 1;
  if v_shift.id is not null then
    if not (
      (auth.uid() is not null and v_shift.cashier_user_id = auth.uid())
      or public.erp_can_write_scope(v_shift.restaurant_id, v_shift.branch_id)
    ) then
      raise exception 'This POS already has an active cashier shift' using errcode = '55000';
    end if;
    return v_shift;
  end if;

  insert into public.retail_pos_shifts (
    restaurant_id, branch_id, device_id, cashier_user_id, cashier_name,
    shift_name, opening_cash
  ) values (
    v_device.restaurant_id, v_device.branch_id, v_device.id, auth.uid(), btrim(p_cashier_name),
    coalesce(nullif(btrim(p_shift_name), ''), 'default'), coalesce(p_opening_cash, 0)
  ) returning * into v_shift;

  update public.retail_pos_devices set status = 'online', last_seen_at = now() where id = v_device.id;
  insert into public.retail_pos_device_events (
    restaurant_id, branch_id, device_id, shift_id, event_type, severity, title, details
  ) values (
    v_shift.restaurant_id, v_shift.branch_id, v_shift.device_id, v_shift.id,
    'shift_opened', 'info', 'Cashier shift opened', jsonb_build_object('cashier_name', v_shift.cashier_name, 'opening_cash', v_shift.opening_cash)
  );
  return v_shift;
end;
$$;

create or replace function public.erp_retail_pos_request_command(
  p_device_id uuid,
  p_command_type text,
  p_payload jsonb default '{}'::jsonb
)
returns public.retail_pos_device_commands
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.retail_pos_devices;
  v_command public.retail_pos_device_commands;
begin
  select * into v_device from public.retail_pos_devices where id = p_device_id;
  if v_device.id is null
    or not public.erp_can_write_scope(v_device.restaurant_id, v_device.branch_id) then
    raise exception 'POS command access denied' using errcode = '42501';
  end if;
  if p_command_type not in ('lock', 'unlock', 'sync', 'restart', 'remote_support') then
    raise exception 'Unsupported POS command' using errcode = '22023';
  end if;
  insert into public.retail_pos_device_commands (
    restaurant_id, branch_id, device_id, command_type, payload
  ) values (
    v_device.restaurant_id, v_device.branch_id, v_device.id, p_command_type,
    case when jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) = 'object' then coalesce(p_payload, '{}'::jsonb) else '{}'::jsonb end
  ) returning * into v_command;

  insert into public.retail_pos_device_events (
    restaurant_id, branch_id, device_id, event_type, severity, title, details
  ) values (
    v_device.restaurant_id, v_device.branch_id, v_device.id,
    'command_queued', 'info', 'Remote command queued',
    jsonb_build_object('command_id', v_command.id, 'command_type', p_command_type)
  );
  return v_command;
end;
$$;

create or replace function public.erp_retail_pos_acknowledge_command(
  p_command_id uuid,
  p_status text,
  p_result jsonb default '{}'::jsonb
)
returns public.retail_pos_device_commands
language plpgsql
security definer
set search_path = public
as $$
declare
  v_command public.retail_pos_device_commands;
  v_status text := lower(coalesce(p_status, ''));
begin
  if v_status not in ('acknowledged', 'completed', 'failed')
    or jsonb_typeof(coalesce(p_result, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid POS command result' using errcode = '22023';
  end if;
  select * into v_command from public.retail_pos_device_commands where id = p_command_id for update;
  if v_command.id is null
    or not (
      coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      or public.erp_can_access_scope(v_command.restaurant_id, v_command.branch_id)
    ) then
    raise exception 'POS command acknowledgement denied' using errcode = '42501';
  end if;
  if v_command.status not in ('queued', 'acknowledged') then return v_command; end if;

  update public.retail_pos_device_commands
  set status = v_status,
      acknowledged_at = case when v_status = 'acknowledged' then now() else coalesce(acknowledged_at, now()) end,
      completed_at = case when v_status in ('completed', 'failed') then now() else completed_at end,
      payload = payload || jsonb_build_object('result', coalesce(p_result, '{}'::jsonb))
  where id = v_command.id
  returning * into v_command;

  insert into public.retail_pos_device_events (
    restaurant_id, branch_id, device_id, event_type, severity, title, details
  ) values (
    v_command.restaurant_id, v_command.branch_id, v_command.device_id,
    'command_' || v_status, case when v_status = 'failed' then 'warning' else 'info' end,
    'Remote command ' || v_status, jsonb_build_object('command_id', v_command.id, 'command_type', v_command.command_type)
  );
  return v_command;
end;
$$;

create or replace function public.erp_retail_pos_request_approval(
  p_shift_id uuid,
  p_transaction_id uuid,
  p_request_type text,
  p_amount numeric,
  p_reason text
)
returns public.retail_pos_approval_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.retail_pos_shifts;
  v_request public.retail_pos_approval_requests;
  v_type text := lower(coalesce(p_request_type, ''));
begin
  select * into v_shift from public.retail_pos_shifts where id = p_shift_id;
  if v_shift.id is null
    or (v_type = 'shift_reopen' and v_shift.status <> 'closed')
    or (v_type <> 'shift_reopen' and v_shift.status not in ('open', 'closing', 'suspended'))
    or not public.erp_retail_pos_portal_allowed(v_shift.restaurant_id)
    or not (
      (auth.uid() is not null and v_shift.cashier_user_id = auth.uid())
      or public.erp_can_write_scope(v_shift.restaurant_id, v_shift.branch_id)
    ) then
    raise exception 'POS approval request access denied' using errcode = '42501';
  end if;
  if v_type not in ('refund', 'void', 'discount', 'shift_reopen', 'device_unlock')
    or nullif(btrim(p_reason), '') is null or coalesce(p_amount, 0) < 0 then
    raise exception 'Invalid POS approval request' using errcode = '22023';
  end if;
  if v_type in ('refund', 'void') and p_transaction_id is null then
    raise exception 'Refund and void require an original transaction' using errcode = '22023';
  end if;
  if p_transaction_id is not null and not exists (
    select 1 from public.retail_pos_transactions transaction
    where transaction.id = p_transaction_id
      and transaction.restaurant_id = v_shift.restaurant_id
      and transaction.branch_id = v_shift.branch_id
      and transaction.device_id = v_shift.device_id
  ) then
    raise exception 'Approval transaction is outside this POS scope' using errcode = '23503';
  end if;

  insert into public.retail_pos_approval_requests (
    restaurant_id, branch_id, device_id, shift_id, transaction_id,
    request_type, amount, reason, requested_by
  ) values (
    v_shift.restaurant_id, v_shift.branch_id, v_shift.device_id, v_shift.id, p_transaction_id,
    v_type, coalesce(p_amount, 0), btrim(p_reason), auth.uid()
  ) returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.erp_retail_pos_review_approval(
  p_request_id uuid,
  p_decision text,
  p_notes text default null
)
returns public.retail_pos_approval_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.retail_pos_approval_requests;
begin
  select * into v_request
  from public.retail_pos_approval_requests
  where id = p_request_id
  for update;
  if v_request.id is null
    or not public.erp_can_write_scope(v_request.restaurant_id, v_request.branch_id) then
    raise exception 'POS approval access denied' using errcode = '42501';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'POS approval request is already finalized' using errcode = '55000';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected' using errcode = '22023';
  end if;
  update public.retail_pos_approval_requests
  set status = p_decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = nullif(btrim(p_notes), '')
  where id = p_request_id
  returning * into v_request;

  insert into public.retail_pos_device_events (
    restaurant_id, branch_id, device_id, shift_id, transaction_id,
    event_type, severity, title, details
  ) values (
    v_request.restaurant_id, v_request.branch_id, v_request.device_id,
    v_request.shift_id, v_request.transaction_id,
    'approval_reviewed', 'info', 'Approval request reviewed',
    jsonb_build_object('request_id', v_request.id, 'decision', p_decision)
  );
  return v_request;
end;
$$;

create or replace function public.erp_retail_pos_close_shift(
  p_shift_id uuid,
  p_counted_cash numeric,
  p_notes text default null
)
returns public.retail_pos_shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.retail_pos_shifts;
  v_cash_total numeric(16,2);
begin
  select * into v_shift from public.retail_pos_shifts where id = p_shift_id for update;
  if v_shift.id is null
    or not public.erp_can_access_scope(v_shift.restaurant_id, v_shift.branch_id)
    or not (
      (auth.uid() is not null and v_shift.cashier_user_id = auth.uid())
      or public.erp_can_write_scope(v_shift.restaurant_id, v_shift.branch_id)
    ) then
    raise exception 'POS shift close access denied' using errcode = '42501';
  end if;
  if v_shift.status not in ('open', 'closing', 'suspended') then
    raise exception 'POS shift is already closed' using errcode = '55000';
  end if;
  if p_counted_cash < 0 then
    raise exception 'Counted cash cannot be negative' using errcode = '22023';
  end if;

  select coalesce(sum(
    case transaction.transaction_type
      when 'sale' then payment.amount
      when 'refund' then -payment.amount
      when 'void' then -payment.amount
      else 0
    end
  ) filter (where payment.payment_method = 'cash' and transaction.status in ('posted', 'approved')), 0)
  into v_cash_total
  from public.retail_pos_transaction_payments payment
  join public.retail_pos_transactions transaction on transaction.id = payment.transaction_id
  where payment.shift_id = v_shift.id;

  update public.retail_pos_shifts
  set status = 'closed',
      closed_at = now(),
      expected_cash = opening_cash + v_cash_total,
      counted_cash = p_counted_cash,
      cash_difference = p_counted_cash - (opening_cash + v_cash_total),
      notes = coalesce(nullif(btrim(p_notes), ''), notes),
      updated_by = auth.uid()
  where id = v_shift.id
  returning * into v_shift;

  insert into public.retail_pos_device_events (
    restaurant_id, branch_id, device_id, shift_id,
    event_type, severity, title, details
  ) values (
    v_shift.restaurant_id, v_shift.branch_id, v_shift.device_id, v_shift.id,
    'shift_closed',
    case when abs(coalesce(v_shift.cash_difference, 0)) > 20 then 'warning' else 'info' end,
    'Cashier shift closed',
    jsonb_build_object('expected_cash', v_shift.expected_cash, 'counted_cash', v_shift.counted_cash, 'cash_difference', v_shift.cash_difference)
  );
  return v_shift;
end;
$$;

create or replace function public.erp_retail_pos_record_transaction(p_payload jsonb)
returns public.retail_pos_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.retail_pos_shifts;
  v_transaction public.retail_pos_transactions;
  v_existing public.retail_pos_transactions;
  v_type text := lower(coalesce(p_payload ->> 'transaction_type', 'sale'));
  v_status text := 'posted';
  v_net_total numeric(16,2) := coalesce(nullif(p_payload ->> 'net_total', '')::numeric, 0);
  v_payment_total numeric(16,2);
  v_original_id uuid := nullif(p_payload ->> 'original_transaction_id', '')::uuid;
  v_idempotency_key text := nullif(btrim(p_payload ->> 'idempotency_key'), '');
  v_approval_id uuid := nullif(p_payload ->> 'approval_request_id', '')::uuid;
begin
  if v_idempotency_key is null then
    raise exception 'Transaction idempotency key is required' using errcode = '22023';
  end if;
  select * into v_shift
  from public.retail_pos_shifts
  where id = nullif(p_payload ->> 'shift_id', '')::uuid
  for update;
  if v_shift.id is null or v_shift.status <> 'open' then
    raise exception 'An open POS shift is required' using errcode = '55000';
  end if;
  if not public.erp_retail_pos_portal_allowed(v_shift.restaurant_id)
    or not public.erp_can_access_scope(v_shift.restaurant_id, v_shift.branch_id)
    or not (
      (auth.uid() is not null and v_shift.cashier_user_id = auth.uid())
      or public.erp_can_write_scope(v_shift.restaurant_id, v_shift.branch_id)
    ) then
    raise exception 'POS transaction access denied' using errcode = '42501';
  end if;
  select * into v_existing
  from public.retail_pos_transactions
  where restaurant_id = v_shift.restaurant_id
    and idempotency_key = v_idempotency_key;
  if v_existing.id is not null then return v_existing; end if;

  if v_type not in ('sale', 'refund', 'void') then
    raise exception 'Unsupported transaction type' using errcode = '22023';
  end if;
  if v_type in ('refund', 'void') then
    if v_original_id is null then
      raise exception 'Refund and void require the original transaction' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.retail_pos_approval_requests request
      where request.id = v_approval_id
        and request.restaurant_id = v_shift.restaurant_id
        and request.branch_id = v_shift.branch_id
        and request.device_id = v_shift.device_id
        and request.transaction_id = v_original_id
        and request.request_type = v_type
        and request.status = 'approved'
    ) then
      raise exception 'An approved request is required for refund or void' using errcode = '42501';
    end if;
  end if;

  select coalesce(sum(coalesce(nullif(payment ->> 'amount', '')::numeric, 0)), 0)
  into v_payment_total
  from jsonb_array_elements(coalesce(p_payload -> 'payments', '[]'::jsonb)) payment;
  if abs(v_payment_total - v_net_total) > 0.01 then
    raise exception 'Payment total must equal transaction net total' using errcode = '22023';
  end if;

  insert into public.retail_pos_transactions (
    restaurant_id, branch_id, device_id, shift_id, original_transaction_id,
    receipt_number, idempotency_key, transaction_type, status,
    cashier_user_id, cashier_name, business_date,
    subtotal, discount_total, tax_total, net_total, item_count, notes, occurred_at
  ) values (
    v_shift.restaurant_id, v_shift.branch_id, v_shift.device_id, v_shift.id, v_original_id,
    nullif(btrim(p_payload ->> 'receipt_number'), ''), v_idempotency_key, v_type, v_status,
    coalesce(nullif(p_payload ->> 'cashier_user_id', '')::uuid, v_shift.cashier_user_id),
    coalesce(nullif(btrim(p_payload ->> 'cashier_name'), ''), v_shift.cashier_name),
    coalesce(nullif(p_payload ->> 'business_date', '')::date, (timezone('Asia/Riyadh', now()))::date),
    coalesce(nullif(p_payload ->> 'subtotal', '')::numeric, v_net_total),
    coalesce(nullif(p_payload ->> 'discount_total', '')::numeric, 0),
    coalesce(nullif(p_payload ->> 'tax_total', '')::numeric, 0),
    v_net_total,
    coalesce(nullif(p_payload ->> 'item_count', '')::integer, jsonb_array_length(coalesce(p_payload -> 'items', '[]'::jsonb))),
    nullif(btrim(p_payload ->> 'notes'), ''),
    coalesce(nullif(p_payload ->> 'occurred_at', '')::timestamptz, now())
  ) returning * into v_transaction;

  insert into public.retail_pos_transaction_items (
    transaction_id, restaurant_id, branch_id, device_id, shift_id,
    product_id, sku, product_name, quantity, unit_price, discount_total, tax_total, line_total
  )
  select v_transaction.id, v_transaction.restaurant_id, v_transaction.branch_id, v_transaction.device_id, v_transaction.shift_id,
    nullif(item ->> 'product_id', '')::uuid,
    nullif(item ->> 'sku', ''), coalesce(nullif(item ->> 'product_name', ''), 'Item'),
    coalesce(nullif(item ->> 'quantity', '')::numeric, 1),
    coalesce(nullif(item ->> 'unit_price', '')::numeric, 0),
    coalesce(nullif(item ->> 'discount_total', '')::numeric, 0),
    coalesce(nullif(item ->> 'tax_total', '')::numeric, 0),
    coalesce(nullif(item ->> 'line_total', '')::numeric, 0)
  from jsonb_array_elements(coalesce(p_payload -> 'items', '[]'::jsonb)) item;

  insert into public.retail_pos_transaction_payments (
    transaction_id, restaurant_id, branch_id, device_id, shift_id,
    payment_method, amount, provider, reference
  )
  select v_transaction.id, v_transaction.restaurant_id, v_transaction.branch_id, v_transaction.device_id, v_transaction.shift_id,
    lower(payment ->> 'payment_method'),
    coalesce(nullif(payment ->> 'amount', '')::numeric, 0),
    nullif(payment ->> 'provider', ''), nullif(payment ->> 'reference', '')
  from jsonb_array_elements(coalesce(p_payload -> 'payments', '[]'::jsonb)) payment;

  update public.retail_pos_devices
  set status = 'online', last_seen_at = now()
  where id = v_shift.device_id;

  return v_transaction;
end;
$$;

create or replace function public.erp_retail_pos_control_snapshot(
  p_restaurant_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_branch_id uuid default null,
  p_device_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
  v_from timestamptz := coalesce(p_from, date_trunc('day', now()));
  v_to timestamptz := coalesce(p_to, now());
begin
  if p_restaurant_id is null
    or not public.erp_retail_pos_portal_allowed(p_restaurant_id)
    or not public.erp_can_access_scope(p_restaurant_id, p_branch_id) then
    raise exception 'Retail POS Control access denied' using errcode = '42501';
  end if;
  if v_to <= v_from or v_to - v_from > interval '370 days' then
    raise exception 'Invalid POS report period' using errcode = '22023';
  end if;

  with scoped_transactions as (
    select transaction.*,
      case when transaction.transaction_type = 'sale' then transaction.net_total
           when transaction.transaction_type in ('refund', 'void') then -transaction.net_total
           else 0 end as signed_total
    from public.retail_pos_transactions transaction
    where transaction.restaurant_id = p_restaurant_id
      and transaction.occurred_at >= v_from and transaction.occurred_at < v_to
      and transaction.status in ('posted', 'approved')
      and (p_branch_id is null or transaction.branch_id = p_branch_id)
      and (p_device_id is null or transaction.device_id = p_device_id)
  ),
  scoped_payments as (
    select payment.device_id, payment.branch_id, payment.payment_method,
      sum(case when transaction.transaction_type = 'sale' then payment.amount
               when transaction.transaction_type in ('refund', 'void') then -payment.amount
               else 0 end) as amount
    from public.retail_pos_transaction_payments payment
    join scoped_transactions transaction on transaction.id = payment.transaction_id
    group by payment.device_id, payment.branch_id, payment.payment_method
  ),
  transaction_totals as (
    select transaction.device_id, transaction.branch_id,
      count(*) filter (where transaction.transaction_type = 'sale') as transaction_count,
      coalesce(sum(transaction.signed_total), 0) as net_sales,
      coalesce(sum(transaction.net_total) filter (where transaction.transaction_type = 'refund'), 0) as refunds,
      coalesce(sum(transaction.net_total) filter (where transaction.transaction_type = 'void'), 0) as voids,
      coalesce(sum(transaction.discount_total) filter (where transaction.transaction_type = 'sale'), 0) as discounts
    from scoped_transactions transaction
    group by transaction.device_id, transaction.branch_id
  ),
  device_rows as (
    select device.id, device.restaurant_id, device.branch_id, device.code, device.display_name,
      device.serial_number, device.status, device.scanner_status, device.printer_status,
      device.cash_drawer_status, device.network_latency_ms, device.last_seen_at,
      branch.name as branch_name,
      shift.id as shift_id, shift.cashier_user_id, shift.cashier_employee_id,
      shift.cashier_name, shift.shift_name, shift.status as shift_status,
      shift.opened_at, shift.opening_cash, shift.expected_cash, shift.counted_cash, shift.cash_difference,
      coalesce(total.transaction_count, 0) as transaction_count,
      coalesce(total.net_sales, 0) as net_sales,
      coalesce(total.refunds, 0) as refunds,
      coalesce(total.voids, 0) as voids,
      coalesce(total.discounts, 0) as discounts,
      coalesce((select sum(payment.amount) from scoped_payments payment where payment.device_id = device.id and payment.payment_method = 'cash'), 0) as cash_total,
      coalesce((select sum(payment.amount) from scoped_payments payment where payment.device_id = device.id and payment.payment_method = 'mada'), 0) as mada_total,
      coalesce((select sum(payment.amount) from scoped_payments payment where payment.device_id = device.id and payment.payment_method = 'apple_pay'), 0) as apple_pay_total,
      coalesce((select sum(payment.amount) from scoped_payments payment where payment.device_id = device.id and payment.payment_method = 'credit'), 0) as credit_total
    from public.retail_pos_devices device
    join public.branches branch on branch.id = device.branch_id
    left join transaction_totals total on total.device_id = device.id
    left join lateral (
      select current_shift.*
      from public.retail_pos_shifts current_shift
      where current_shift.device_id = device.id
      order by (current_shift.status in ('open', 'closing', 'suspended')) desc,
        current_shift.opened_at desc
      limit 1
    ) shift on true
    where device.restaurant_id = p_restaurant_id
      and (p_branch_id is null or device.branch_id = p_branch_id)
      and (p_device_id is null or device.id = p_device_id)
  ),
  branch_rows as (
    select branch.id, branch.name,
      count(device.id) as device_count,
      count(device.id) filter (where device.status = 'online' and device.last_seen_at >= now() - interval '5 minutes') as online_device_count,
      coalesce(sum(device.net_sales), 0) as net_sales,
      coalesce(sum(device.transaction_count), 0) as transaction_count,
      coalesce(sum(device.cash_total), 0) as cash_total,
      coalesce(sum(device.mada_total), 0) as mada_total,
      coalesce(sum(device.apple_pay_total), 0) as apple_pay_total,
      coalesce(sum(device.credit_total), 0) as credit_total,
      coalesce(sum(device.refunds), 0) as refunds,
      coalesce(sum(device.voids), 0) as voids,
      coalesce(sum(device.cash_difference) filter (where device.shift_status = 'closed'), 0) as cash_difference
    from public.branches branch
    left join device_rows device on device.branch_id = branch.id
    where branch.restaurant_id = p_restaurant_id
      and coalesce(branch.is_active, true)
      and (p_branch_id is null or branch.id = p_branch_id)
    group by branch.id, branch.name
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'summary', jsonb_build_object(
      'branch_count', (select count(*) from branch_rows),
      'device_count', (select coalesce(sum(device_count), 0) from branch_rows),
      'online_device_count', (select coalesce(sum(online_device_count), 0) from branch_rows),
      'transaction_count', (select coalesce(sum(transaction_count), 0) from branch_rows),
      'net_sales', (select coalesce(sum(net_sales), 0) from branch_rows),
      'cash_total', (select coalesce(sum(cash_total), 0) from branch_rows),
      'mada_total', (select coalesce(sum(mada_total), 0) from branch_rows),
      'apple_pay_total', (select coalesce(sum(apple_pay_total), 0) from branch_rows),
      'credit_total', (select coalesce(sum(credit_total), 0) from branch_rows),
      'refunds', (select coalesce(sum(refunds), 0) from branch_rows),
      'voids', (select coalesce(sum(voids), 0) from branch_rows),
      'purchase_total', (
        select coalesce(sum(coalesce(purchase.qty, 0) * coalesce(purchase.used_price, purchase.current_price, 0)), 0)
        from public.purchases purchase
        where purchase.restaurant_id = p_restaurant_id
          and purchase.date >= (timezone('Asia/Riyadh', v_from))::date
          and purchase.date < (timezone('Asia/Riyadh', v_to))::date
          and (p_branch_id is null or purchase.branch_id = p_branch_id)
      ),
      'expense_total', (
        select coalesce(sum(expense.amount), 0)
        from public.expenses expense
        where expense.restaurant_id = p_restaurant_id
          and expense.date >= (timezone('Asia/Riyadh', v_from))::date
          and expense.date < (timezone('Asia/Riyadh', v_to))::date
          and (p_branch_id is null or expense.branch_id = p_branch_id)
      ),
      'pending_approvals', (
        select count(*) from public.retail_pos_approval_requests request
        where request.restaurant_id = p_restaurant_id and request.status = 'pending'
          and (p_branch_id is null or request.branch_id = p_branch_id)
      ),
      'critical_alerts', (
        select count(*) from public.retail_pos_device_events event
        where event.restaurant_id = p_restaurant_id and event.severity = 'critical'
          and event.occurred_at >= v_from and event.occurred_at < v_to
          and (p_branch_id is null or event.branch_id = p_branch_id)
      )
    ),
    'branches', coalesce((select jsonb_agg(to_jsonb(branch_rows) order by net_sales desc, name) from branch_rows), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(to_jsonb(device_rows) order by branch_name, code) from device_rows), '[]'::jsonb),
    'sales_series', coalesce((
      select jsonb_agg(to_jsonb(hour_row) order by hour_row.hour)
      from (
        select date_trunc('hour', transaction.occurred_at) as hour,
          coalesce(sum(transaction.signed_total), 0) as net_sales,
          count(*) filter (where transaction.transaction_type = 'sale') as transaction_count
        from scoped_transactions transaction
        group by date_trunc('hour', transaction.occurred_at)
      ) hour_row
    ), '[]'::jsonb),
    'transactions', coalesce((
      select jsonb_agg(to_jsonb(recent_transaction) order by recent_transaction.occurred_at desc)
      from (
        select transaction.id, transaction.branch_id, transaction.device_id, transaction.shift_id,
          transaction.receipt_number, transaction.transaction_type, transaction.status,
          transaction.cashier_name, transaction.item_count, transaction.net_total,
          transaction.tax_total, transaction.discount_total, transaction.occurred_at,
          branch.name as branch_name, device.code as device_code,
          coalesce((
            select jsonb_agg(jsonb_build_object('method', payment.payment_method, 'amount', payment.amount) order by payment.created_at)
            from public.retail_pos_transaction_payments payment
            where payment.transaction_id = transaction.id
          ), '[]'::jsonb) as payments
        from scoped_transactions transaction
        join public.branches branch on branch.id = transaction.branch_id
        join public.retail_pos_devices device on device.id = transaction.device_id
        order by transaction.occurred_at desc
        limit 100
      ) recent_transaction
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(recent_event) order by recent_event.occurred_at desc)
      from (
        select event.*, branch.name as branch_name, device.code as device_code
        from public.retail_pos_device_events event
        join public.branches branch on branch.id = event.branch_id
        join public.retail_pos_devices device on device.id = event.device_id
        where event.restaurant_id = p_restaurant_id
          and event.occurred_at >= v_from and event.occurred_at < v_to
          and (p_branch_id is null or event.branch_id = p_branch_id)
          and (p_device_id is null or event.device_id = p_device_id)
        order by event.occurred_at desc
        limit 100
      ) recent_event
    ), '[]'::jsonb),
    'approvals', coalesce((
      select jsonb_agg(to_jsonb(pending_request) order by pending_request.created_at desc)
      from (
        select request.*, branch.name as branch_name, device.code as device_code
        from public.retail_pos_approval_requests request
        join public.branches branch on branch.id = request.branch_id
        join public.retail_pos_devices device on device.id = request.device_id
        where request.restaurant_id = p_restaurant_id
          and (p_branch_id is null or request.branch_id = p_branch_id)
          and (p_device_id is null or request.device_id = p_device_id)
        order by (request.status = 'pending') desc, request.created_at desc
        limit 100
      ) pending_request
    ), '[]'::jsonb)
  ) into v_result;
  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.erp_retail_pos_seed_branch_devices(uuid, integer) from public, anon;
revoke all on function public.erp_retail_pos_heartbeat(uuid, jsonb) from public, anon;
revoke all on function public.erp_retail_pos_open_shift(uuid, text, numeric, text) from public, anon;
revoke all on function public.erp_retail_pos_request_command(uuid, text, jsonb) from public, anon;
revoke all on function public.erp_retail_pos_acknowledge_command(uuid, text, jsonb) from public, anon;
revoke all on function public.erp_retail_pos_request_approval(uuid, uuid, text, numeric, text) from public, anon;
revoke all on function public.erp_retail_pos_review_approval(uuid, text, text) from public, anon;
revoke all on function public.erp_retail_pos_close_shift(uuid, numeric, text) from public, anon;
revoke all on function public.erp_retail_pos_record_transaction(jsonb) from public, anon;
revoke all on function public.erp_retail_pos_control_snapshot(uuid, timestamptz, timestamptz, uuid, uuid) from public, anon;

grant execute on function public.erp_retail_pos_seed_branch_devices(uuid, integer) to authenticated, service_role;
grant execute on function public.erp_retail_pos_heartbeat(uuid, jsonb) to authenticated, service_role;
grant execute on function public.erp_retail_pos_open_shift(uuid, text, numeric, text) to authenticated, service_role;
grant execute on function public.erp_retail_pos_request_command(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.erp_retail_pos_acknowledge_command(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.erp_retail_pos_request_approval(uuid, uuid, text, numeric, text) to authenticated, service_role;
grant execute on function public.erp_retail_pos_review_approval(uuid, text, text) to authenticated, service_role;
grant execute on function public.erp_retail_pos_close_shift(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.erp_retail_pos_record_transaction(jsonb) to authenticated, service_role;
grant execute on function public.erp_retail_pos_control_snapshot(uuid, timestamptz, timestamptz, uuid, uuid) to authenticated, service_role;

alter table public.retail_pos_devices replica identity full;
alter table public.retail_pos_shifts replica identity full;
alter table public.retail_pos_approval_requests replica identity full;
alter table public.retail_pos_device_commands replica identity full;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'retail_pos_devices',
    'retail_pos_shifts',
    'retail_pos_transactions',
    'retail_pos_device_events',
    'retail_pos_approval_requests',
    'retail_pos_device_commands'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end;
$$;

comment on table public.retail_pos_devices is 'Independent supermarket cashier lanes; scanners and payment terminals are hardware states attached to a POS device.';
comment on table public.retail_pos_shifts is 'Cashier sessions and cash reconciliation per POS device.';
comment on table public.retail_pos_transactions is 'Append-only retail POS financial ledger. Refunds and voids are reversal rows.';
comment on function public.erp_retail_pos_control_snapshot(uuid, timestamptz, timestamptz, uuid, uuid) is 'RLS-scoped Retail POS dashboard snapshot for one supermarket, optional branch and device.';
comment on function public.erp_retail_pos_heartbeat(uuid, jsonb) is 'Authenticated POS heartbeat for live device and attached hardware health.';
comment on function public.erp_retail_pos_record_transaction(jsonb) is 'Atomic idempotent POS posting endpoint; direct ledger inserts are not granted to authenticated clients.';

commit;
