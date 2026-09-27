-- Disposable fixtures; verify owner contribution changes liquidity, never sales.
begin;
do $test$
declare u uuid:=gen_random_uuid(); r uuid; b uuid; bk text; injection uuid;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'owner-cash-qa-'||u||'@example.invalid','{"role":"owner","full_name":"QA","company_name":"QA","branch_name":"QA"}');
 select restaurant_id,branch_id into r,b from public.erp_memberships where user_id=u;
 select branch_key into bk from public.branches where id=b;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 set local role authenticated;
 insert into public.owner_cash_injections(restaurant_id,branch_id,branch,date,amount,created_by) values(r,b,bk,current_date,7,u::text) returning id into injection;
 update public.owner_cash_injections set amount=9 where id=injection;
 reset role;
 assert (select sum(amount) from public.cash_movements where restaurant_id=r and movement_type='owner_injection' and not is_reversed)=9,'Contribution update posted wrong total';
 assert (select sum(owner_injection) from public.daily_cash_settlements where restaurant_id=r)=9,'Settlement contribution incorrect';
 assert not exists(select 1 from public.daily_sales where restaurant_id=r::text),'Contribution created sales revenue';
 set local role authenticated;
 delete from public.owner_cash_injections where id=injection;
 reset role;
 assert not exists(select 1 from public.cash_movements where restaurant_id=r and movement_type='owner_injection' and not is_reversed),'Deleted contribution left cash movement';
 assert (select sum(owner_injection) from public.daily_cash_settlements where restaurant_id=r)=0,'Deleted contribution left settlement total';
end $test$;
rollback;
