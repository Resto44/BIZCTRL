-- Shared business-level push customization, editable only by approved owners.
create table public.owner_push_preferences (
 restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
 enabled boolean not null default true,
 title_template text not null default 'BizCTRL · {business}',
 body_template text not null default '{action} · {entity} · {reference} · {branch}',
 language text not null default 'en' check(language in ('en','ar','fa')),
 actions text[] not null default array['insert','update','delete'] check(actions <@ array['insert','update','delete'] and array_position(actions,null) is null),
 modules text[] not null default array['sales','purchases','inventory','finance','people','other'] check(modules <@ array['sales','purchases','inventory','finance','people','other'] and array_position(modules,null) is null),
 branch_ids uuid[] not null default '{}' check(array_position(branch_ids,null) is null),
 show_reference boolean not null default true,
 check(length(btrim(title_template))>0 and length(title_template)<=100 and regexp_replace(title_template,'\{(business|branch|action|entity|reference|time)\}','','g') !~ '[{}]'),
 check(length(btrim(body_template))>0 and length(body_template)<=500 and regexp_replace(body_template,'\{(business|branch|action|entity|reference|time)\}','','g') !~ '[{}]')
);
alter table public.owner_push_preferences enable row level security;
revoke all on public.owner_push_preferences from anon,authenticated;
grant select,insert,update,delete on public.owner_push_preferences to authenticated;
grant all on public.owner_push_preferences to service_role;
create policy owner_push_preferences_select on public.owner_push_preferences for select to authenticated using(public.erp_is_approved_owner(restaurant_id));
create policy owner_push_preferences_insert on public.owner_push_preferences for insert to authenticated with check(public.erp_is_approved_owner(restaurant_id));
create policy owner_push_preferences_update on public.owner_push_preferences for update to authenticated using(public.erp_is_approved_owner(restaurant_id)) with check(public.erp_is_approved_owner(restaurant_id));
create policy owner_push_preferences_delete on public.owner_push_preferences for delete to authenticated using(public.erp_is_approved_owner(restaurant_id));
