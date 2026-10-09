-- Separate branch-scoped credit sales from open customer debt.
-- Credit sales are a daily flow; customer debt is an outstanding balance now.
-- This function cannot edit accounting records and is private to the push worker.
create or replace function public.owner_push_credit_metrics(
 p_restaurant_id uuid, p_branch_id uuid, p_date date
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
 v_branch_key text;
 v_business_type text;
 v_credit numeric := 0;
 v_receivables numeric := 0;
begin
 if p_restaurant_id is null or p_branch_id is null or p_date is null then
  raise exception 'Tenant, branch and date are required';
 end if;
 select b.branch_key into v_branch_key
 from public.branches b
 where b.id=p_branch_id and b.restaurant_id=p_restaurant_id;
 if not found then raise exception 'Unknown branch for tenant'; end if;
 select r.business_type into v_business_type
 from public.restaurants r where r.id=p_restaurant_id;
 if not found then raise exception 'Unknown tenant'; end if;

 if lower(coalesce(v_business_type,'')) in ('supermarket','retail') then
  select coalesce(sum(case when t.transaction_type in ('refund','void') then -p.amount else p.amount end),0)
  into v_credit
  from public.retail_pos_transaction_payments p
  join public.retail_pos_transactions t on t.id=p.transaction_id
  where t.restaurant_id=p_restaurant_id and t.branch_id=p_branch_id
    and t.business_date=p_date and t.status in ('posted','approved')
    and lower(coalesce(p.payment_method,'')) in ('credit','customer_credit','on_account');
 else
  select coalesce(sum(coalesce(s.credit,0)),0) into v_credit
  from public.daily_sales s
  where s.restaurant_id=p_restaurant_id::text and s.date=p_date
    and s.closing_state in ('finalized','locked')
    and (s.branch_id=p_branch_id or (s.branch_id is null and s.branch=v_branch_key));
 end if;

 select coalesce(sum(greatest(coalesce(d.remaining_amount,d.total_amount-coalesce(d.paid_amount,0),0),0)),0)
 into v_receivables
 from public.debt_records d
 where d.restaurant_id=p_restaurant_id and d.type='receivable'
   and d.party_type='customer'
   and (d.branch_id=p_branch_id or (d.branch_id is null and d.branch=v_branch_key))
   and lower(coalesce(d.status,'')) not in ('cancelled','canceled','deleted','void','voided','rejected');
 return jsonb_build_object('credit_sales',v_credit,'receivables',v_receivables);
end $$;
revoke all on function public.owner_push_credit_metrics(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.owner_push_credit_metrics(uuid,uuid,date) to service_role;

-- Make the new fields editable in owner notification templates. Keep existing
-- preferences unchanged and reject unknown template expressions.
alter table public.owner_push_preferences drop constraint if exists owner_push_preferences_title_template_check;
alter table public.owner_push_preferences add constraint owner_push_preferences_title_template_check
 check (length(btrim(title_template)) between 1 and 100 and
 regexp_replace(title_template,'[{](business|branch|action|entity|reference|time|sales|expenses|purchases|net_profit|date|currency|network_sales|pos_sales|source_sales|delivery_sales|delivery_cash|delivery_network|credit_sales|receivables)[}]','','g') !~ '[{}]');
alter table public.owner_push_preferences drop constraint if exists owner_push_preferences_body_template_check;
alter table public.owner_push_preferences add constraint owner_push_preferences_body_template_check
 check (length(btrim(body_template)) between 1 and 500 and
 regexp_replace(body_template,'[{](business|branch|action|entity|reference|time|sales|expenses|purchases|net_profit|date|currency|network_sales|pos_sales|source_sales|delivery_sales|delivery_cash|delivery_network|credit_sales|receivables)[}]','','g') !~ '[{}]');
