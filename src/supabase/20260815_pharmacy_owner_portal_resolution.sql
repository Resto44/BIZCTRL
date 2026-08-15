-- Pharmacy Owner portal resolution hardening.
-- The prior onboarding mapping persisted Pharmacy organizations as `retail`.
-- The enum value is added in the preceding dedicated migration; this migration
-- repairs only explicitly Pharmacy records and synchronizes owner membership.

UPDATE public.restaurants
SET business_mode = 'pharmacy'::public.business_mode_type,
    updated_date = now()
WHERE lower(coalesce(business_type::text, '')) = 'pharmacy'
  AND business_mode::text <> 'pharmacy';

CREATE OR REPLACE FUNCTION public.erp_sync_owner_membership_from_restaurant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
BEGIN
  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE email = NEW.org_id
    AND lower(coalesce(role, '')) IN ('owner', 'admin', 'restaurant_admin')
  ORDER BY updated_date DESC NULLS LAST
  LIMIT 1;

  IF v_profile.id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.erp_memberships membership
       WHERE membership.user_id = v_profile.id
         AND membership.restaurant_id = NEW.id
         AND lower(membership.role) = 'owner'
     ) THEN
    INSERT INTO public.erp_memberships (
      user_id, email, full_name, role, status, restaurant_id,
      branch_id, data_scope, approved_at, approved_by
    ) VALUES (
      v_profile.id,
      coalesce(v_profile.email, NEW.org_id),
      coalesce(v_profile.full_name, ''),
      'owner', 'approved', NEW.id,
      NEW.branch_id, 'all_branches', now(), v_profile.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_erp_sync_owner_membership_from_restaurant ON public.restaurants;
CREATE TRIGGER trg_erp_sync_owner_membership_from_restaurant
AFTER INSERT ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.erp_sync_owner_membership_from_restaurant();

INSERT INTO public.erp_memberships (
  user_id, email, full_name, role, status, restaurant_id,
  branch_id, data_scope, approved_at, approved_by
)
SELECT
  profile.id,
  coalesce(profile.email, restaurant.org_id),
  coalesce(profile.full_name, ''),
  'owner', 'approved', restaurant.id,
  restaurant.branch_id, 'all_branches', now(), profile.id
FROM public.restaurants restaurant
JOIN public.profiles profile
  ON profile.email = restaurant.org_id
 AND lower(coalesce(profile.role, '')) IN ('owner', 'admin', 'restaurant_admin')
WHERE lower(coalesce(restaurant.business_type::text, '')) = 'pharmacy'
  AND NOT EXISTS (
    SELECT 1
    FROM public.erp_memberships membership
    WHERE membership.user_id = profile.id
      AND membership.restaurant_id = restaurant.id
      AND lower(membership.role) = 'owner'
  );
