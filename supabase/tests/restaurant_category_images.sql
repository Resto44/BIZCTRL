-- Synthetic fixtures only; all writes are rolled back.
begin;
do $test$
declare u uuid:=gen_random_uuid(); r uuid; b uuid; other_b uuid:=gen_random_uuid();
 cat uuid:=gen_random_uuid(); dish uuid:=gen_random_uuid(); v jsonb; denied boolean; bad text;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'category-image-'||u||'@example.invalid','{"role":"owner","business_type":"restaurant","full_name":"Image fixture","company_name":"Image fixture","branch_name":"Test"}');
 select restaurant_id,branch_id into r,b from public.erp_memberships where user_id=u;
 assert r is not null and b is not null,'Fixture scope missing';
 insert into public.subscriptions(restaurant_id,subscription_status,plan,trial_end) values(r,'TRIAL','growth_40',current_date+7)
 on conflict(restaurant_id) where restaurant_id is not null do update set subscription_status='TRIAL',plan='growth_40',trial_end=current_date+7;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 insert into public.branches(id,restaurant_id,branch_key,name) values(other_b,r,other_b::text,'Other');
 set local role authenticated;
 perform public.erp_restaurant_pos_setup(r,b,'category_save',jsonb_build_object('id',cat,'name','Grills','image_url','https://example.com/grills.jpg'));
 v:=public.erp_restaurant_pos_setup(r,b,'category_list','{}');
 assert v->'categories'->0->>'image_url'='https://example.com/grills.jpg','Image did not save';
 perform public.erp_restaurant_pos_setup(r,b,'category_save',jsonb_build_object('id',cat,'name','Grills renamed'));
 v:=public.erp_restaurant_pos_setup(r,b,'category_list','{}');
 assert v->'categories'->0->>'image_url'='https://example.com/grills.jpg','Old client erased image';
 foreach bad in array array['http://example.com/x.jpg','javascript:alert(1)','https://','https://user:password@example.com/x.jpg'] loop
  denied:=false;
  begin perform public.erp_restaurant_pos_setup(r,b,'category_save',jsonb_build_object('id',cat,'name','Grills','image_url',bad));exception when check_violation then denied:=true;end;
  assert denied,'Unsafe image URL accepted';
 end loop;
 denied:=false;
 begin perform public.erp_restaurant_pos_setup(r,other_b,'category_save',jsonb_build_object('id',cat,'name','Foreign','image_url','https://example.com/other.jpg'));exception when insufficient_privilege then denied:=true;end;
 assert denied,'Cross-branch category edited';
 perform public.erp_restaurant_pos_setup(r,b,'menu',jsonb_build_object('id',dish,'category_id',cat,'name','Grill meal','price',22,'tax_rate',0,'stock_mode','untracked','confirm_untracked',true));
 v:=public.erp_restaurant_pos_catalog(r,b,'');
 assert v->'categories'->0->>'image_url'='https://example.com/grills.jpg','Catalog category image missing';
 assert v->'menu'->0->>'category_image_url'='https://example.com/grills.jpg','Catalog menu category image missing';
 v:=public.erp_restaurant_pos_workspace(r,b,current_date);
 assert v->'menu'->0->>'category_image_url'='https://example.com/grills.jpg','POS image missing';
 perform public.erp_restaurant_pos_setup(r,b,'category_save',jsonb_build_object('id',cat,'name','Grills','image_url',''));
 v:=public.erp_restaurant_pos_setup(r,b,'category_list','{}');
 assert v->'categories'->0->>'image_url' is null,'Image removal failed';
 perform set_config('request.jwt.claims','{}',true);
 denied:=false;
 begin perform public.erp_restaurant_pos_setup(r,b,'category_save',jsonb_build_object('id',cat,'name','Anonymous'));exception when insufficient_privilege then denied:=true;end;
 assert denied,'Anonymous category edit accepted';
 reset role;
end $test$;
rollback;
