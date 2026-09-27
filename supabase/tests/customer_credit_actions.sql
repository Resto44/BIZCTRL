-- Synthetic customer, owner and branch; no real customer balances are changed.
begin;
do $test$
declare
 u uuid:=gen_random_uuid(); r uuid; b uuid; branch_key text;
 c uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); v jsonb; payload jsonb;
 closing_payload jsonb; closing_id uuid; debt_id uuid; denied boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'credit-test-'||u||'@example.invalid','{"role":"owner","business_type":"restaurant","full_name":"Credit fixture","company_name":"Credit fixture","branch_name":"Test"}');
 select restaurant_id,branch_id into r,b from public.erp_memberships where user_id=u;
 select branch.branch_key into branch_key from public.branches branch where id=b;
 assert r is not null and b is not null and branch_key is not null,'Fixture scope missing';
 insert into public.customers(id,name,restaurant_id,branch_id,branch,credit_limit,is_active,created_by) values(c,'Credit fixture',r,b,branch_key,2000,true,u::text);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 set local role authenticated;
 closing_payload:=jsonb_build_object('restaurant_id',r,'branch_id',b,'branch',branch_key,'date',current_date,'shift','Morning','cashier_id',u,'cashier_name','Credit fixture','closing_state','finalized','actual_cash',0,'credit_entries_json',jsonb_build_array(jsonb_build_object('customer_id',c,'amount',35)));
 v:=public.erp_save_sales_closing_core(closing_payload,null,req);
 closing_id:=(v->'closing'->>'id')::uuid;
 assert closing_id is not null,'Credit closing did not save';
 v:=public.erp_save_sales_closing_core(closing_payload,null,req);
 assert (v->>'idempotent')::boolean,'Closing retry not idempotent';
 payload:=jsonb_build_object('restaurant_id',r,'branch_id',b,'branch',branch_key,'customer_id',c,'amount',2,'date',current_date,'payment_method','cash','request_id',gen_random_uuid());
 v:=public.erp_record_customer_receivable_payment(payload);
 assert (v->'customer_position'->>'outstanding_balance')::numeric=33,'Cash repayment did not reduce debt';
 v:=public.erp_record_customer_receivable_payment(payload);
 assert (v->>'idempotent')::boolean,'Repayment retry not idempotent';
 payload:=payload||jsonb_build_object('amount',3,'payment_method','card','request_id',gen_random_uuid());
 v:=public.erp_record_customer_receivable_payment(payload);
 assert (v->'customer_position'->>'outstanding_balance')::numeric=30,'Card repayment did not reduce debt';
 denied:=false;
 begin perform public.erp_record_customer_receivable_payment(payload||jsonb_build_object('amount',100,'request_id',gen_random_uuid()));exception when others then if sqlerrm='CUSTOMER_DEBT_PAYMENT_EXCEEDS_REMAINING' then denied:=true;else raise;end if;end;
 assert denied,'Excess repayment accepted';
 reset role;
 insert into public.debt_records(restaurant_id,branch_id,branch,customer_id,type,party_type,party_name,total_amount,paid_amount,status,date,created_by) values(r,b,branch_key,c,'liability','customer','Credit fixture',110,0,'open',current_date,u::text);
 set local role authenticated;
 -- The UI filters each report view by restaurant_id. Verify real aggregates under RLS.
 assert (select sum(outstanding_balance) from public.v_customer_summary where restaurant_id=r)=30,'Customer summary remaining balance incorrect';
 assert (select sum(total_outstanding) from public.v_customer_aging where restaurant_id=r)=30,'Aging report remaining balance incorrect';
 assert (select sum(collected_today) from public.v_collection_dashboard where restaurant_id=r)=5,'Collection dashboard amount incorrect';
 assert not exists(select 1 from public.v_customer_summary where restaurant_id<>r),'Summary exposed another tenant';
 assert not exists(select 1 from public.v_customer_aging where restaurant_id<>r),'Aging exposed another tenant';
 assert not exists(select 1 from public.v_collection_dashboard where restaurant_id<>r),'Collections exposed another tenant';
 perform set_config('request.jwt.claims','{}',true);
 denied:=false;
 begin perform public.erp_record_customer_receivable_payment(payload);exception when others then if sqlerrm='SALES_CLOSING_AUTH_REQUIRED' then denied:=true;else raise;end if;end;
 assert denied,'Anonymous repayment accepted';
 reset role;
 assert (select count(*) from public.debt_records where sales_closing_id=closing_id and customer_id=c)=1,'Credit sale created duplicate debts';
 assert (select credit from public.daily_sales where id=closing_id)=35,'Repayment changed sales revenue';
 assert (select count(*) from public.customer_collections where customer_id=c)=2,'Repayment created duplicate collections';
 assert (select sum(amount) from public.cash_movements where restaurant_id=r and movement_type='customer_debt_collection' and not is_reversed)=2,'Cash posted twice or card counted as cash';
 assert (select sum(customer_debt_collection) from public.daily_cash_settlements where restaurant_id=r)=2,'Cash settlement does not match collection';
 assert (select sum(amount) from public.wallet_transactions where customer_id=c)=5,'Wallet repayment total incorrect';
end $test$;
rollback;
