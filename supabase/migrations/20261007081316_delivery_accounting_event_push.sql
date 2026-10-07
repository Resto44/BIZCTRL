alter table public.owner_record_events add column if not exists context jsonb not null default '{}'::jsonb;
CREATE OR REPLACE FUNCTION push_private.capture_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb; tenant uuid; ev uuid; context jsonb; record_amount text; record_branch text; record_branch_name text; record_currency text;
begin
 r:=case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
 if TG_OP='UPDATE' and (to_jsonb(OLD)-array['updated_at','updated_date','last_login_at','last_seen_at'])=(r-array['updated_at','updated_date','last_login_at','last_seen_at']) then return NEW; end if;
 -- Resolve legacy org-only rows through the authoritative restaurants mapping.
 select id,currency into tenant,record_currency from public.restaurants where id::text=r->>'restaurant_id'
  or (nullif(r->>'restaurant_id','') is null and org_id=r->>'org_id') limit 1;
 if tenant is null then return coalesce(NEW,OLD); end if;
 if not exists(select 1 from public.erp_memberships where restaurant_id=tenant and role='owner' and status='approved') then return coalesce(NEW,OLD); end if;
 -- Snapshot only approved presentation fields; DELETE uses OLD and survives deletion.
 record_branch:=coalesce(nullif(r->>'branch_id',''),nullif(r->>'branch',''),nullif(r->>'branch_key',''));
 if TG_TABLE_NAME='branches' then record_branch:=r->>'id'; record_branch_name:=r->>'name';
 else select b.name into record_branch_name from public.branches b where b.restaurant_id=tenant and (b.id::text=record_branch or b.branch_key=record_branch) limit 1; end if;
 record_amount:=coalesce(r->>'total_amount',r->>'net_total',r->>'amount',r->>'total');
 if TG_TABLE_NAME='purchases' then
  record_amount:=((coalesce((r->>'qty')::numeric,0))*coalesce((r->>'used_price')::numeric,(r->>'current_price')::numeric,0))::text;
 elsif TG_TABLE_NAME='daily_sales' then
  record_amount:=(coalesce((r->>'restaurant_cash')::numeric,(r->>'cash')::numeric,0)+coalesce((r->>'restaurant_network')::numeric,(r->>'network')::numeric,0)+coalesce((r->>'credit')::numeric,0)+coalesce((r->>'custom_sources_total')::numeric,0))::text;
 end if;
 context:=jsonb_strip_nulls(jsonb_build_object('currency',record_currency,'branch_name',record_branch_name,'amount',record_amount,'cash',coalesce(r->>'cash_amount',r->>'cash_collected'),'network',coalesce(r->>'network_amount',r->>'online_collected'),'status',coalesce(r->>'closing_state',r->>'approval_status',r->>'status'),'date',coalesce(r->>'date',r->>'business_date',r->>'shift_date')));
 insert into public.owner_record_events(restaurant_id,entity,action,record_id,reference,branch,actor_id,context)
 values(tenant,TG_TABLE_NAME,lower(TG_OP),r->>'id',left(coalesce(r->>'invoice_number',r->>'order_number',r->>'name',r->>'full_name',r->>'driver_name',r->>'description',r->>'name_en',r->>'id'),100),left(record_branch,100),auth.uid(),context) returning id into ev;
 insert into public.owner_push_deliveries(event_id,device_id)
 select ev,d.id from public.owner_push_devices d where d.restaurant_id=tenant and d.enabled and exists(
 select 1 from public.erp_memberships m where m.user_id=d.user_id and m.restaurant_id=tenant and m.role='owner' and m.status='approved');
 return coalesce(NEW,OLD);
