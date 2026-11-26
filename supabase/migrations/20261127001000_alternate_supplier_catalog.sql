-- Additional supplier relationships; primary supplier and historical invoices remain unchanged.
create table public.product_alternate_suppliers (
 restaurant_id uuid not null references public.restaurants(id) on delete cascade,
 product_id uuid not null references public.products(id) on delete cascade,
 supplier_id uuid not null references public.suppliers(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(restaurant_id,supplier_id,product_id)
);
alter table public.product_alternate_suppliers enable row level security;
revoke all on public.product_alternate_suppliers from public,anon,authenticated;
grant select,insert on public.product_alternate_suppliers to authenticated;
create policy alternate_supplier_read on public.product_alternate_suppliers for select to authenticated using (
 public.erp_current_role() <> 'supplier' and exists(select 1 from public.products p where p.id=product_alternate_suppliers.product_id and p.restaurant_id=product_alternate_suppliers.restaurant_id)
 and exists(select 1 from public.suppliers s where s.id=product_alternate_suppliers.supplier_id and s.restaurant_id=product_alternate_suppliers.restaurant_id)
);
create policy alternate_supplier_insert on public.product_alternate_suppliers for insert to authenticated with check (
 public.erp_current_role()='owner' and public.erp_can_write_module_scope_text(restaurant_id::text,null,'manageSuppliers') and public.erp_can_write_module_scope_text(restaurant_id::text,null,'updateInventory')
 and exists(select 1 from public.products p where p.id=product_alternate_suppliers.product_id and p.restaurant_id=product_alternate_suppliers.restaurant_id and coalesce(p.is_active,true) and coalesce(p.status,'active') not in ('inactive','discontinued'))
 and exists(select 1 from public.suppliers s where s.id=product_alternate_suppliers.supplier_id and s.restaurant_id=product_alternate_suppliers.restaurant_id and s.status is true and s.branch_id is null)
);
-- Atomic supplier contact and primary-product assignment. No reassignment or financial writes.
create or replace function public.erp_save_supplier_catalog(p_restaurant_id uuid,p_supplier_id uuid,p_contact jsonb,p_product_ids uuid[])
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_primary uuid; v_id uuid; v_product uuid; v_count int=0; v_requested int; v_name text; v_supplier_branch uuid; v_status boolean;
begin
 if auth.uid() is null or public.erp_current_role() is distinct from 'owner' or not coalesce(public.erp_can_write_module_scope_text(p_restaurant_id::text,null,'manageSuppliers'),false) or not coalesce(public.erp_can_write_module_scope_text(p_restaurant_id::text,null,'updateInventory'),false) then raise exception 'Access denied' using errcode='42501';end if;
 v_name=nullif(btrim(p_contact->>'name'),'');
 if v_name is null or char_length(v_name)>255 then raise exception 'Supplier name required (maximum 255 characters)';end if;
 if coalesce(cardinality(p_product_ids),0)>5000 then raise exception 'Maximum 5000 product assignments';end if;
 select count(distinct id) into v_requested from unnest(coalesce(p_product_ids,'{}'::uuid[])) as t(id);
 if p_supplier_id is null then
  insert into public.suppliers(restaurant_id,name,phone,email,address,notes,status,created_by) values(p_restaurant_id,v_name,p_contact->>'phone',p_contact->>'email',p_contact->>'address',p_contact->>'notes',true,auth.jwt()->>'email') returning id into v_id;
 else
  select id,branch_id,status into v_id,v_supplier_branch,v_status from public.suppliers where id=p_supplier_id and restaurant_id=p_restaurant_id for update;
  if v_id is null then raise exception 'Supplier not found';end if;
  if v_requested>0 and (v_supplier_branch is not null or v_status is distinct from true) then raise exception 'Active business-wide supplier required';end if;
  update public.suppliers set name=v_name,phone=p_contact->>'phone',email=p_contact->>'email',address=p_contact->>'address',notes=p_contact->>'notes' where id=v_id and restaurant_id=p_restaurant_id;
  if not found then raise exception 'Supplier update denied';end if;
 end if;
 for v_product in select distinct id from unnest(coalesce(p_product_ids,'{}'::uuid[])) as t(id) order by id loop
  select supplier_id into v_primary from public.products where id=v_product and restaurant_id=p_restaurant_id and coalesce(is_active,true) and coalesce(status,'active') not in ('inactive','discontinued') and (not exists(select 1 from public.restaurants r where r.id=p_restaurant_id and lower(coalesce(nullif(btrim(r.business_type::text),''),r.business_mode::text)) in ('restaurant','cafe')) or restaurant_product_type='raw_material') for update;
  if not found then raise exception 'Product unavailable';end if;
  if v_primary is null then
   update public.products set supplier_id=v_id where id=v_product and restaurant_id=p_restaurant_id and supplier_id is null;
   if not found then raise exception 'Product assignment failed';end if;
  elsif v_primary<>v_id then
   insert into public.product_alternate_suppliers(restaurant_id,product_id,supplier_id) values(p_restaurant_id,v_product,v_id) on conflict do nothing;
  end if;
  v_count=v_count+1;
 end loop;
 return jsonb_build_object('supplier_id',v_id,'assigned',v_count);
end $$;
revoke all on function public.erp_save_supplier_catalog(uuid,uuid,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.erp_save_supplier_catalog(uuid,uuid,jsonb,uuid[]) to authenticated;

