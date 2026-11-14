-- Add branch-scoped, localized category labels to existing non-posting portal order catalog.
-- Read-only function replacement; no changes to orders, prices, inventory, permissions, or payments.
-- Categories are the same managed categories used by Restaurant POS and Product Master.
create or replace function public.erp_portal_order_context(
 p_restaurant_id uuid default null,p_branch_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m public.erp_memberships; b uuid; kitchen boolean; config portal_order_private.route_settings;
 v_catalog jsonb := '[]'::jsonb; v_requests jsonb := '[]'::jsonb; v_roles jsonb := '[]'::jsonb;
begin
 m:=portal_order_private.membership(p_restaurant_id);
 b:=portal_order_private.branch_for(m,p_branch_id);
 kitchen:=portal_order_private.restaurant_kind(m.restaurant_id);
 select * into config from portal_order_private.route_settings where restaurant_id=m.restaurant_id and role=m.role;
 if coalesce(config.allow_manager,false) or (kitchen and coalesce(config.allow_kitchen,false)) then
  if kitchen then
   select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'name_ar',v.name_ar,
     'name_fa',v.name_fa,'station',v.station,'price',v.price,
     'category_key',coalesce('id:'||v.category_id::text,'legacy:'||lower(btrim(coalesce(nullif(v.category,''),'Other')))),
     'category',coalesce(nullif(v.category_name,''),nullif(v.category,''),'Other'),
     'category_ar',coalesce(nullif(v.category_ar,''),nullif(v.category_name,''),nullif(v.category,''),'Other'),
     'category_fa',coalesce(nullif(v.category_fa,''),nullif(v.category_name,''),nullif(v.category,''),'Other'))
     order by v.sort_order,v.category_name,v.name,v.id),'[]'::jsonb)
   into v_catalog
   from (select q.id,q.name,q.name_ar,q.name_fa,q.station,q.price,q.category_id,q.category,
       c.name as category_name,c.name_ar as category_ar,c.name_fa as category_fa,
       coalesce(c.sort_order,999999) as sort_order
     from restaurant_pos_private.menu q
     left join public.product_categories c on c.id=q.category_id
       and c.restaurant_id=q.restaurant_id and (c.branch_id is null or c.branch_id=q.branch_id)
       and coalesce(c.is_active,true)
     where q.restaurant_id=m.restaurant_id and q.branch_id=b
       and q.active order by coalesce(c.sort_order,999999),coalesce(c.name,q.category),q.name,q.id limit 250) v;
  else
   select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'name_ar',v.name_ar,
     'name_fa',v.name_fa,'price',v.price,
     'category_key',coalesce('id:'||v.category_id::text,'uncategorized'),
     'category',coalesce(nullif(v.category_name,''),'Other'),
     'category_ar',coalesce(nullif(v.category_ar,''),nullif(v.category_name,''),'Other'),
     'category_fa',coalesce(nullif(v.category_fa,''),nullif(v.category_name,''),'Other'))
     order by v.sort_order,v.category_name,v.name,v.id),'[]'::jsonb)
   into v_catalog
   from (select p.id,p.name,p.name_ar,p.name_fa,p.category_id,
    c.name as category_name,c.name_ar as category_ar,c.name_fa as category_fa,
    coalesce(c.sort_order,999999) as sort_order,
    greatest(0,coalesce(p.selling_price,p.default_price,0))::numeric(16,2) as price
    from public.products p
    left join public.product_categories c on c.id=p.category_id
      and c.restaurant_id=p.restaurant_id and (c.branch_id is null or c.branch_id=p.branch_id)
      and coalesce(c.is_active,true)
    where p.restaurant_id=m.restaurant_id
      and (p.branch_id=b or p.branch_id is null) and coalesce(p.is_active,true)
    order by coalesce(c.sort_order,999999),coalesce(c.name,'Other'),p.name,p.id limit 250) v;
  end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'recipient',v.recipient,'status',v.status,
   'items',v.items,'total_quote',v.total_quote,'customer_reference',v.customer_reference,
   'created_at',v.created_at,'notes',v.notes) order by v.created_at desc),'[]'::jsonb)
 into v_requests from (select id,recipient,status,items,total_quote,customer_reference,created_at,notes
   from portal_order_private.intake where actor_id=auth.uid()
   and restaurant_id=m.restaurant_id and branch_id=b
   order by created_at desc limit 40) v;
 if m.role='owner' then
   select coalesce(jsonb_agg(jsonb_build_object('role',roles.role,
     'allow_manager',coalesce(s.allow_manager,false),
     'allow_kitchen',coalesce(s.allow_kitchen,false)) order by roles.role),'[]'::jsonb)
   into v_roles from (select unnest(array['driver','employee','manager','supplier','customer','owner']) role) roles
   left join portal_order_private.route_settings s on s.restaurant_id=m.restaurant_id and s.role=roles.role;
 end if;
 return jsonb_build_object('role',m.role,'restaurant_id',m.restaurant_id,'branch_id',b,
  'branch_name',(select name from public.branches where id=b),'restaurant_mode',kitchen,
  'allow_manager',coalesce(config.allow_manager,false),
  'allow_kitchen',kitchen and coalesce(config.allow_kitchen,false),
  'catalog',v_catalog,'my_requests',v_requests,'role_settings',v_roles,
  'posting_mode','NON_POSTING_REQUEST_ONLY');
end $$;

