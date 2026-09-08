begin;
do $$
declare
  owner_id uuid := gen_random_uuid(); other_owner uuid := gen_random_uuid(); restaurant_owner uuid := gen_random_uuid();
  r uuid; other_r uuid; nonretail_r uuid; p uuid := gen_random_uuid(); existing_p uuid := gen_random_uuid();
  a jsonb; b jsonb; draft jsonb; blocked boolean; n integer; before_product jsonb; after_product jsonb;
begin
  insert into auth.users(id,email,raw_user_meta_data) values
    (owner_id,'barcode-owner-'||owner_id||'@example.invalid','{"role":"owner","business_type":"retail","full_name":"Barcode test","company_name":"Barcode test","branch_name":"Main"}'),
    (other_owner,'barcode-other-'||other_owner||'@example.invalid','{"role":"owner","business_type":"retail","full_name":"Isolation test","company_name":"Isolation test","branch_name":"Main"}'),
    (restaurant_owner,'barcode-restaurant-'||restaurant_owner||'@example.invalid','{"role":"owner","business_type":"restaurant","full_name":"Portal test","company_name":"Portal test","branch_name":"Main"}');
  select restaurant_id into r from public.erp_memberships where user_id=owner_id;
  select restaurant_id into other_r from public.erp_memberships where user_id=other_owner;
  select restaurant_id into nonretail_r from public.erp_memberships where user_id=restaurant_owner;
  insert into public.subscriptions(restaurant_id,subscription_status,plan,trial_end)
    values(r,'TRIAL','growth_40',current_date+7),(other_r,'TRIAL','growth_40',current_date+7),(nonretail_r,'TRIAL','growth_40',current_date+7)
    on conflict(restaurant_id) where restaurant_id is not null do update set subscription_status='TRIAL',plan='growth_40',trial_end=current_date+7;
  insert into public.products(id,restaurant_id,product_id,name,sku,unit,purchase_cost,is_active,barcode) values
    (p,r,'TEST-'||p,'Barcode test','TEST-'||p,'pc',4,true,null),
    (existing_p,r,'TEST-'||existing_p,'Manufacturer code','TEST-'||existing_p,'pc',7,true,'000742');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  set local role authenticated;
  select to_jsonb(products)-'barcode'-'barcode_normalized'-'updated_date' into before_product from public.products where id=p;
  draft := public.erp_create_product_barcode(r);
  if draft->>'barcode' !~ '^BC-[0-9]{12}$' or (draft->>'saved')::boolean then raise exception 'Invalid draft: %',draft; end if;
  if exists(select 1 from public.products where id=p and barcode is not null) then raise exception 'Draft mutated a product'; end if;
  a := public.erp_create_product_barcode(r,p);
  b := public.erp_create_product_barcode(r,p);
  if a->>'barcode' is distinct from b->>'barcode' or not (a->>'saved')::boolean or (b->>'generated')::boolean then raise exception 'Allocation not idempotent'; end if;
  if a->>'barcode'=draft->>'barcode' then raise exception 'Sequence collision'; end if;
  select to_jsonb(products)-'barcode'-'barcode_normalized'-'updated_date' into after_product from public.products where id=p;
  if before_product is distinct from after_product then raise exception 'Unrelated product data changed'; end if;
  if (public.erp_create_product_barcode(r,existing_p)->>'barcode') is distinct from '000742' then raise exception 'Manufacturer barcode overwritten'; end if;
  select count(*) into n from public.erp_search_master_products(r,null,a->>'barcode','all','all','all','name_asc',1,20) where id=p;
  if n <> 1 then raise exception 'Saved barcode not searchable'; end if;
  blocked:=false;
  begin update public.products set barcode=a->>'barcode' where id=existing_p; exception when unique_violation then blocked:=true; end;
  if not blocked then raise exception 'Duplicate internal code accepted'; end if;
  blocked:=false;
  begin perform public.erp_create_product_barcode(other_r); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Cross-tenant allocation accepted'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',other_owner,'role','authenticated')::text,true);
  blocked:=false;
  begin perform public.erp_create_product_barcode(other_r,p); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Cross-tenant product accepted'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',restaurant_owner,'role','authenticated')::text,true);
  blocked:=false;
  begin perform public.erp_create_product_barcode(nonretail_r); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Restaurant portal accepted'; end if;
  perform set_config('request.jwt.claims','{}',true);
  blocked:=false;
  begin perform public.erp_create_product_barcode(r); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Unauthenticated allocation accepted'; end if;
  reset role;
  if has_function_privilege('anon','public.erp_create_product_barcode(uuid,uuid)','execute') then raise exception 'Anonymous execute granted'; end if;
end;
$$;
select 'Barcode workflow, preservation, uniqueness, search and isolation passed' as result;
rollback;
