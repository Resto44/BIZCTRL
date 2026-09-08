begin;
do $$
declare r uuid:=gen_random_uuid(); other_r uuid:=gen_random_uuid(); owner_id uuid:=gen_random_uuid(); staff_id uuid:=gen_random_uuid(); b1 uuid:=gen_random_uuid(); b2 uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); w1 uuid; w2 uuid; doc jsonb; transfer_doc jsonb; cnt jsonb; v jsonb; n numeric; blocked boolean:=false; supplier uuid:=gen_random_uuid(); purchase_order uuid; device uuid; shift_id uuid; sale jsonb; qlot uuid;
begin
  insert into auth.users(id,email,raw_user_meta_data) values
    (owner_id,'inventory-owner-'||owner_id||'@example.invalid','{"role":"owner","business_type":"retail","full_name":"Verification owner","company_name":"Inventory test","branch_name":"Verification A"}'),
    (staff_id,'inventory-staff-'||staff_id||'@example.invalid','{"role":"owner","business_type":"retail","full_name":"Verification staff","company_name":"Isolation test","branch_name":"Other tenant"}');
  select restaurant_id,branch_id into r,b1 from public.erp_memberships where user_id=owner_id;
  select restaurant_id into other_r from public.erp_memberships where user_id=staff_id;
  insert into public.subscriptions(restaurant_id,subscription_status,plan,trial_end) values(r,'TRIAL','growth_40',current_date+7) on conflict(restaurant_id) where restaurant_id is not null do update set subscription_status='TRIAL',plan='growth_40',trial_end=current_date+7;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  insert into public.branches(id,restaurant_id,name,branch_key) values(b2,r,'Verification B',b2::text);

  update public.erp_memberships set restaurant_id=r,branch_id=b2,role='manager',permissions='{"viewInventory":true,"updateInventory":true,"createPurchases":true,"viewProducts":true,"viewPurchases":true}' where user_id=staff_id;
  update public.profiles set restaurant_id=r,organization_id=r,branch_id=b2,role='manager' where id=staff_id;
  insert into public.products(id,restaurant_id,product_id,name,sku,unit,purchase_cost,is_active,batch_tracked,expiry_tracked) values(p,r,'TEST-'||p,'Verification milk','TEST-'||p,'pc',4,true,true,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','email','inventory-owner@example.invalid')::text,true);
  set local role authenticated;
  v:=public.erp_retail_inventory_command(r,'assign',jsonb_build_object('branch_id',b1,'product_ids',jsonb_build_array(p)));
  select id into w1 from public.retail_inventory_warehouses where branch_id=b1 and is_default;
  v:=public.erp_retail_inventory_command(r,'assign',jsonb_build_object('branch_id',b2,'product_ids',jsonb_build_array(p)));
  select id into w2 from public.retail_inventory_warehouses where branch_id=b2 and is_default;
  doc:=public.erp_retail_inventory_command(r,'create',jsonb_build_object('kind','receipt','warehouse_id',w1,'lines',jsonb_build_array(jsonb_build_object('product_id',p,'quantity',100,'unit_cost',4,'batch_number','LOT-A','expiry_date',current_date+20))),'verify-receipt-001');
  perform public.erp_retail_inventory_command(r,'receive',jsonb_build_object('document_id',doc->>'id'));
  perform public.erp_retail_inventory_command(r,'receive',jsonb_build_object('document_id',doc->>'id'));
  select on_hand into n from public.retail_inventory_stock where warehouse_id=w1 and product_id=p;
  if n is distinct from 100 then raise exception 'Duplicate receipt changed stock: %',n; end if;
  transfer_doc:=public.erp_retail_inventory_command(r,'create',jsonb_build_object('kind','transfer','warehouse_id',w1,'destination_warehouse_id',w2,'lines',jsonb_build_array(jsonb_build_object('product_id',p,'quantity',30,'unit_cost',4))),'verify-transfer-001');
  perform public.erp_retail_inventory_command(r,'approve',jsonb_build_object('document_id',transfer_doc->>'id'));
  select available into n from public.retail_inventory_stock where warehouse_id=w1 and product_id=p;
  if n is distinct from 70 then raise exception 'Reservation incorrect: %',n; end if;
  perform public.erp_retail_inventory_command(r,'dispatch',jsonb_build_object('document_id',transfer_doc->>'id'));
  perform public.erp_retail_inventory_command(r,'dispatch',jsonb_build_object('document_id',transfer_doc->>'id'));
  select on_hand into n from public.retail_inventory_stock where warehouse_id=w2 and product_id=p;
  if n is distinct from 0 then raise exception 'Transit stock arrived early'; end if;
  -- A destination manager can read and receive only its incoming transfer.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',staff_id,'role','authenticated')::text,true);
  v:=public.erp_retail_inventory_documents(r,b2);
  if (v->>'total')::int<>1 then raise exception 'Destination cannot read incoming transfer: %',v; end if;
  perform public.erp_retail_inventory_command(r,'receive',jsonb_build_object('document_id',transfer_doc->>'id'));
  perform public.erp_retail_inventory_command(r,'receive',jsonb_build_object('document_id',transfer_doc->>'id'));
  select on_hand into n from public.retail_inventory_stock where warehouse_id=w2 and product_id=p;
  if n is distinct from 30 then raise exception 'Destination balance incorrect: %, balances %, products %, branches %, scopes %, permission %, role %',n,(select jsonb_agg(to_jsonb(bal)) from public.retail_inventory_balances bal where warehouse_id=w2),(select count(*) from public.products where id=p),(select count(*) from public.branches where id=b2),public.erp_can_access_scope(r,null),public.erp_has_any_permission(array['viewInventory']),public.erp_current_role(); end if;
  if exists(select 1 from public.retail_inventory_balances where branch_id=b1) then raise exception 'Source balance leaked to destination manager'; end if;
  begin perform public.erp_retail_inventory_command(r,'assign',jsonb_build_object('branch_id',b1,'product_ids',jsonb_build_array(p))); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Manager wrote other branch'; end if;
  blocked:=false;
  begin perform public.erp_retail_inventory_snapshot(other_r); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Cross-tenant data access'; end if;
  cnt:=public.erp_retail_inventory_command(r,'create',jsonb_build_object('kind','count','warehouse_id',w2),'verify-count-001');
  v:=public.erp_retail_inventory_document((cnt->>'id')::uuid);
  if coalesce(jsonb_array_length(v->'lines'),0)=0 then raise exception 'Count detail empty: %, allowed %, products %, raw lines %',v,retail_inventory_private.allowed(r,b2),(select count(*) from public.products where id=p),(select count(*) from public.retail_inventory_lines where document_id=(cnt->>'id')::uuid); end if;
  perform public.erp_retail_inventory_command(r,'save_count',jsonb_build_object('document_id',cnt->>'id','lines',jsonb_build_array(jsonb_build_object('id',v->'lines'->0->>'id','counted_quantity',28))));
  perform public.erp_retail_inventory_command(r,'submit',jsonb_build_object('document_id',cnt->>'id'));
  blocked:=false;
  begin perform public.erp_retail_inventory_command(r,'approve',jsonb_build_object('document_id',cnt->>'id')); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Manager approved own variance'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  perform public.erp_retail_inventory_command(r,'approve',jsonb_build_object('document_id',cnt->>'id'));
  select on_hand into n from public.retail_inventory_stock where warehouse_id=w2 and product_id=p;
  if n is distinct from 28 then raise exception 'Count variance not applied: %',n; end if;
  if not exists(select 1 from public.retail_inventory_lots where branch_id=b2 and batch_number='LOT-A' and quantity=28 and expiry_date=current_date+20) then raise exception 'Batch not preserved in transfer/count'; end if;
  v:=public.erp_retail_inventory_snapshot(r);
  if (v->'summary'->>'stock_value')::numeric<>392 then raise exception 'Stock valuation incorrect: %',v->'summary'; end if;
  -- Actual cashier RPC must debit stock once and make a concurrent count stale.
  cnt:=public.erp_retail_inventory_command(r,'create',jsonb_build_object('kind','count','warehouse_id',w1),'verify-stale-count');
  v:=public.erp_retail_inventory_document((cnt->>'id')::uuid);
  perform public.erp_retail_inventory_command(r,'save_count',jsonb_build_object('document_id',cnt->>'id','lines',jsonb_build_array(jsonb_build_object('id',v->'lines'->0->>'id','counted_quantity',70))));
  perform public.erp_retail_inventory_command(r,'submit',jsonb_build_object('document_id',cnt->>'id'));
  select id into device from public.erp_retail_pos_seed_branch_devices(b1,1) limit 1;
  -- Legacy trusted-ledger fixture runs as the backend; browser calls now go
  -- through the stock-checked cashier command (covered by cashier workflows).
  reset role;
  select id into shift_id from public.erp_retail_pos_open_shift(device,'Verification cashier',0);
  set local role authenticated;
  sale:=jsonb_build_object('shift_id',shift_id,'receipt_number','VERIFY-SALE-1','idempotency_key','verify-sale-1','net_total',15,
    'items',jsonb_build_array(jsonb_build_object('product_id',p,'product_name','Verification milk','quantity',3,'unit_price',5,'line_total',15)),
    'payments',jsonb_build_array(jsonb_build_object('payment_method','cash','amount',15)));
  reset role;
  perform public.erp_retail_pos_record_transaction(sale);
  perform public.erp_retail_pos_record_transaction(sale);
  set local role authenticated;
  select on_hand into n from public.retail_inventory_stock where warehouse_id=w1 and product_id=p;
  if n is distinct from 67 then raise exception 'POS stock debit/idempotency incorrect: %',n; end if;
  blocked:=false;
  begin perform public.erp_retail_inventory_command(r,'approve',jsonb_build_object('document_id',cnt->>'id')); exception when serialization_failure then blocked:=true; end;
  if not blocked then raise exception 'Stale count overwrote POS stock'; end if;
  perform public.erp_retail_inventory_command(r,'cancel',jsonb_build_object('document_id',cnt->>'id'));
  -- Reorder approval creates a real draft PO, with bounded partial receipts.
  insert into public.suppliers(id,restaurant_id,name) values(supplier,r,'Verification supplier');
  doc:=public.erp_retail_inventory_command(r,'create',jsonb_build_object('kind','reorder','warehouse_id',w1,'supplier_id',supplier,'lines',jsonb_build_array(jsonb_build_object('product_id',p,'quantity',20,'unit_cost',4))),'verify-reorder-001');
  v:=public.erp_retail_inventory_command(r,'approve',jsonb_build_object('document_id',doc->>'id'));
  purchase_order:=(v->>'source_purchase_order_id')::uuid;
  if purchase_order is null then raise exception 'Reorder did not create PO'; end if;
  update public.purchase_orders set status='sent' where id=purchase_order;
  v:=public.erp_retail_inventory_purchase_order(purchase_order);
  if (v->'lines'->0->>'remaining')::numeric is distinct from 20 then raise exception 'PO receiving detail incorrect: %',v; end if;
  doc:=public.erp_retail_inventory_command(r,'create',jsonb_build_object('kind','receipt','warehouse_id',w1,'purchase_order_id',purchase_order,'lines',jsonb_build_array(jsonb_build_object('product_id',p,'quantity',8,'unit_cost',4,'batch_number','LOT-B','expiry_date',current_date+10))),'verify-po-receipt-001');
  perform public.erp_retail_inventory_command(r,'receive',jsonb_build_object('document_id',doc->>'id'));
  v:=public.erp_retail_inventory_purchase_order(purchase_order);
  if (v->'lines'->0->>'remaining')::numeric is distinct from 12 then raise exception 'Partial PO receipt incorrect: %',v; end if;
  doc:=public.erp_retail_inventory_command(r,'create',jsonb_build_object('kind','receipt','warehouse_id',w1,'purchase_order_id',purchase_order,'lines',jsonb_build_array(jsonb_build_object('product_id',p,'quantity',13,'unit_cost',4,'batch_number','LOT-C','expiry_date',current_date+30))),'verify-over-receipt');
  blocked:=false;
  begin perform public.erp_retail_inventory_command(r,'receive',jsonb_build_object('document_id',doc->>'id')); exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'PO over-receipt was accepted'; end if;
  perform public.erp_retail_inventory_command(r,'cancel',jsonb_build_object('document_id',doc->>'id'));
  doc:=public.erp_retail_inventory_command(r,'create',jsonb_build_object('kind','receipt','warehouse_id',w1,'purchase_order_id',purchase_order,'lines',jsonb_build_array(jsonb_build_object('product_id',p,'quantity',12,'unit_cost',4,'batch_number','LOT-C','expiry_date',current_date+30))),'verify-po-receipt-002');
  perform public.erp_retail_inventory_command(r,'receive',jsonb_build_object('document_id',doc->>'id'));
  if (select status from public.purchase_orders where id=purchase_order) is distinct from 'received' then raise exception 'PO not closed after receipt'; end if;
  if exists(select 1 from public.cash_movements where restaurant_id=r and source_module='Purchases') then raise exception 'Goods receipt incorrectly posted a cash payment'; end if;
  -- FEFO consumes the newer purchase with the earlier expiry before LOT-A.
  sale:=jsonb_set(jsonb_set(sale,'{idempotency_key}','"verify-sale-2"'),'{receipt_number}','"VERIFY-SALE-2"');
  reset role;
  perform public.erp_retail_pos_record_transaction(sale);
  set local role authenticated;
  select quantity into n from public.retail_inventory_lots where branch_id=b1 and batch_number='LOT-B';
  if n is distinct from 5 then raise exception 'FEFO did not consume earliest expiry: %',n; end if;
  -- Quarantine review leaves physical quantity unchanged and increases sellable quantity.
  reset role;
  perform retail_inventory_private.post(r,w1,p,2,4,'test_return',null,'Test inspected return','verify-quarantine',null,'RETURN',current_date+20,false,true);
  set local role authenticated;
  select id into qlot from public.retail_inventory_lots where restaurant_id=r and quarantined and batch_number='RETURN';
  perform public.erp_retail_inventory_command(r,'release',jsonb_build_object('lot_id',qlot,'notes','Inspected intact packaging'));
  select available into n from public.retail_inventory_stock where warehouse_id=w1 and product_id=p;
  if n is distinct from 86 then raise exception 'Quarantine release/physical stock incorrect: %',n; end if;
  v:=public.erp_product_catalog_counts(r,b1);
  if (v->>'inventory_value')::numeric is distinct from 344 then raise exception 'Master and inventory valuation disagree: %',v; end if;
  -- Immutable journals and unavailable private helpers enforce the posting boundary.
  blocked:=false;
  begin update public.retail_inventory_ledger set quantity=999 where restaurant_id=r; exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Client updated physical journal'; end if;
  blocked:=false;
  begin perform retail_inventory_private.post(r,w1,p,999,4,'invalid',null,null,'client-invalid'); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Client called private posting helper'; end if;
  raise notice 'PASS: receipt idempotency; transfer reservation/dispatch/arrival; batch preservation; manager receive; branch and tenant isolation; owner-only variance approval; stock valuation; actual POS debit; stale count protection; reviewed PO; partial/over receipts; FEFO; quarantine; ledger immutability';
  reset role;
end $$;
rollback;
