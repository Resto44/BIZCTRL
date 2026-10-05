-- Private financial aggregation exposed only to the authenticated push worker.
create or replace function public.owner_push_financial_summary(p_restaurant_id uuid, p_branch_id uuid, p_date date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_key text; v_currency text; v_type text; v_sales numeric; v_purchases numeric; v_expenses numeric;
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
 return jsonb_build_object('date',p_date,'currency',coalesce(nullif(v_currency,''),'SAR'),'sales',v_sales,'purchases',v_purchases,'expenses',v_expenses,'net_profit',v_sales-v_purchases-v_expenses);
end $$;
revoke all on function public.owner_push_financial_summary(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.owner_push_financial_summary(uuid,uuid,date) to service_role;

alter table public.owner_push_preferences drop constraint owner_push_preferences_title_template_check;
alter table public.owner_push_preferences drop constraint owner_push_preferences_body_template_check;
alter table public.owner_push_preferences add constraint owner_push_preferences_title_template_check check(length(btrim(title_template)) between 1 and 100 and regexp_replace(title_template,'[{](business|branch|action|entity|reference|time|sales|expenses|purchases|net_profit|date|currency)[}]','','g') !~ '[{}]');
alter table public.owner_push_preferences add constraint owner_push_preferences_body_template_check check(length(btrim(body_template)) between 1 and 500 and regexp_replace(body_template,'[{](business|branch|action|entity|reference|time|sales|expenses|purchases|net_profit|date|currency)[}]','','g') !~ '[{}]');
alter table public.owner_push_preferences add column financial_summary boolean not null default true;
alter table public.owner_push_preferences alter column title_template set default '{business}';
alter table public.owner_push_preferences alter column body_template set default E'{branch} · {date}\nSales: {sales}\nExpenses: {expenses}\nNet profit: {net_profit}';
-- Upgrade only the stock template, preserving owner-written text and delivery filters.
update public.owner_push_preferences set title_template=case when title_template='BizCTRL · {business}' then '{business}' else title_template end,
body_template=case language when 'ar' then E'{branch} · {date}\nالمبيعات: {sales}\nالمصروفات: {expenses}\nصافي الربح: {net_profit}' when 'fa' then E'{branch} · {date}\nفروشات: {sales}\nمصارف: {expenses}\nفایدهٔ خالص: {net_profit}' else E'{branch} · {date}\nSales: {sales}\nExpenses: {expenses}\nNet profit: {net_profit}' end
where body_template='{action} · {entity} · {reference} · {branch}';
