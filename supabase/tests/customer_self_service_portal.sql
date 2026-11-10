-- All synthetic identities and finance records are rolled back.
BEGIN;
DO $test$
DECLARE owner_id uuid:=gen_random_uuid(); customer_user uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid();
 r uuid; b uuid; b2 uuid; bk text; c uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); o uuid:=gen_random_uuid();
 token text; v jsonb; denied boolean; mail text:='customer-'||customer_user||'@example.invalid';
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(owner_id,'owner-'||owner_id||'@example.invalid','{"role":"owner","business_type":"restaurant","full_name":"Portal test","company_name":"Portal test","branch_name":"Test"}');
 SELECT restaurant_id,branch_id INTO r,b FROM public.erp_memberships WHERE user_id=owner_id;
 SELECT branch_key INTO bk FROM public.branches WHERE id=b;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 INSERT INTO public.branches(restaurant_id,branch_key,name) VALUES(r,'other-'||c,'Other') RETURNING id INTO b2;
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES(customer_user,mail,now(),'{"people_portal_registration":true}'),(other_user,'other-'||other_user||'@example.invalid',now(),'{"people_portal_registration":true}');
 INSERT INTO public.customers(id,name,restaurant_id,branch_id,branch,is_active) VALUES(c,'Same name',r,b,bk,true),(c2,'Same name',r,b,bk,true);
 INSERT INTO public.debt_records(id,restaurant_id,branch_id,branch,customer_id,type,party_type,party_name,total_amount,paid_amount,remaining_amount,status,date,due_date)
 VALUES(d,r,b,bk,c,'receivable','customer','Same name',100,30,70,'partial',current_date,current_date-1);
 INSERT INTO public.debt_payments(debt_id,customer_id,restaurant_id,branch_id,branch,amount,date,payment_method) VALUES(d,c,r,b,bk,30,current_date,'cash');
 INSERT INTO public.debt_records(restaurant_id,branch_id,branch,customer_id,type,party_type,total_amount,paid_amount,status,date)
 VALUES(r,b,bk,c2,'receivable','customer',999,0,'open',current_date),(r,b2,'other-'||c,c,'receivable','customer',888,0,'open',current_date),
 (r,b,bk,c,'receivable','customer',777,0,'written_off',current_date),(r,b,bk,c,'liability','customer',666,0,'open',current_date);
 INSERT INTO public.orders(id,restaurant_id,branch_id,branch_key,customer_id,order_number,total_amount) VALUES(o,r,b,bk,c,'PORTAL-TEST',100);
 INSERT INTO public.order_items(order_id,restaurant_id,branch_id,quantity,unit_price,total_price) VALUES(o,r,b,2,50,100);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 v:=public.erp_customer_portal_invite(c,mail,false);token:=v->>'token';
 ASSERT length(token)=64,'Missing secure invitation';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',other_user,'role','authenticated')::text,true);
 denied:=false;BEGIN PERFORM public.erp_customer_portal_accept(token);EXCEPTION WHEN OTHERS THEN denied:=sqlerrm='CUSTOMER_PORTAL_INVITATION_INVALID';END;
 ASSERT denied,'Wrong email accepted';
 denied:=false;BEGIN PERFORM public.erp_customer_portal_invite(c,mail,false);EXCEPTION WHEN OTHERS THEN denied:=sqlerrm='CUSTOMER_PORTAL_FORBIDDEN';END;
 ASSERT denied,'Non-owner invitation allowed';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',customer_user,'role','authenticated')::text,true);
 v:=public.erp_customer_portal_accept(token); ASSERT (v->>'customer_id')::uuid=c,'Wrong customer activated';
 ASSERT jsonb_array_length(public.erp_customer_portal_accounts())=1,'Wrong account list';
 v:=public.erp_customer_portal_statement(c); ASSERT (v->'totals'->>'balance')::numeric=70,'Wrong outstanding balance';
 ASSERT (v->'totals'->>'paid')::numeric=30,'Wrong paid balance';
 ASSERT (v->'totals'->>'overdue')::numeric=70,'Wrong overdue balance';
 ASSERT (v->>'count')::integer=2,'Leaked same-name/branch/liability debt';
 v:=public.erp_customer_portal_statement(c,'payments');ASSERT (v->>'count')::integer=1,'Payment missing';
 v:=public.erp_customer_portal_statement(c,'orders');ASSERT (v->>'count')::integer=1 AND jsonb_array_length(v->'rows'->0->'items')=1,'Order details missing';
 v:=public.erp_customer_portal_statement(c,'invoices',current_date+1,NULL,0);ASSERT (v->>'count')::integer=0 AND (v->'totals'->>'balance')::numeric=70,'Date filter changed account totals';
 v:=public.erp_customer_portal_statement(c,'invoices',NULL,NULL,1);ASSERT jsonb_array_length(v->'rows')=0,'Pagination failed';
 denied:=false;BEGIN PERFORM public.erp_customer_portal_statement(c2);EXCEPTION WHEN OTHERS THEN denied:=sqlerrm='CUSTOMER_PORTAL_FORBIDDEN';END;ASSERT denied,'Cross-customer access';
 denied:=false;BEGIN PERFORM public.erp_customer_portal_accept(token);EXCEPTION WHEN OTHERS THEN denied:=sqlerrm='CUSTOMER_PORTAL_INVITATION_INVALID';END;ASSERT denied,'Invitation reused';
 denied:=false;BEGIN UPDATE public.customer_portal_access SET active=true;EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;ASSERT denied,'Direct access mutation';
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 PERFORM public.erp_customer_portal_invite(c,mail,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',customer_user,'role','authenticated')::text,true);
 ASSERT public.erp_customer_portal_accounts()='[]'::jsonb,'Revoked account still listed';
 denied:=false;BEGIN PERFORM public.erp_customer_portal_statement(c);EXCEPTION WHEN OTHERS THEN denied:=sqlerrm='CUSTOMER_PORTAL_FORBIDDEN';END;ASSERT denied,'Revoked access still works';
 RESET ROLE;
 -- New invite cannot be accepted before email verification or after expiry.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 token:=public.erp_customer_portal_invite(c,mail,false)->>'token';
 UPDATE auth.users SET email_confirmed_at=NULL WHERE id=customer_user;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',customer_user,'role','authenticated')::text,true);
 SET LOCAL ROLE authenticated;
 denied:=false;BEGIN PERFORM public.erp_customer_portal_accept(token);EXCEPTION WHEN OTHERS THEN denied:=sqlerrm='CUSTOMER_PORTAL_VERIFIED_EMAIL_REQUIRED';END;ASSERT denied,'Unverified email accepted';
 RESET ROLE;
 UPDATE auth.users SET email_confirmed_at=now() WHERE id=customer_user;
 UPDATE public.customer_portal_access SET expires_at=now()-interval '1 second' WHERE customer_id=c;
 SET LOCAL ROLE authenticated;
 denied:=false;BEGIN PERFORM public.erp_customer_portal_accept(token);EXCEPTION WHEN OTHERS THEN denied:=sqlerrm='CUSTOMER_PORTAL_INVITATION_INVALID';END;ASSERT denied,'Expired invitation accepted';
 RESET ROLE;
 ASSERT NOT EXISTS(SELECT 1 FROM public.erp_memberships WHERE user_id=customer_user),'Customer received staff permissions';
 ASSERT NOT has_function_privilege('anon','public.erp_customer_portal_accounts()','EXECUTE'),'Anonymous execute privilege';
END $test$;
ROLLBACK;
