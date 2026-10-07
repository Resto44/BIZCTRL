-- CASE prevents feature snapshot checks on rows outside the caller's scope.
alter policy subscription_feature_drivers on public.drivers
using (case when public.erp_can_access_scope_text(restaurant_id::text, branch_id::text)
 then public.erp_subscription_can_use_feature('driver_analytics', restaurant_id) else false end)
with check (case when public.erp_can_access_scope_text(restaurant_id::text, branch_id::text)
 then public.erp_subscription_can_use_feature('driver_analytics', restaurant_id) else false end);
