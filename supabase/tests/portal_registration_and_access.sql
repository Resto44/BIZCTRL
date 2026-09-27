-- Isolated identities and scopes. All fixtures roll back; no customer data is modified.
begin;
do $test$
declare
 portal text; staff_role text; u uuid; staff uuid; r uuid; b uuid; other_r uuid;
 ctx jsonb; invitation jsonb; result jsonb; email text; denied boolean;
begin
 foreach portal in array array['restaurant','cafe','retail','warehouse','factory','pharmacy','clinic','wholesale','services','other'] loop
  perform set_config('request.jwt.claims','{}',true);
  u:=gen_random_uuid();
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(u,'qa-'||portal||'-'||u||'@example.invalid',now(),jsonb_build_object('role','owner','business_type',portal,'full_name','QA Owner','company_name','QA '||portal,'branch_name','QA Branch'));
  select restaurant_id,branch_id into r,b from public.erp_memberships where user_id=u;
  assert r is not null and b is not null, 'Owner registration did not create scope: '||portal;
  assert (select business_type from public.restaurants where id=r)=portal,'Wrong business portal';
  if other_r is null then other_r:=r; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  set local role authenticated;
  ctx:=public.erp_get_session_context();
  assert ctx->>'role'='owner' and ctx->>'home_path'='/owner-command-center','Owner session route incorrect';
  assert (ctx->>'restaurant_id')::uuid=r and (ctx->>'branch_id')::uuid=b,'Owner session scope incorrect';
  if r<>other_r then
   assert not exists(select 1 from public.restaurants where id=other_r),'Cross-tenant restaurant visible';
   assert not public.erp_can_write_scope(other_r,b),'Cross-tenant write allowed';
  end if;
  reset role;
 end loop;
 insert into public.subscriptions(restaurant_id,subscription_status,plan,trial_end) values(r,'TRIAL','growth_40',current_date+7)
 on conflict(restaurant_id) where restaurant_id is not null do update set subscription_status='TRIAL',plan='growth_40',trial_end=current_date+7;
 foreach staff_role in array array['manager','employee','supplier'] loop
  staff:=gen_random_uuid(); email:='qa-'||staff_role||'-'||staff||'@example.invalid';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  set local role authenticated;
  invitation:=public.create_erp_invitation(staff_role,r,b,'QA '||staff_role,email,null,'{}');
  reset role;
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(staff,email,now(),jsonb_build_object('invitation_token',invitation->>'token'));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',staff,'role','authenticated')::text,true);
  set local role authenticated;
  result:=public.activate_erp_invitation(invitation->>'token');
  assert result->>'status'='activated','Invitation failed for '||staff_role;
  ctx:=public.erp_get_session_context();
  assert ctx->>'role'=staff_role,'Wrong staff role';
  assert ctx->>'data_scope'='assigned_branch','Staff scope too broad';
  assert (ctx->>'restaurant_id')::uuid=r and (ctx->>'branch_id')::uuid=b,'Wrong staff scope';
  assert ctx->>'home_path'=case staff_role when 'manager' then '/manager-dashboard' when 'employee' then '/employee-dashboard' else '/supplier-portal' end,'Wrong staff home';
  assert not exists(select 1 from public.restaurants where id=other_r),'Staff sees foreign tenant';
  denied:=false;
  begin perform public.create_erp_invitation('manager',r,b,'Unauthorized','qa-denied@example.invalid',null,'{}');exception when others then denied:=true;end;
  assert denied,'Non-owner can create privileged invitations';
  reset role;
 end loop;
 perform set_config('request.jwt.claims','{}',true);
 set local role authenticated;
 denied:=false;
 begin perform public.erp_get_session_context();exception when insufficient_privilege then denied:=true;end;
 assert denied,'Anonymous session accepted';
 reset role;
end $test$;
rollback;
