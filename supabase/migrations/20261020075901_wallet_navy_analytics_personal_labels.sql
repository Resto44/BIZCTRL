-- Additive wallet analytics and private labels. Never changes financial entries.
CREATE TABLE public.erp_wallet_personal_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 person_id uuid NOT NULL REFERENCES public.business_partners(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 60),
 UNIQUE(person_id,user_id,name), UNIQUE(id,person_id,user_id)
);
CREATE TABLE public.erp_wallet_personal_tags (
 request_id uuid PRIMARY KEY REFERENCES public.erp_bank_wallet_requests(id) ON DELETE RESTRICT,
 person_id uuid NOT NULL REFERENCES public.business_partners(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 category_id uuid NOT NULL,
 FOREIGN KEY(category_id,person_id,user_id) REFERENCES public.erp_wallet_personal_categories(id,person_id,user_id) ON DELETE RESTRICT
);
ALTER TABLE public.erp_wallet_personal_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_wallet_personal_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_wallet_personal_categories,public.erp_wallet_personal_tags FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.erp_wallet_personal_labels(p_person uuid,p_action text DEFAULT 'list',p_category uuid DEFAULT NULL,p_name text DEFAULT NULL,p_request uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_categories jsonb;v_tags jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.business_partners p JOIN public.restaurants r ON r.id=p.restaurant_id
  WHERE p.id=p_person AND p.user_id=auth.uid() AND p.is_active AND coalesce(r.is_active,true)
 ) THEN RAISE EXCEPTION 'WALLET_PERSONAL_ACCESS_DENIED' USING ERRCODE='42501';END IF;
 IF p_action='save' THEN
  IF p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'WALLET_CATEGORY_NAME_INVALID' USING ERRCODE='22023';END IF;
  IF p_category IS NULL THEN
   INSERT INTO public.erp_wallet_personal_categories(person_id,user_id,name) VALUES(p_person,auth.uid(),trim(p_name)) ON CONFLICT(person_id,user_id,name) DO NOTHING;
  ELSE
   UPDATE public.erp_wallet_personal_categories SET name=trim(p_name) WHERE id=p_category AND person_id=p_person AND user_id=auth.uid();
   IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_CATEGORY_NOT_FOUND' USING ERRCODE='42501';END IF;
  END IF;
 ELSIF p_action='tag' THEN
  IF NOT EXISTS(SELECT 1 FROM public.erp_bank_wallet_requests WHERE id=p_request AND person_id=p_person AND created_by=auth.uid()) THEN RAISE EXCEPTION 'WALLET_REQUEST_ACCESS_DENIED' USING ERRCODE='42501';END IF;
  IF p_category IS NULL THEN
   DELETE FROM public.erp_wallet_personal_tags WHERE request_id=p_request AND person_id=p_person AND user_id=auth.uid();
  ELSE
   IF NOT EXISTS(SELECT 1 FROM public.erp_wallet_personal_categories WHERE id=p_category AND person_id=p_person AND user_id=auth.uid()) THEN RAISE EXCEPTION 'WALLET_CATEGORY_NOT_FOUND' USING ERRCODE='42501';END IF;
   INSERT INTO public.erp_wallet_personal_tags(request_id,person_id,user_id,category_id) VALUES(p_request,p_person,auth.uid(),p_category)
   ON CONFLICT(request_id) DO UPDATE SET category_id=excluded.category_id WHERE erp_wallet_personal_tags.person_id=p_person AND erp_wallet_personal_tags.user_id=auth.uid();
  END IF;
 ELSIF p_action IS DISTINCT FROM 'list' THEN RAISE EXCEPTION 'WALLET_ACTION_INVALID' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name),'[]') INTO v_categories FROM public.erp_wallet_personal_categories WHERE person_id=p_person AND user_id=auth.uid();
 SELECT coalesce(jsonb_object_agg(t.request_id,t.category_id),'{}') INTO v_tags FROM public.erp_wallet_personal_tags t JOIN (SELECT id FROM public.erp_bank_wallet_requests WHERE person_id=p_person ORDER BY created_at DESC,id DESC LIMIT 100) r ON r.id=t.request_id WHERE t.person_id=p_person AND t.user_id=auth.uid();
 RETURN jsonb_build_object('categories',v_categories,'tags',v_tags);
END;$$;
REVOKE ALL ON FUNCTION public.erp_wallet_personal_labels(uuid,text,uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_wallet_personal_labels(uuid,text,uuid,text,uuid) TO authenticated;

CREATE FUNCTION public.erp_bank_wallet_trend(p_person uuid,p_currency text,p_from date,p_to date,p_timezone text DEFAULT 'Asia/Riyadh')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_open numeric;v_rows jsonb;v_start timestamptz;v_end timestamptz;
BEGIN
 -- Reuse the existing owner/self authorization, including active membership/business.
 PERFORM public.erp_bank_wallet_dashboard(p_person,1);
 IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' OR p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>365 OR p_timezone IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone)
 THEN RAISE EXCEPTION 'WALLET_TREND_RANGE_INVALID' USING ERRCODE='22023';END IF;
 v_start:=p_from::timestamp AT TIME ZONE p_timezone;
 v_end:=(p_to+1)::timestamp AT TIME ZONE p_timezone;
 SELECT coalesce(sum(j.signed_amount),0) INTO v_open FROM public.erp_bank_wallet_postings j JOIN public.erp_bank_wallet_accounts a ON a.id=j.wallet_account_id WHERE a.person_id=p_person AND a.currency=p_currency AND j.currency=p_currency AND j.side='person' AND j.posted_at<v_start;
 WITH days AS (SELECT p_from+n AS day FROM generate_series(0,p_to-p_from) n),
 movements AS (
  SELECT (j.posted_at AT TIME ZONE p_timezone)::date AS day,
   sum(greatest(j.signed_amount,0)) AS incoming,
   sum(greatest(-j.signed_amount,0)) AS outgoing,count(*) AS count
  FROM public.erp_bank_wallet_postings j JOIN public.erp_bank_wallet_accounts a ON a.id=j.wallet_account_id
  WHERE a.person_id=p_person AND a.currency=p_currency AND j.currency=p_currency AND j.side='person' AND j.posted_at>=v_start AND j.posted_at<v_end GROUP BY 1
 ), rows AS (
  SELECT d.day,coalesce(m.incoming,0) AS incoming,coalesce(m.outgoing,0) AS outgoing,coalesce(m.count,0) AS count,
   v_open+sum(coalesce(m.incoming,0)-coalesce(m.outgoing,0)) OVER(ORDER BY d.day) AS balance
  FROM days d LEFT JOIN movements m USING(day)
 ) SELECT coalesce(jsonb_agg(to_jsonb(rows) ORDER BY day),'[]') INTO v_rows FROM rows;
 RETURN jsonb_build_object('opening_balance',v_open,'days',v_rows,'currency',p_currency,'timezone',p_timezone);
END;$$;
REVOKE ALL ON FUNCTION public.erp_bank_wallet_trend(uuid,text,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_bank_wallet_trend(uuid,text,date,date,text) TO authenticated;
