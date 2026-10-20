CREATE OR REPLACE FUNCTION public.erp_bank_wallet_dashboard(
 p_person uuid, p_limit integer DEFAULT 30
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
 p public.business_partners;
 v_business text;
 v_owner boolean;
 v_wallet jsonb;
 v_history jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_person IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'WALLET_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.business_partners WHERE id=p_person;
 IF NOT FOUND OR NOT p.is_active OR NOT EXISTS(
  SELECT 1 FROM public.restaurants WHERE id=p.restaurant_id AND coalesce(is_active,true)
 ) THEN RAISE EXCEPTION 'WALLET_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 v_owner:=coalesce(public.treasury_account_is_owner(p.restaurant_id),false);
 IF NOT v_owner AND p.user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'WALLET_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 SELECT name INTO v_business FROM public.restaurants WHERE id=p.restaurant_id;
 SELECT coalesce(jsonb_agg(x ORDER BY x.currency),'[]'::jsonb) INTO v_wallet
 FROM (
  -- Include currencies of pending requests before the first approved posting.
  -- Account balances MUST still come solely from posted person-side entries.
  SELECT c.currency,a.id,coalesce(a.status,'active') status,
   coalesce(j.balance,0) balance,coalesce(pr.pending_amount,0) pending_amount,
   coalesce(j.transfers_in,0) transfers_in,coalesce(j.transfers_out,0) transfers_out
  FROM (
   SELECT currency FROM public.erp_bank_wallet_accounts
    WHERE restaurant_id=p.restaurant_id AND person_id=p.id
   UNION
   SELECT currency FROM public.erp_bank_wallet_requests
    WHERE restaurant_id=p.restaurant_id AND person_id=p.id
  )c
  LEFT JOIN public.erp_bank_wallet_accounts a ON
   a.restaurant_id=p.restaurant_id AND a.person_id=p.id AND a.currency=c.currency
  LEFT JOIN LATERAL (
   SELECT coalesce(sum(signed_amount) FILTER(WHERE side='person'),0) balance,
    coalesce(sum(signed_amount) FILTER(WHERE side='person' AND signed_amount>0),0) transfers_in,
    -coalesce(sum(signed_amount) FILTER(WHERE side='person' AND signed_amount<0),0) transfers_out
   FROM public.erp_bank_wallet_postings WHERE wallet_account_id=a.id
  )j ON true
  LEFT JOIN LATERAL (
   SELECT coalesce(sum(amount),0) pending_amount
   FROM public.erp_bank_wallet_requests
   WHERE restaurant_id=p.restaurant_id AND person_id=p.id
    AND currency=c.currency AND status='pending'
  )pr ON true
 )x;
 -- Compute the full ledger first. Pagination must never reset the running balance.
 WITH ledger AS (
  SELECT j.request_id,j.id posting_id,j.posted_at,j.signed_amount,
   sum(j.signed_amount) OVER (
    PARTITION BY j.wallet_account_id,j.currency ORDER BY j.posted_at,j.id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
   ) balance_after
  FROM public.erp_bank_wallet_postings j
  JOIN public.erp_bank_wallet_accounts a ON a.id=j.wallet_account_id
  WHERE a.person_id=p.id AND a.restaurant_id=p.restaurant_id AND j.side='person'
 )
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.activity_at DESC,x.posting_id DESC NULLS LAST,x.id DESC),'[]'::jsonb)
 INTO v_history FROM (
  SELECT r.id,r.kind,r.amount,r.currency,r.status,r.note,r.created_at,
   r.reviewed_at,r.review_note,r.treasury_transaction_id,
   (CASE WHEN r.kind='fund_wallet' THEN v_business ELSE p.name END) payer,
   (CASE WHEN r.kind='fund_wallet' THEN p.name ELSE v_business END) payee,
   CASE WHEN r.status='posted' THEN j.signed_amount ELSE 0 END wallet_delta,
   j.posted_at,j.posting_id,coalesce(j.posted_at,r.created_at) activity_at,
   j.balance_after-j.signed_amount balance_before,j.balance_after
  FROM public.erp_bank_wallet_requests r
  LEFT JOIN ledger j ON j.request_id=r.id AND r.status='posted'
  WHERE r.restaurant_id=p.restaurant_id AND r.person_id=p.id
  ORDER BY coalesce(j.posted_at,r.created_at) DESC,j.posting_id DESC NULLS LAST,r.id DESC LIMIT p_limit
 )x;
 RETURN jsonb_build_object('person_id',p.id,
  'account_reference','WLT-'||upper(replace(p.id::text,'-','')),
  'person_name',p.name,'business_name',v_business,
  'restaurant_id',p.restaurant_id,'is_owner',v_owner,
  'currencies',coalesce(v_wallet,'[]'::jsonb),
  'transactions',coalesce(v_history,'[]'::jsonb),
  'legacy_migration','historical_loans_and_custody_archived_not_spendable',
  'generated_at',clock_timestamp());
END;$$;

REVOKE ALL ON FUNCTION public.erp_bank_wallet_dashboard(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_bank_wallet_dashboard(uuid,integer) TO authenticated;
