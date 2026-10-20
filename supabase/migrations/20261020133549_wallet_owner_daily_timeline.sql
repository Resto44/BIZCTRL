CREATE OR REPLACE FUNCTION public.erp_bank_wallet_owner_timeline(
 p_restaurant uuid,p_currency text,p_filter text DEFAULT 'all',p_offset integer DEFAULT 0,
 p_month text DEFAULT '',p_timezone text DEFAULT 'Asia/Riyadh',p_search text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_history jsonb;v_total bigint;v_from timestamptz;v_to timestamptz;
BEGIN
 IF auth.uid() IS NULL OR p_restaurant IS NULL OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
 OR p_filter IS NULL OR p_filter NOT IN ('all','incoming','outgoing','pending') OR p_offset IS NULL OR p_offset<0
 OR p_month IS NULL OR (p_month<>'' AND p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
 OR p_search IS NULL OR length(p_search)>100
 OR p_timezone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_timezone)
 OR NOT coalesce(public.treasury_account_is_owner(p_restaurant),false)
 OR NOT EXISTS(SELECT 1 FROM public.restaurants WHERE id=p_restaurant AND coalesce(is_active,true))
 THEN RAISE EXCEPTION 'WALLET_OWNER_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_month<>'' THEN
  v_from:=(p_month||'-01')::date::timestamp AT TIME ZONE p_timezone;
  v_to:=((p_month||'-01')::date+interval '1 month')::timestamp AT TIME ZONE p_timezone;
 END IF;
 WITH ledger AS (
  SELECT j.request_id,j.id posting_id,j.posted_at,j.signed_amount,
   sum(j.signed_amount) OVER(PARTITION BY j.wallet_account_id,j.currency ORDER BY j.posted_at,j.id ROWS UNBOUNDED PRECEDING) balance_after
  FROM public.erp_bank_wallet_postings j WHERE j.restaurant_id=p_restaurant AND j.currency=p_currency AND j.side='person'
 ), filtered AS (
  SELECT r.id,r.person_id,p.name person_name,p.is_active,r.kind,r.amount,r.currency,r.status,r.note,r.review_note,
   r.initiated_by_owner,r.created_at,r.reviewed_at,r.treasury_transaction_id,a.account_name,
   j.balance_after-j.signed_amount balance_before,j.balance_after,j.posting_id,
   coalesce(j.posted_at,r.created_at) activity_at,
   to_char(coalesce(j.posted_at,r.created_at) AT TIME ZONE p_timezone,'YYYY-MM-DD') activity_day
  FROM public.erp_bank_wallet_requests r JOIN public.business_partners p ON p.id=r.person_id
  LEFT JOIN public.treasury_accounts a ON a.id=r.owner_treasury_account_id
  LEFT JOIN ledger j ON j.request_id=r.id
  WHERE r.restaurant_id=p_restaurant AND r.currency=p_currency
   AND (p_filter='all' OR (p_filter='pending' AND r.status='pending')
    OR (p_filter='incoming' AND r.status='posted' AND r.kind='return_to_owner')
    OR (p_filter='outgoing' AND r.status='posted' AND r.kind='fund_wallet'))
   AND (v_from IS NULL OR (coalesce(j.posted_at,r.created_at)>=v_from AND coalesce(j.posted_at,r.created_at)<v_to))
   AND (trim(p_search)='' OR strpos(lower(p.name),lower(trim(p_search)))>0)
 ), page AS (
  SELECT * FROM filtered ORDER BY activity_at DESC,posting_id DESC NULLS LAST,id DESC LIMIT 50 OFFSET p_offset
 )
 SELECT (SELECT count(*) FROM filtered),coalesce(jsonb_agg(to_jsonb(page) ORDER BY activity_at DESC,posting_id DESC NULLS LAST,id DESC),'[]')
 INTO v_total,v_history FROM page;
 RETURN jsonb_build_object('transactions',v_history,'total',v_total,'timezone',p_timezone);
END;$$;
REVOKE ALL ON FUNCTION public.erp_bank_wallet_owner_timeline(uuid,text,text,integer,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_bank_wallet_owner_timeline(uuid,text,text,integer,text,text,text) TO authenticated;
