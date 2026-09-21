-- Run in a transaction and always roll back. Requires the owner's existing test scope.
begin;
do $test$
declare r uuid; b uuid; u uuid; ids uuid[]; before_rows jsonb; after_rows jsonb; denied boolean:=false;
begin
select m.restaurant_id,m.branch_id,array_agg(m.id order by m.id) into r,b,ids from restaurant_pos_private.menu m where m.restaurant_id='095e758e-84e8-4b12-b642-7af72bee0ddf' and m.active group by m.restaurant_id,m.branch_id limit 1;
if r is null then raise exception 'No test menu scope'; end if;
ids:=ids[1:2];
select user_id into u from public.erp_memberships where restaurant_id=r and role='owner' and status='approved' limit 1;
perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
begin perform public.erp_restaurant_pos_setup(r,b,'menu_archive',jsonb_build_object('ids',ids));exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'Anonymous archive allowed';end if;
perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
select jsonb_agg(to_jsonb(m)-'active'-'updated_at' order by id) into before_rows from restaurant_pos_private.menu m where id=any(ids);
denied:=false;
begin perform public.erp_restaurant_pos_setup(r,b,'menu_archive',jsonb_build_object('ids',to_jsonb(ids)||jsonb_build_array(gen_random_uuid())));exception when insufficient_privilege then denied:=true;end;
if not denied then raise exception 'Invalid scope accepted';end if;
if exists(select 1 from restaurant_pos_private.menu where id=any(ids) and not active) then raise exception 'Partial update on failed batch';end if;
perform public.erp_restaurant_pos_setup(r,b,'menu_archive',jsonb_build_object('ids',ids));
if exists(select 1 from restaurant_pos_private.menu where id=any(ids) and active) then raise exception 'Archive failed';end if;
select jsonb_agg(to_jsonb(m)-'active'-'updated_at' order by id) into after_rows from restaurant_pos_private.menu m where id=any(ids);
if before_rows is distinct from after_rows then raise exception 'Archive changed food fields';end if;
end $test$;
rollback;
