-- All fixtures are synthetic. Execute only inside BEGIN; ... ROLLBACK;
do $test$
declare
  owner_id uuid:=gen_random_uuid(); tenant uuid; branch uuid;
  device_id uuid; other_device_id uuid; shift_id uuid; other_shift uuid;
  kitchen_id uuid; draft_id uuid; other_id uuid;
  kitchen_num bigint; draft_num bigint;
  tok text:=repeat('b',64); tok2 text:=repeat('c',64);
  result jsonb; deny boolean; original integer; after_count integer;
begin
  insert into auth.users(id,email,raw_user_meta_data)
    values(owner_id,'display-focus-qa-'||owner_id||'@example.invalid',
     '{"role":"owner","business_type":"restaurant","full_name":"Display QA","company_name":"Display QA Restaurant","branch_name":"QA Branch"}'::jsonb);
  select restaurant_id,branch_id into tenant,branch from public.erp_memberships where user_id=owner_id;
  if tenant is null or branch is null then raise exception 'FIXTURE_OWNER_MISSING'; end if;
  insert into public.subscriptions(restaurant_id,subscription_status,plan,trial_end)
    values(tenant,'TRIAL','growth_40',current_date+7)
    on conflict(restaurant_id) where restaurant_id is not null
    do update set subscription_status='TRIAL',plan='growth_40',trial_end=current_date+7;
  insert into restaurant_pos_private.terminals(restaurant_id,branch_id,code)
    values(tenant,branch,'FOCUS-KDS-QA-1') returning id into device_id;
  insert into restaurant_pos_private.terminals(restaurant_id,branch_id,code)
    values(tenant,branch,'FOCUS-KDS-QA-2') returning id into other_device_id;
  insert into restaurant_pos_private.shifts(device_id,cashier_id,cashier_name,opening_cash)
    values(device_id,owner_id,'QA Cashier',0) returning id into shift_id;
  insert into restaurant_pos_private.shifts(device_id,cashier_id,cashier_name,opening_cash)
    values(other_device_id,owner_id,'Other Cashier',0) returning id into other_shift;
  insert into restaurant_pos_private.orders(device_id,shift_id,status,kitchen_status,submitted_at,lines,subtotal,tax_total,net_total)
    values(device_id,shift_id,'paid','preparing',now(),
      '[{"name":"Rice","name_ar":"رز","quantity":1,"unit_price":20,"line_total":20},{"name":"Chicken","name_ar":"دجاج","quantity":1,"unit_price":24,"line_total":24}]'::jsonb,
       40,4,44)
    returning id,number into kitchen_id,kitchen_num;
  insert into restaurant_pos_private.orders(device_id,shift_id,status,kitchen_status,lines)
    values(device_id,shift_id,'open','draft','[]'::jsonb)
    returning id,number into draft_id,draft_num;
  insert into restaurant_pos_private.orders(device_id,shift_id,status,kitchen_status,submitted_at,lines)
    values(other_device_id,other_shift,'paid','queued',now(),
      '[{"name":"FOREIGN ORDER","quantity":1}]'::jsonb)
    returning id into other_id;
  insert into restaurant_pos_private.displays(device_id,token_hash,expires_at,order_id)
    values(device_id,encode(extensions.digest(tok,'sha256'),'hex'),now()+interval '8 hours',draft_id);

  set local role anon;
  result:=public.erp_restaurant_customer_display(tok);
  if (result->>'number')::bigint<>draft_num or jsonb_array_length(result->'lines')<>0 then
    raise exception 'INITIAL_DRAFT_NOT_VISIBLE';
  end if;
  reset role;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  result:=public.erp_restaurant_pos_display_focus(device_id,'list',null);
  if (result->>'paired')::boolean is not true
     or jsonb_array_length(result->'orders')<>1 then
    raise exception 'AUTHORIZED_KITCHEN_CHOICES_WRONG: %',result;
  end if;
  deny:=false;
  begin
    perform public.erp_restaurant_pos_display_focus(device_id,'pin',other_id);
  exception when insufficient_privilege then deny:=true; end;
  if not deny then raise exception 'CROSS_DEVICE_PIN_ACCEPTED';end if;

  result:=public.erp_restaurant_pos_display_focus(device_id,'pin',kitchen_id);
  if result->>'pinned_order_id'<>kitchen_id::text then raise exception 'KITCHEN_PIN_FAILED';end if;
  reset role;

  set local role anon;
  result:=public.erp_restaurant_customer_display(tok);
  if (result->>'number')::bigint<>kitchen_num or jsonb_array_length(result->'lines')<>2
    or result->>'kitchen_status'<>'preparing' or (result->>'net_total')::numeric<>44 then
      raise exception 'PINNED_KITCHEN_ORDER_NOT_VISIBLE: %',result;
  end if;
  reset role;

  -- Exact real-world regression: cashier opens new blank order, updating order_id.
  update restaurant_pos_private.displays set order_id=draft_id where device_id=device_id;
  set local role anon;
  result:=public.erp_restaurant_customer_display(tok);
  if (result->>'number')::bigint<>kitchen_num then
    raise exception 'BLANK_NEW_CART_OVERRIDES_KITCHEN_PIN';
  end if;
  reset role;

  update restaurant_pos_private.orders set kitchen_status='ready' where id=kitchen_id;
  set local role anon;
  result:=public.erp_restaurant_customer_display(tok);
  if result->>'kitchen_status'<>'ready' then raise exception 'KITCHEN_READY_NOT_REFLECTED';end if;
  reset role;

  set local role authenticated;
  perform public.erp_restaurant_pos_display_focus(device_id,'cart',null);
  reset role;
  set local role anon;
  result:=public.erp_restaurant_customer_display(tok);
  if (result->>'number')::bigint<>draft_num or jsonb_array_length(result->'lines')<>0 then
    raise exception 'RETURN_TO_CART_FAILED';
  end if;
  reset role;

  set local role authenticated;
  perform public.erp_restaurant_pos_display_focus(device_id,'pin',kitchen_id);
  reset role;
  update restaurant_pos_private.displays
    set token_hash=encode(extensions.digest(tok2,'sha256'),'hex')
    where device_id=device_id;
  set local role anon;
  result:=public.erp_restaurant_customer_display(tok2);
  if (result->>'number')::bigint<>draft_num then
    raise exception 'REPAIR_LEAKS_PREVIOUS_CUSTOMER_PIN';
  end if;
  reset role;
end $test$;
