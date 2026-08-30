-- Complete canonical employee links for approved legacy memberships and
-- quarantine synthetic E2E identities that have no operational Employee row.

begin;

update public.erp_memberships m
set linked_entity_id = (
      select e.id from public.employees e
      where e.restaurant_id=m.restaurant_id
        and e.branch_id=m.branch_id
        and (
          lower(coalesce(e.email,''))=lower(coalesce(m.email,''))
          or lower(coalesce(e.full_name,''))=lower(coalesce(m.full_name,''))
        )
      order by e.created_date asc limit 1
    ),
    updated_at=now()
where role='employee'
  and status='approved'
  and linked_entity_id is null
  and exists (
    select 1 from public.employees e
    where e.restaurant_id=m.restaurant_id
      and e.branch_id=m.branch_id
      and (
        lower(coalesce(e.email,''))=lower(coalesce(m.email,''))
        or lower(coalesce(e.full_name,''))=lower(coalesce(m.full_name,''))
      )
  );

update public.erp_memberships
set status='suspended',
    registration_data=coalesce(registration_data,'{}'::jsonb)
      || jsonb_build_object('quarantined_at',now(),'quarantine_reason','synthetic_identity_without_employee_record'),
    updated_at=now()
where role='employee'
  and status='approved'
  and linked_entity_id is null
  and (
    lower(coalesce(email,'')) like '%.test'
    or user_id::text like 'e2000000-%'
  );

update public.profiles p
set approval_status='suspended',is_active=false,archived_at=now(),updated_date=now()
where exists (
  select 1 from public.erp_memberships m
  where m.user_id=p.id
    and m.role='employee'
    and m.status='suspended'
    and m.registration_data->>'quarantine_reason'='synthetic_identity_without_employee_record'
);

update public.branch_assignments a
set active=false,is_primary=false,updated_at=now()
where exists (
  select 1 from public.erp_memberships m
  where m.user_id=a.user_id
    and m.role='employee'
    and m.status='suspended'
    and m.registration_data->>'quarantine_reason'='synthetic_identity_without_employee_record'
);

do $$
begin
  if exists (
    select 1 from public.erp_memberships
    where role='employee' and status='approved' and linked_entity_id is null
  ) then
    raise exception 'Approved employee membership link backfill did not complete';
  end if;
end;
$$;

commit;
