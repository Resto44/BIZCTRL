begin;

-- Existing Supabase projects may still auto-grant table privileges to authenticated.
-- Revoke them explicitly so all financial and device writes must use authorized RPCs.
revoke all on table public.retail_pos_devices from authenticated;
revoke all on table public.retail_pos_shifts from authenticated;
revoke all on table public.retail_pos_transactions from authenticated;
revoke all on table public.retail_pos_transaction_items from authenticated;
revoke all on table public.retail_pos_transaction_payments from authenticated;
revoke all on table public.retail_pos_approval_requests from authenticated;
revoke all on table public.retail_pos_device_events from authenticated;
revoke all on table public.retail_pos_device_commands from authenticated;

grant select on table public.retail_pos_devices to authenticated;
grant select on table public.retail_pos_shifts to authenticated;
grant select on table public.retail_pos_transactions to authenticated;
grant select on table public.retail_pos_transaction_items to authenticated;
grant select on table public.retail_pos_transaction_payments to authenticated;
grant select on table public.retail_pos_approval_requests to authenticated;
grant select on table public.retail_pos_device_events to authenticated;
grant select on table public.retail_pos_device_commands to authenticated;

-- Cover every foreign-key lookup used during branch, device, shift and receipt lifecycle operations.
create index if not exists retail_pos_devices_branch_fk_idx
  on public.retail_pos_devices(branch_id);
create index if not exists retail_pos_shifts_employee_fk_idx
  on public.retail_pos_shifts(cashier_employee_id)
  where cashier_employee_id is not null;
create index if not exists retail_pos_shifts_device_scope_fk_idx
  on public.retail_pos_shifts(device_id, restaurant_id, branch_id);
create index if not exists retail_pos_transactions_shift_scope_fk_idx
  on public.retail_pos_transactions(shift_id, restaurant_id, branch_id, device_id);
create index if not exists retail_pos_items_transaction_scope_fk_idx
  on public.retail_pos_transaction_items(transaction_id, restaurant_id, branch_id, device_id, shift_id);
create index if not exists retail_pos_payments_transaction_scope_fk_idx
  on public.retail_pos_transaction_payments(transaction_id, restaurant_id, branch_id, device_id, shift_id);
create index if not exists retail_pos_approvals_device_scope_fk_idx
  on public.retail_pos_approval_requests(device_id, restaurant_id, branch_id);
create index if not exists retail_pos_approvals_shift_scope_fk_idx
  on public.retail_pos_approval_requests(shift_id, restaurant_id, branch_id, device_id)
  where shift_id is not null;
create index if not exists retail_pos_approvals_transaction_scope_fk_idx
  on public.retail_pos_approval_requests(transaction_id, restaurant_id, branch_id, device_id, shift_id)
  where transaction_id is not null;
create index if not exists retail_pos_events_device_scope_fk_idx
  on public.retail_pos_device_events(device_id, restaurant_id, branch_id);
create index if not exists retail_pos_events_shift_scope_fk_idx
  on public.retail_pos_device_events(shift_id, restaurant_id, branch_id, device_id)
  where shift_id is not null;
create index if not exists retail_pos_events_transaction_scope_fk_idx
  on public.retail_pos_device_events(transaction_id, restaurant_id, branch_id, device_id, shift_id)
  where transaction_id is not null;
create index if not exists retail_pos_commands_device_scope_fk_idx
  on public.retail_pos_device_commands(device_id, restaurant_id, branch_id);

commit;
