-- The feature gate must use the row's branch for approved branch memberships.
-- Existing driver read permissions and owner-only write policies still apply.
alter policy subscription_feature_drivers on public.drivers
using (
 public.erp_can_access_scope_text(restaurant_id::text, branch_id::text)
 and public.erp_subscription_can_use_feature('driver_analytics', restaurant_id)
)
with check (
 public.erp_can_access_scope_text(restaurant_id::text, branch_id::text)
 and public.erp_subscription_can_use_feature('driver_analytics', restaurant_id)
);
