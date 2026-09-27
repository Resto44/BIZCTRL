-- Customer receivables exclude money the business owes to customers. Keep identity when names coincide.
CREATE OR REPLACE VIEW public.v_customer_aging WITH (security_invoker = true) AS
 SELECT party_name AS customer_name, party_phone AS phone, branch, created_by,
   COALESCE(sum(CASE WHEN ((CURRENT_DATE - COALESCE(due_date, date)) <= 30) THEN remaining_amount ELSE 0 END), 0) AS bucket_0_30,
   COALESCE(sum(CASE WHEN (((CURRENT_DATE - COALESCE(due_date, date)) >= 31) AND ((CURRENT_DATE - COALESCE(due_date, date)) <= 60)) THEN remaining_amount ELSE 0 END), 0) AS bucket_31_60,
   COALESCE(sum(CASE WHEN (((CURRENT_DATE - COALESCE(due_date, date)) >= 61) AND ((CURRENT_DATE - COALESCE(due_date, date)) <= 90)) THEN remaining_amount ELSE 0 END), 0) AS bucket_61_90,
   COALESCE(sum(CASE WHEN ((CURRENT_DATE - COALESCE(due_date, date)) > 90) THEN remaining_amount ELSE 0 END), 0) AS bucket_over_90,
   COALESCE(sum(remaining_amount), 0) AS total_outstanding,
   max((CURRENT_DATE - COALESCE(due_date, date))) AS max_days_overdue, restaurant_id, customer_id
 FROM public.debt_records dr
 WHERE ((party_type = 'customer' AND type = 'receivable') AND (status = ANY (ARRAY['open','partial','overdue'])) AND (remaining_amount > 0))
 GROUP BY party_name, party_phone, branch, created_by, restaurant_id, customer_id;

CREATE OR REPLACE VIEW public.v_customer_summary WITH (security_invoker = true) AS
 SELECT party_name AS customer_name, party_phone AS phone, branch, created_by,
   count(DISTINCT id) AS credit_sale_count,
   COALESCE(sum(total_amount), 0) AS total_credit_sales,
   COALESCE(sum(paid_amount), 0) AS total_collected,
   COALESCE(sum(remaining_amount), 0) AS outstanding_balance,
   max(date) AS last_transaction_date,
   count(CASE WHEN (status = 'overdue') THEN 1 ELSE NULL END) AS overdue_count,
   count(CASE WHEN (status = ANY (ARRAY['open','partial','overdue'])) THEN 1 ELSE NULL END) AS open_count, restaurant_id, customer_id
 FROM public.debt_records dr WHERE (party_type = 'customer' AND type = 'receivable')
 GROUP BY party_name, party_phone, branch, created_by, restaurant_id, customer_id;
