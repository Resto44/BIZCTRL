-- Make the Data API grants explicit, independent of project default privileges.
revoke all on public.owner_push_devices, public.owner_record_events from anon, authenticated;
grant select,delete on public.owner_push_devices to authenticated;
grant select on public.owner_record_events to authenticated;
-- Delivery queue is server-only. This policy documents the intentionally closed client surface.
create policy push_delivery_service_only on public.owner_push_deliveries for all to service_role using(true) with check(true);
