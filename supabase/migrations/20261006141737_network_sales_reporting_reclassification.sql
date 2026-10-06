-- Preserve posted closings; record reviewed channel reclassifications separately.
create table public.network_sales_reclassifications (
 sale_id uuid primary key references public.daily_sales(id) on delete cascade,
 amount numeric(18,2) not null check(amount>0),
 original_network numeric not null,
 original_other_total numeric not null,
 original_snapshot jsonb not null,
 reason text not null check(length(btrim(reason))>0),
 created_at timestamptz not null default now(),
 check(amount<=original_other_total)
);
alter table public.network_sales_reclassifications enable row level security;
revoke all on public.network_sales_reclassifications from public,anon,authenticated;
grant select on public.network_sales_reclassifications to authenticated;
grant all on public.network_sales_reclassifications to service_role;
create policy network_reclassification_read on public.network_sales_reclassifications
 for select to authenticated using (exists(select 1 from public.daily_sales s where s.id=sale_id));
create view public.daily_sales_network_report with(security_invoker=true) as
 select s.*, coalesce(s.restaurant_network,s.network,0)+coalesce(r.amount,0) as reported_network_sales
 from public.daily_sales s left join public.network_sales_reclassifications r on r.sale_id=s.id
 and r.original_snapshot=s.sales_sources_json
 and r.original_network=coalesce(s.restaurant_network,s.network,0)
 and r.original_other_total=coalesce(s.custom_sources_total,0);
revoke all on public.daily_sales_network_report from public,anon,authenticated;
grant select on public.daily_sales_network_report to authenticated,service_role;
-- Legacy invalid rows remain editable only after the code is corrected.
alter table public.payment_methods add constraint payment_method_code_contains_letter check(code ~ '[a-z]') not valid;

-- Private financial aggregation exposed only to the authenticated push worker.
create or replace function public.owner_push_financial_summary(p_restaurant_id uuid, p_branch_id uuid, p_date date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_key text; v_currency text; v_type text; v_sales numeric; v_purchases numeric; v_expenses numeric; v_network numeric; v_pos numeric; v_sources numeric;
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
 return jsonb_build_object('date',p_date,'currency',coalesce(nullif(v_currency,''),'SAR'),'sales',v_sales,'purchases',v_purchases,'expenses',v_expenses,'net_profit',v_sales-v_purchases-v_expenses,'network_sales',v_network,'pos_sales',v_pos,'source_sales',v_sources);
end $$;
revoke all on function public.owner_push_financial_summary(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.owner_push_financial_summary(uuid,uuid,date) to service_role;


notify pgrst, 'reload schema';
