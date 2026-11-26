-- Atomic supplier contact and primary-product assignment. No reassignment or financial writes.
create or replace function public.erp_save_supplier_catalog(p_restaurant_id uuid,p_supplier_id uuid,p_contact jsonb,p_product_ids uuid[])
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid; v_product uuid; v_count int=0; v_requested int; v_name text; v_supplier_branch uuid; v_status boolean;
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
  update public.products set supplier_id=v_id where id=v_product and restaurant_id=p_restaurant_id and (supplier_id is null or supplier_id=v_id) and coalesce(is_active,true) and coalesce(status,'active') not in ('inactive','discontinued') and (not exists(select 1 from public.restaurants r where r.id=p_restaurant_id and lower(coalesce(nullif(btrim(r.business_type::text),''),r.business_mode::text)) in ('restaurant','cafe')) or restaurant_product_type='raw_material');
  if not found then raise exception 'Product unavailable or already assigned to another supplier';end if;
  v_count=v_count+1;
 end loop;
 return jsonb_build_object('supplier_id',v_id,'assigned',v_count);
end $$;
revoke all on function public.erp_save_supplier_catalog(uuid,uuid,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.erp_save_supplier_catalog(uuid,uuid,jsonb,uuid[]) to authenticated;

create or replace function public.erp_import_restaurant_materials_v2(p_restaurant_id uuid,p_rows jsonb,p_file_name text,p_commit boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r jsonb; prepared jsonb='[]'; errors jsonb='[]'; c uuid; sub uuid; child uuid; unit_value text; brand_value text; supplier_value uuid; supplier_ref text; n int; idx int=0; v_sku text; v_barcode text; cost numeric; price numeric; vat numeric; mn numeric; mx numeric; wp numeric; mp numeric; category_name text; p jsonb; job uuid;
begin
 if auth.uid() is null or public.erp_current_role() is distinct from 'owner' or not coalesce(public.erp_can_write_module_scope_text(p_restaurant_id::text,null,'updateInventory'),false) then raise exception 'Access denied' using errcode='42501'; end if;
 if not exists(select 1 from public.restaurants where id=p_restaurant_id and lower(coalesce(nullif(btrim(business_type::text),''),business_mode::text)) in ('restaurant','cafe')) then raise exception 'Restaurant or cafe required';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid rows';end if;
 if jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'Import 1 to 500 rows';end if;
 if p_commit then perform pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text,0));end if;
 for r in select value from jsonb_array_elements(p_rows) loop
 idx=idx+1;
 begin
 v_sku=upper(btrim(coalesce(r->>'sku','')));v_barcode=nullif(btrim(r->>'barcode'),'');
 if v_sku='' or length(v_sku)>120 or length(btrim(coalesce(r->>'name','')))=0 then raise exception 'Name and SKU required';end if;
 if exists(select 1 from public.products x where x.restaurant_id=p_restaurant_id and (upper(btrim(x.sku))=v_sku or (v_barcode is not null and btrim(x.barcode)=v_barcode))) or exists(select 1 from jsonb_array_elements(prepared) x where x->>'sku'=v_sku or (v_barcode is not null and x->>'barcode'=v_barcode)) then raise exception 'Existing or duplicate SKU/barcode; no overwrite';end if;
 select count(*),(array_agg(id))[1],(array_agg(name))[1] into n,c,category_name from public.product_categories where restaurant_id=p_restaurant_id and parent_id is null and coalesce(is_active,true) and lower(btrim(name))=lower(btrim(r->>'category'));
 if n<>1 then raise exception 'Select an existing unique active main category';end if;
 sub=null;child=null;
 if nullif(btrim(r->>'subcategory'),'') is not null then
 select count(*),(array_agg(id))[1] into n,sub from public.product_categories where restaurant_id=p_restaurant_id and parent_id=c and coalesce(is_active,true) and lower(btrim(name))=lower(btrim(r->>'subcategory'));
 if n<>1 then raise exception 'Subcategory not found under main category';end if;
 end if;
 if nullif(btrim(r->>'child_category'),'') is not null then
 select count(*),(array_agg(id))[1] into n,child from public.product_categories where restaurant_id=p_restaurant_id and parent_id=sub and coalesce(is_active,true) and lower(btrim(name))=lower(btrim(r->>'child_category'));
 if n<>1 then raise exception 'Child category not found under subcategory';end if;
 end if;
 select count(distinct coalesce(nullif(abbreviation,''),name)),min(coalesce(nullif(abbreviation,''),name)) into n,unit_value from public.product_units where (restaurant_id=p_restaurant_id or (restaurant_id is null and is_system)) and coalesce(is_active,true) and (lower(btrim(abbreviation))=lower(btrim(r->>'unit')) or lower(btrim(name))=lower(btrim(r->>'unit')));
 if n<>1 then raise exception 'Select an existing unique active unit';end if;
 brand_value=null;
 if nullif(btrim(r->>'brand'),'') is not null then
 select brand into brand_value from public.product_brand_master where restaurant_id=p_restaurant_id and brand_key=lower(btrim(regexp_replace(r->>'brand','[[:space:]]+',' ','g'))) and is_active;
 if brand_value is null then raise exception 'Register an active brand first';end if;
 end if;
 supplier_ref=nullif(btrim(r->>'supplier'),'');
 if supplier_ref is null then raise exception 'Primary Supplier is required';end if;
 select count(*),(array_agg(id))[1] into n,supplier_value from public.suppliers where restaurant_id=p_restaurant_id and branch_id is null and status is true and (id::text=supplier_ref or lower(btrim(name))=lower(supplier_ref));
 if n<>1 then raise exception 'Select a unique active business-wide supplier';end if;
 cost=coalesce((r->>'purchase_cost')::numeric,0);price=coalesce((r->>'selling_price')::numeric,0);vat=coalesce((r->>'tax_rate')::numeric,0);mn=coalesce((r->>'min_stock')::numeric,0);mx=coalesce((r->>'max_stock')::numeric,0);wp=coalesce((r->>'wholesale_price')::numeric,0);mp=coalesce((r->>'minimum_selling_price')::numeric,0);
 if least(cost,price,vat,mn,mx,wp,mp)<0 or greatest(cost,price,mn,mx,wp,mp)>1000000000 or vat>100 or mp>price or (mx>0 and mn>mx) or coalesce(r->>'status','') not in ('active','inactive','discontinued') then raise exception 'Invalid pricing, stock limits or status';end if;
 prepared=prepared||jsonb_build_array(jsonb_build_object('sku',v_sku,'barcode',v_barcode,'name',btrim(r->>'name'),'name_en',nullif(btrim(r->>'name_en'),''),'name_ar',nullif(btrim(r->>'name_ar'),''),'name_fa',nullif(btrim(r->>'name_fa'),''),'category_id',c,'subcategory_id',sub,'category',category_name,'unit',unit_value,'brand',brand_value,'supplier_id',supplier_value,'purchase_cost',cost,'selling_price',price,'tax_rate',vat,'min_stock',mn,'max_stock',mx,'status',r->>'status','custom_attributes',jsonb_build_object('__erp_master',jsonb_build_object('product_type','stock','costing_method','weighted_average','track_inventory',true,'allow_negative_stock',false,'sellable',false,'purchasable',true,'pos_visibility','hidden','price_includes_tax',false,'wholesale_price',wp,'minimum_selling_price',mp,'child_category_id',child))));
 exception when others then errors=errors||jsonb_build_array(jsonb_build_object('row',idx+1,'sku',v_sku,'message',sqlerrm));end;
 end loop;
 if jsonb_array_length(errors)>0 then return jsonb_build_object('ready',jsonb_array_length(prepared),'errors',errors,'created',0);end if;
 if not p_commit then return jsonb_build_object('ready',jsonb_array_length(prepared),'errors',errors,'created',0);end if;
 insert into public.restaurant_material_import_jobs(restaurant_id,file_name,created_rows) values(p_restaurant_id,left(coalesce(p_file_name,'materials.xlsx'),255),idx) returning id into job;
 for p in select value from jsonb_array_elements(prepared) loop
 insert into public.products(restaurant_id,product_id,sku,barcode,name,name_en,name_ar,name_fa,category_id,subcategory_id,category,unit,brand,supplier_id,purchase_cost,default_cost,selling_price,default_price,tax_rate,min_stock,max_stock,current_stock,status,is_active,restaurant_product_type,custom_attributes)
 values(p_restaurant_id,gen_random_uuid()::text,p->>'sku',p->>'barcode',p->>'name',p->>'name_en',p->>'name_ar',p->>'name_fa',(p->>'category_id')::uuid,(p->>'subcategory_id')::uuid,p->>'category',p->>'unit',p->>'brand',(p->>'supplier_id')::uuid,(p->>'purchase_cost')::numeric,(p->>'purchase_cost')::numeric,(p->>'selling_price')::numeric,(p->>'selling_price')::numeric,(p->>'tax_rate')::numeric,(p->>'min_stock')::numeric,(p->>'max_stock')::numeric,0,p->>'status',p->>'status'='active','raw_material',p->'custom_attributes');
 end loop;
 return jsonb_build_object('ready',idx,'errors',errors,'created',idx,'job_id',job);
end $$;
revoke all on function public.erp_import_restaurant_materials_v2(uuid,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.erp_import_restaurant_materials_v2(uuid,jsonb,text,boolean) to authenticated;
