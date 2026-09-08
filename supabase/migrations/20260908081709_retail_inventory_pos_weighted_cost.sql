create or replace function retail_inventory_private.post(
  p_restaurant uuid,p_warehouse uuid,p_product uuid,p_quantity numeric,p_cost numeric,p_kind text,
  p_reference uuid,p_label text,p_key text,p_document uuid default null,p_batch text default '',p_expiry date default null,
  p_allow_shortage boolean default false,p_quarantine boolean default false,p_lot uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.retail_inventory_warehouses; b public.retail_inventory_balances; l public.retail_inventory_lots;
  v_cost numeric; v_remaining numeric; v_take numeric; v_alloc jsonb:='[]'; v_blocked numeric;
begin
  if exists(select 1 from public.retail_inventory_ledger where event_key=p_key) then return '[]'; end if;
  if p_cost is not null and (p_cost<0 or p_cost='NaN'::numeric or p_cost>1000000000) then raise exception 'Invalid stock cost'; end if;
  if p_quantity is null or p_quantity='NaN'::numeric or p_quantity=0 or abs(p_quantity)>1000000000 then raise exception 'Invalid stock quantity' using errcode='22023'; end if;
  select * into w from public.retail_inventory_warehouses where id=p_warehouse and restaurant_id=p_restaurant and is_active;
  if w.id is null or not exists(select 1 from public.products where id=p_product and restaurant_id=p_restaurant) then raise exception 'Product and warehouse must belong to this business' using errcode='42501'; end if;
  insert into public.retail_inventory_balances(restaurant_id,branch_id,warehouse_id,product_id) values(p_restaurant,w.branch_id,w.id,p_product) on conflict(warehouse_id,product_id) do nothing;
  select * into b from public.retail_inventory_balances where warehouse_id=w.id and product_id=p_product for update;
  if exists(select 1 from public.retail_inventory_ledger where event_key=p_key) then return '[]'; end if;
  v_cost:=case when p_quantity>0 then greatest(coalesce(p_cost,b.average_cost,0),0) else b.average_cost end;
  if p_quantity<0 then
    select coalesce(sum(greatest(quantity,0)),0) into v_blocked from public.retail_inventory_lots where balance_id=b.id and (quarantined or expiry_date < (now() at time zone 'Asia/Riyadh')::date);
    if not p_allow_shortage and p_lot is null and b.quantity-b.reserved-v_blocked < -p_quantity then raise exception 'Insufficient available stock' using errcode='23514'; end if;
    v_remaining:=-p_quantity;
    for l in select * from public.retail_inventory_lots where balance_id=b.id and quantity>0
      and (p_lot is null or id=p_lot) and (p_lot is not null or (not quarantined and (expiry_date is null or expiry_date >= (now() at time zone 'Asia/Riyadh')::date)))
      order by expiry_date nulls last,id for update loop
      v_take:=least(v_remaining,l.quantity);
      update public.retail_inventory_lots set quantity=quantity-v_take,updated_at=now() where id=l.id;
      v_alloc:=v_alloc||jsonb_build_array(jsonb_build_object('quantity',v_take,'batch_number',l.batch_number,'expiry_date',l.expiry_date,'unit_cost',v_cost,'quarantined',l.quarantined));
      v_remaining:=v_remaining-v_take; exit when v_remaining=0;
    end loop;
    if v_remaining>0 then
      if not p_allow_shortage then raise exception 'Insufficient stock in the selected batch' using errcode='23514'; end if;
      insert into public.retail_inventory_lots(balance_id,restaurant_id,branch_id,quantity,unit_cost) values(b.id,p_restaurant,w.branch_id,-v_remaining,v_cost)
        on conflict(balance_id,batch_number,expiry_date,quarantined) do update set quantity=public.retail_inventory_lots.quantity+excluded.quantity,updated_at=now();
    end if;
  else
    insert into public.retail_inventory_lots(balance_id,restaurant_id,branch_id,batch_number,expiry_date,quantity,unit_cost,quarantined)
      values(b.id,p_restaurant,w.branch_id,coalesce(p_batch,''),p_expiry,p_quantity,v_cost,p_quarantine)
      on conflict(balance_id,batch_number,expiry_date,quarantined) do update set quantity=public.retail_inventory_lots.quantity+excluded.quantity,unit_cost=excluded.unit_cost,updated_at=now();
  end if;
  update public.retail_inventory_balances set quantity=quantity+p_quantity,
    average_cost=case when p_quantity>0 then (greatest(quantity,0)*average_cost+p_quantity*v_cost)/(greatest(quantity,0)+p_quantity) else average_cost end,
    version=version+1,updated_at=now() where id=b.id;
  insert into public.retail_inventory_ledger(restaurant_id,branch_id,balance_id,product_id,quantity,unit_cost,balance_after,kind,reference_id,reference_label,event_key,document_id,actor_id)
    values(p_restaurant,w.branch_id,b.id,p_product,p_quantity,v_cost,b.quantity+p_quantity,p_kind,p_reference,p_label,p_key,p_document,auth.uid());
  return v_alloc;
end $$;