end $function$
;
CREATE OR REPLACE FUNCTION public.owner_push_financial_summary(p_restaurant_id uuid, p_branch_id uuid, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_key text; v_currency text; v_type text; v_sales numeric; v_purchases numeric; v_expenses numeric; v_network numeric; v_pos numeric; v_sources numeric; v_delivery_cash numeric; v_delivery_network numeric;
begin
 if p_date is null or p_branch_id is null then raise exception 'A reporting date and branch are required'; end if;
 select currency,business_type into v_currency,v_type from public.restaurants where id=p_restaurant_id;
 if not found then raise exception 'Unknown business'; end if;
 if p_branch_id is not null then
  select branch_key into v_key from public.branches where id=p_branch_id and restaurant_id=p_restaurant_id;
  if not found then raise exception 'Branch does not belong to business'; end if;
 end if;
 if lower(coalesce(v_type,'')) in ('supermarket','retail') then
  select coalesce(sum(case when transaction_type='sale' then net_total when transaction_type in ('refund','void') then -net_total else 0 end),0)
  into v_sales from public.retail_pos_transactions
  where restaurant_id=p_restaurant_id and business_date=p_date and status in ('posted','approved') and (p_branch_id is null or branch_id=p_branch_id);
 else
  select coalesce(sum(coalesce(restaurant_cash,cash,0)+coalesce(restaurant_network,network,0)+coalesce(credit,0)+coalesce(custom_sources_total,0)),0)
  into v_sales from public.daily_sales
  where restaurant_id=p_restaurant_id::text and date=p_date and coalesce(closing_state,'finalized') in ('finalized','locked')
  and (p_branch_id is null or branch_id=p_branch_id or (branch_id is null and branch=v_key));
 end if;
 -- Channel figures are overlapping views of sales, never added to revenue again.
 if lower(coalesce(v_type,'')) in ('supermarket','retail') then
  v_pos:=v_sales;
  v_sources:=0;
  select coalesce(sum(case when t.transaction_type='sale' then p.amount when t.transaction_type in ('refund','void') then -p.amount else 0 end),0)
  into v_network from public.retail_pos_transaction_payments p
  join public.retail_pos_transactions t on t.id=p.transaction_id
  where t.restaurant_id=p_restaurant_id and t.branch_id=p_branch_id and t.business_date=p_date
  and t.status in ('posted','approved') and p.payment_method in ('mada','apple_pay','card');
 else
  select coalesce(sum(s.reported_network_sales),0),
   coalesce(sum(case when s.reference_id like 'restaurant-pos:%' then coalesce(s.restaurant_cash,s.cash,0)+coalesce(s.restaurant_network,s.network,0)+coalesce(s.credit,0)
    else (select coalesce(sum(case when e.entry->>'amount' ~ '^-?[0-9]+([.][0-9]+)?$' then (e.entry->>'amount')::numeric else 0 end),0) from public.sales_source_snapshot_entries(s.pos_entries_json) e) end),0),
   coalesce(sum((select coalesce(sum(case when coalesce(e.entry->>'amount',e.entry->>'today_amount') ~ '^-?[0-9]+([.][0-9]+)?$' and coalesce(e.entry->>'included_in_revenue','true')<>'false'
    then coalesce(e.entry->>'amount',e.entry->>'today_amount')::numeric else 0 end),0) from public.sales_source_snapshot_entries(s.sales_sources_json) e)),0)
  into v_network,v_pos,v_sources
  from public.daily_sales_network_report s where s.restaurant_id=p_restaurant_id::text and s.date=p_date and coalesce(s.closing_state,'finalized') in ('finalized','locked')
  and (s.branch_id=p_branch_id or (s.branch_id is null and s.branch=v_key));
 end if;
 select coalesce(sum(cost),0) into v_purchases from (
  select total_amount as cost from public.supplier_invoices
  where restaurant_id::text=p_restaurant_id::text and date=p_date and approval_status in ('approved','auto_approved')
  and (p_branch_id is null or branch_id=p_branch_id or (branch_id is null and branch=v_key))
  union all
  select coalesce(qty,0)*coalesce(used_price,current_price,0) from public.purchases p
  where p.restaurant_id::text=p_restaurant_id::text and p.date=p_date and p.supplier_invoice_id is null
  and (p_branch_id is null or p.branch_id=p_branch_id or (p.branch_id is null and p.branch=v_key))
 ) costs;
 -- Daily variable costs plus allocated fixed costs; same allocation rules as Closing.
 with scoped as (
  select e.*,coalesce(c.is_fixed,false) or lower(coalesce(c.expense_type,''))='fixed' as fixed
  from public.expenses e left join public.expense_categories c on c.id=coalesce(e.expense_category_id,e.category_id) and c.restaurant_id::text=p_restaurant_id::text
  where e.restaurant_id::text=p_restaurant_id::text
  and (p_branch_id is null or e.branch_id=p_branch_id or (e.branch_id is null and e.branch_key=v_key))
  and lower(coalesce(e.status,'')) not in ('cancelled','canceled','rejected','void','voided','deleted')
 ), fixed_sources as (
  select c.id,c.branch_id, greatest(coalesce(nullif(c.monthly_amount,0),e.amount,0),0)/greatest(coalesce(c.allocation_days,30),1) as cost
  from public.expense_categories c
  left join lateral (
   select s.amount from scoped s where coalesce(s.expense_category_id,s.category_id)=c.id and s.date<=p_date and date_trunc('month',s.date)=date_trunc('month',p_date)
   order by s.date desc,s.created_date desc,s.id desc limit 1
  ) e on true
  where c.restaurant_id::text=p_restaurant_id::text and coalesce(c.is_active,true)
  and (coalesce(c.is_fixed,false) or lower(coalesce(c.expense_type,''))='fixed')
  and (p_branch_id is null or c.branch_id=p_branch_id or (c.branch_id is null and e.amount is not null))
 ) select coalesce((select sum(greatest(amount,0)) from scoped where date=p_date and not fixed),0)+coalesce((select sum(round(cost,2)) from fixed_sources),0) into v_expenses;
 -- Delivery is a breakdown of posted sales, never extra revenue.
 -- Join the canonical closing to exclude drafts, cancelled entries and orphans.
 select coalesce(sum(d.cash_amount),0),coalesce(sum(d.network_amount),0)
 into v_delivery_cash,v_delivery_network
 from public.driver_sales_entries d join public.daily_sales s on s.id=d.closing_id
 where d.restaurant_id=p_restaurant_id and d.branch_id=p_branch_id and d.date=p_date
 and d.status='finalized' and s.restaurant_id=p_restaurant_id::text
 and (s.branch_id=p_branch_id or (s.branch_id is null and s.branch=v_key))
 and coalesce(s.closing_state,'finalized') in ('finalized','locked');
 return jsonb_build_object('date',p_date,'currency',coalesce(nullif(v_currency,''),'SAR'),'sales',v_sales,'purchases',v_purchases,'expenses',v_expenses,'net_profit',v_sales-v_purchases-v_expenses,'network_sales',v_network,'pos_sales',v_pos,'source_sales',v_sources,'delivery_sales',v_delivery_cash+v_delivery_network,'delivery_cash',v_delivery_cash,'delivery_network',v_delivery_network);
end $function$
;

alter table public.owner_push_preferences drop constraint owner_push_preferences_title_template_check;
alter table public.owner_push_preferences add constraint owner_push_preferences_title_template_check check(length(btrim(title_template)) between 1 and 100 and regexp_replace(title_template,'[{](business|branch|action|entity|reference|time|sales|expenses|purchases|net_profit|date|currency|network_sales|pos_sales|source_sales|delivery_sales|delivery_cash|delivery_network)[}]','','g') !~ '[{}]');

alter table public.owner_push_preferences drop constraint owner_push_preferences_body_template_check;
alter table public.owner_push_preferences add constraint owner_push_preferences_body_template_check check(length(btrim(body_template)) between 1 and 500 and regexp_replace(body_template,'[{](business|branch|action|entity|reference|time|sales|expenses|purchases|net_profit|date|currency|network_sales|pos_sales|source_sales|delivery_sales|delivery_cash|delivery_network)[}]','','g') !~ '[{}]');

revoke all on function public.owner_push_financial_summary(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.owner_push_financial_summary(uuid,uuid,date) to service_role;
revoke all on function push_private.capture_record() from public,anon,authenticated;

update public.owner_push_preferences set body_template=E'{branch} · {date}\nSales: {sales}\nPurchases: {purchases}\nExpenses: {expenses}\nNetwork sales: {network_sales}\nPOS sales: {pos_sales}\nSales Sources: {source_sales}\nDelivery sales: {delivery_sales}\nNet profit: {net_profit}' where body_template=E'{branch} · {date}\nSales: {sales}\nPurchases: {purchases}\nExpenses: {expenses}\nNetwork sales: {network_sales}\nPOS sales: {pos_sales}\nSales Sources: {source_sales}\nNet profit: {net_profit}';
alter table public.owner_push_preferences alter column body_template set default E'{branch} · {date}\nSales: {sales}\nPurchases: {purchases}\nExpenses: {expenses}\nNetwork sales: {network_sales}\nPOS sales: {pos_sales}\nSales Sources: {source_sales}\nDelivery sales: {delivery_sales}\nNet profit: {net_profit}';

update public.owner_push_preferences set body_template=E'{branch} · {date}\nالمبيعات: {sales}\nالمشتريات: {purchases}\nالمصروفات: {expenses}\nمبيعات الشبكة: {network_sales}\nمبيعات POS: {pos_sales}\nمصادر المبيعات: {source_sales}\nمبيعات التوصيل: {delivery_sales}\nصافي الربح: {net_profit}' where body_template=E'{branch} · {date}\nالمبيعات: {sales}\nالمشتريات: {purchases}\nالمصروفات: {expenses}\nمبيعات الشبكة: {network_sales}\nمبيعات POS: {pos_sales}\nمصادر المبيعات: {source_sales}\nصافي الربح: {net_profit}';

update public.owner_push_preferences set body_template=E'{branch} · {date}\nفروشات: {sales}\nخرید: {purchases}\nمصارف: {expenses}\nفروشات شبکه: {network_sales}\nفروشات POS: {pos_sales}\nفروشات Sales Sources: {source_sales}\nفروش دلیوری: {delivery_sales}\nفایدهٔ خالص: {net_profit}' where body_template=E'{branch} · {date}\nفروشات: {sales}\nخرید: {purchases}\nمصارف: {expenses}\nفروشات شبکه: {network_sales}\nفروشات POS: {pos_sales}\nفروشات Sales Sources: {source_sales}\nفایدهٔ خالص: {net_profit}';
