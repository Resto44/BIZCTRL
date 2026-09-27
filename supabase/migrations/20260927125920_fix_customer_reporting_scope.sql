-- Preserve existing columns and invoker/RLS security; expose the tenant filter used by Customer Management.

CREATE OR REPLACE VIEW public.v_collection_dashboard WITH (security_invoker = true) AS
 SELECT created_by, branch,
   COALESCE(sum(CASE WHEN (date = CURRENT_DATE) THEN amount ELSE 0 END), 0) AS collected_today,
   COALESCE(sum(CASE WHEN (date >= date_trunc('week', CURRENT_DATE::timestamptz)) THEN amount ELSE 0 END), 0) AS collected_this_week,
   COALESCE(sum(CASE WHEN (date >= date_trunc('month', CURRENT_DATE::timestamptz)) THEN amount ELSE 0 END), 0) AS collected_this_month,
   COALESCE(sum(amount), 0) AS collected_all_time,
   count(DISTINCT customer_name) AS unique_customers_collected,
   count(CASE WHEN (date = CURRENT_DATE) THEN 1 ELSE NULL END) AS collections_today_count, restaurant_id
 FROM public.customer_collections cc GROUP BY created_by, branch, restaurant_id;

CREATE OR REPLACE VIEW public.v_customer_aging WITH (security_invoker = true) AS
 SELECT party_name AS customer_name, party_phone AS phone, branch, created_by,
   COALESCE(sum(CASE WHEN ((CURRENT_DATE - COALESCE(due_date, date)) <= 30) THEN remaining_amount ELSE 0 END), 0) AS bucket_0_30,
   COALESCE(sum(CASE WHEN (((CURRENT_DATE - COALESCE(due_date, date)) >= 31) AND ((CURRENT_DATE - COALESCE(due_date, date)) <= 60)) THEN remaining_amount ELSE 0 END), 0) AS bucket_31_60,
   COALESCE(sum(CASE WHEN (((CURRENT_DATE - COALESCE(due_date, date)) >= 61) AND ((CURRENT_DATE - COALESCE(due_date, date)) <= 90)) THEN remaining_amount ELSE 0 END), 0) AS bucket_61_90,
   COALESCE(sum(CASE WHEN ((CURRENT_DATE - COALESCE(due_date, date)) > 90) THEN remaining_amount ELSE 0 END), 0) AS bucket_over_90,
   COALESCE(sum(remaining_amount), 0) AS total_outstanding,
   max((CURRENT_DATE - COALESCE(due_date, date))) AS max_days_overdue, restaurant_id
 FROM public.debt_records dr
 WHERE ((party_type = 'customer') AND (status = ANY (ARRAY['open','partial','overdue'])) AND (remaining_amount > 0))
 GROUP BY party_name, party_phone, branch, created_by, restaurant_id;

CREATE OR REPLACE VIEW public.v_customer_summary WITH (security_invoker = true) AS
 SELECT party_name AS customer_name, party_phone AS phone, branch, created_by,
   count(DISTINCT id) AS credit_sale_count,
   COALESCE(sum(total_amount), 0) AS total_credit_sales,
   COALESCE(sum(paid_amount), 0) AS total_collected,
   COALESCE(sum(remaining_amount), 0) AS outstanding_balance,
   max(date) AS last_transaction_date,
   count(CASE WHEN (status = 'overdue') THEN 1 ELSE NULL END) AS overdue_count,
   count(CASE WHEN (status = ANY (ARRAY['open','partial','overdue'])) THEN 1 ELSE NULL END) AS open_count, restaurant_id
 FROM public.debt_records dr WHERE (party_type = 'customer')
 GROUP BY party_name, party_phone, branch, created_by, restaurant_id;
