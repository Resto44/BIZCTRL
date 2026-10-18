-- Run inside BEGIN/ROLLBACK after the partner migration. Synthetic identities only.
DO $test$
DECLARE owner_id uuid:=gen_random_uuid(); partner_user uuid:=gen_random_uuid(); other_user uuid:=gen_random_uuid();
 tenant uuid; a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); cash_id uuid:=gen_random_uuid(); bank_id uuid:=gen_random_uuid();
 usd_id uuid:=gen_random_uuid(); tx uuid:=gen_random_uuid(); tx2 uuid:=gen_random_uuid(); token_a text; token_b text; result jsonb; row_result public.sponsor_owner_transactions;
 req uuid:=gen_random_uuid(); reject_req uuid:=gen_random_uuid(); n bigint; denied boolean; owner_email text; partner_email text; other_email text;
BEGIN
 owner_email:='partner-test-owner-'||owner_id||'@example.invalid';
 partner_email:='partner-test-a-'||partner_user||'@example.invalid';
 other_email:='partner-test-b-'||other_user||'@example.invalid';
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 VALUES(owner_id,owner_email,now(),jsonb_build_object('role','owner','full_name','Partner test owner','company_name','Partner rollback fixture','branch_name','Test','business_type','services'));
 SELECT restaurant_id INTO tenant FROM public.erp_memberships WHERE user_id=owner_id;
 IF tenant IS NULL THEN RAISE EXCEPTION 'fixture owner missing'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'email',owner_email,'role','authenticated')::text,true);
 result:=public.erp_save_business_partner(tenant,a,'A',partner_email,true,true);token_a:=result->>'token';
 result:=public.erp_save_business_partner(tenant,b,'B',other_email,true,true);token_b:=result->>'token';
 IF token_a IS NULL OR token_b IS NULL THEN RAISE EXCEPTION 'invite missing'; END IF;
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 VALUES(partner_user,partner_email,now(),jsonb_build_object('partner_invitation_token',token_a));
 INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 VALUES(other_user,other_email,now(),jsonb_build_object('partner_invitation_token',token_b));
 IF EXISTS(SELECT 1 FROM auth.users WHERE id IN(partner_user,other_user) AND raw_user_meta_data ? 'partner_invitation_token') THEN RAISE EXCEPTION 'invitation token persisted';END IF;
 IF EXISTS(SELECT 1 FROM public.erp_memberships WHERE user_id IN(partner_user,other_user)) OR EXISTS(SELECT 1 FROM public.profiles WHERE id IN(partner_user,other_user)) THEN RAISE EXCEPTION 'partner was granted ERP privileges'; END IF;
 INSERT INTO public.treasury_accounts(id,restaurant_id,account_name,account_type,currency,opening_balance)
 VALUES(cash_id,tenant,'Test cash','cash','SAR',1000),(bank_id,tenant,'Test bank','bank','SAR',1000),(usd_id,tenant,'Test USD','cash','USD',1000);
 row_result:=public.erp_post_partner_transaction(tenant,a,cash_id,'sponsor_advance_to_owner',100,current_date,tx);
 row_result:=public.erp_post_partner_transaction(tenant,a,cash_id,'sponsor_advance_to_owner',100,current_date,tx);
 SELECT count(*) INTO n FROM public.wallet_transactions WHERE restaurant_id=tenant AND reference_id='sponsor_owner:'||tx;
 IF n<>1 THEN RAISE EXCEPTION 'duplicate posting'; END IF;
 denied:=false;BEGIN
 PERFORM public.erp_post_partner_transaction(tenant,b,cash_id,'sponsor_advance_to_owner',100,current_date,tx);
 EXCEPTION WHEN unique_violation THEN denied:=true; END;IF NOT denied THEN RAISE EXCEPTION 'cross partner idempotency accepted';END IF;
 denied:=false;BEGIN
 PERFORM public.erp_post_partner_transaction(tenant,b,cash_id,'owner_repay_sponsor',1,current_date,gen_random_uuid());
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;IF NOT denied THEN RAISE EXCEPTION 'cross partner repayment accepted';END IF;
 denied:=false;BEGIN
 PERFORM public.erp_post_sponsor_owner_transaction(tenant,cash_id,'owner_repay_sponsor',1,current_date,gen_random_uuid());
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;IF NOT denied THEN RAISE EXCEPTION 'legacy repayment consumed partner debt';END IF;
 denied:=false;BEGIN
 PERFORM public.erp_post_partner_transaction(tenant,a,usd_id,'owner_repay_sponsor',1,current_date,gen_random_uuid());
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;IF NOT denied THEN RAISE EXCEPTION 'cross currency repayment accepted';END IF;
 row_result:=public.erp_post_sponsor_owner_transaction(tenant,cash_id,'sponsor_advance_to_owner',25,current_date,gen_random_uuid());
 IF row_result.partner_id IS NOT NULL THEN RAISE EXCEPTION 'legacy entry assigned to partner';END IF;
 row_result:=public.erp_post_partner_transaction(tenant,b,bank_id,'owner_advance_to_sponsor',40,current_date,tx2);
 IF NOT EXISTS(SELECT 1 FROM public.wallet_transactions WHERE id=row_result.wallet_transaction_id AND payment_method='network' AND direction='out') THEN RAISE EXCEPTION 'incorrect network posting';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',partner_user,'email',partner_email,'role','authenticated')::text,true);
 denied:=false;BEGIN PERFORM public.erp_accept_partner_invitation(token_b);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'wrong email activated invitation';END IF;
 PERFORM public.erp_accept_partner_invitation(token_a);
 result:=public.erp_partner_portal_accounts();IF jsonb_array_length(result)<>1 OR result->0->>'id'<>a::text THEN RAISE EXCEPTION 'account scope leaked';END IF;
 result:=public.erp_partner_portal_statement(a);
 IF result->'balances'->0->>'owner_owes'<>'100.00' OR jsonb_array_length(result->'records')<>1 THEN RAISE EXCEPTION 'incorrect partner statement %',result;END IF;
 IF (result->'records'->0) ? 'owner_account_id' THEN RAISE EXCEPTION 'wallet identity leaked';END IF;
 denied:=false;BEGIN PERFORM public.erp_partner_portal_statement(b);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'other partner statement visible';END IF;
 denied:=false;BEGIN PERFORM public.erp_confirm_partner_transaction(tx2);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'other partner confirmation allowed';END IF;
 denied:=false;BEGIN PERFORM public.erp_post_partner_transaction(tenant,a,cash_id,'sponsor_advance_to_owner',1,current_date,gen_random_uuid());
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'partner can post owner funds';END IF;
 PERFORM public.erp_confirm_partner_transaction(tx);PERFORM public.erp_confirm_partner_transaction(tx);
 SELECT count(*) INTO n FROM public.partner_transaction_confirmations WHERE transaction_id=tx;IF n<>1 THEN RAISE EXCEPTION 'duplicate confirmation';END IF;
 -- RLS is exercised as authenticated, not as the postgres fixture builder.
 SET LOCAL ROLE authenticated;
 SELECT count(*) INTO n FROM public.business_partners WHERE restaurant_id=tenant;
 IF n<>0 THEN RAISE EXCEPTION 'raw partner directory exposed';END IF;
 SELECT count(*) INTO n FROM public.sponsor_owner_transactions WHERE restaurant_id=tenant;
 IF n<>0 THEN RAISE EXCEPTION 'raw owner ledger exposed';END IF;
 RESET ROLE;
 -- Partner requests leave the ledger unchanged until owner approval.
 result:=public.erp_submit_partner_request(a,req,'sponsor_advance_to_owner',25,'SAR',current_date,'cash','request fixture','REQ-TEST');
 PERFORM public.erp_submit_partner_request(a,req,'sponsor_advance_to_owner',25,'SAR',current_date,'cash','request fixture','REQ-TEST');
 SELECT count(*) INTO n FROM public.partner_transaction_requests WHERE id=req;IF n<>1 THEN RAISE EXCEPTION 'duplicate request';END IF;
 SELECT count(*) INTO n FROM public.sponsor_owner_transactions WHERE partner_id=a;IF n<>1 THEN RAISE EXCEPTION 'request moved money';END IF;
 denied:=false;BEGIN PERFORM public.erp_submit_partner_request(b,gen_random_uuid(),'sponsor_advance_to_owner',25,'SAR',current_date,'cash');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'cross partner request';END IF;
 denied:=false;BEGIN PERFORM public.erp_review_partner_request(req,true,cash_id);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'partner approved own request';END IF;
 denied:=false;BEGIN PERFORM public.erp_submit_partner_request(a,req,'sponsor_advance_to_owner',26,'SAR',current_date,'cash');EXCEPTION WHEN unique_violation THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'changed retry accepted';END IF;
 denied:=false;BEGIN PERFORM public.erp_review_partner_request(req,false,NULL,'tamper');EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'partner rejected request';END IF;
 result:=public.erp_list_partner_requests(a);IF (result->>'count')::int<>1 THEN RAISE EXCEPTION 'request not visible';END IF;
 denied:=false;BEGIN PERFORM public.erp_list_partner_requests(b);EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'cross partner requests exposed';END IF;
 PERFORM public.erp_submit_partner_request(a,reject_req,'owner_advance_to_sponsor',20,'SAR',current_date,'cash');
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'email',owner_email,'role','authenticated')::text,true);
 denied:=false;BEGIN PERFORM public.erp_review_partner_request(req,true,bank_id);EXCEPTION WHEN OTHERS THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'wrong method approved';END IF;
 PERFORM public.erp_review_partner_request(req,true,cash_id);PERFORM public.erp_review_partner_request(req,true,cash_id);
 SELECT count(*) INTO n FROM public.sponsor_owner_transactions WHERE partner_id=a;IF n<>2 THEN RAISE EXCEPTION 'approval duplicated ledger';END IF;
 SELECT count(*) INTO n FROM public.wallet_transactions w JOIN public.partner_transaction_requests r ON w.reference_id='sponsor_owner:'||r.posting_id WHERE r.id=req;IF n<>1 THEN RAISE EXCEPTION 'approval duplicated wallet';END IF;
 PERFORM public.erp_review_partner_request(reject_req,false,NULL,'Not an actual transfer');
 SELECT count(*) INTO n FROM public.sponsor_owner_transactions WHERE partner_id=a;IF n<>2 THEN RAISE EXCEPTION 'rejection moved money';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'email',owner_email,'role','authenticated')::text,true);
 PERFORM public.erp_save_business_partner(tenant,a,'A',partner_email,false,false);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',partner_user,'email',partner_email,'role','authenticated')::text,true);
 denied:=false;BEGIN PERFORM public.erp_submit_partner_request(a,gen_random_uuid(),'sponsor_advance_to_owner',25,'SAR',current_date,'cash');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'disabled partner submitted';END IF;
 PERFORM set_config('request.jwt.claims','{}',true);
 denied:=false;BEGIN PERFORM public.erp_partner_portal_statement(a);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;END;IF NOT denied THEN RAISE EXCEPTION 'anonymous statement access';END IF;
END;
$test$;
SELECT 'Partner isolation, activation, cash/network posting, idempotency, repayment scopes, confirmation, revocation and RLS passed' result;
