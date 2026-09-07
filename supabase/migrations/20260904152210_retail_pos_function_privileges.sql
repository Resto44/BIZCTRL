begin;

-- Trigger functions execute through their owning triggers and must not be exposed as RPCs.
revoke all on function public.erp_retail_pos_touch_updated_at()
  from public, anon, authenticated;
revoke all on function public.erp_retail_pos_validate_device_scope()
  from public, anon, authenticated;
revoke all on function public.erp_retail_pos_append_only()
  from public, anon, authenticated;

commit;
