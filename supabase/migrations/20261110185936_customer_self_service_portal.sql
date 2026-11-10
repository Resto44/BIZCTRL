BEGIN;
-- Dedicated identity links: no employee privileges and no matching by name/phone.
CREATE SCHEMA IF NOT EXISTS customer_portal_private;
REVOKE ALL ON SCHEMA customer_portal_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA customer_portal_private TO authenticated;
CREATE TABLE public.customer_portal_access (
 customer_id uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
 user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 invited_email text NOT NULL,
 token_hash text UNIQUE,
 expires_at timestamptz,
 active boolean NOT NULL DEFAULT false,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_portal_access_user_idx ON public.customer_portal_access(user_id) WHERE active;
ALTER TABLE public.customer_portal_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_portal_access FROM PUBLIC, anon, authenticated;

CREATE FUNCTION customer_portal_private.invite(p_customer_id uuid,p_email text,p_revoke boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.customers; v_token text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'CUSTOMER_PORTAL_FORBIDDEN'; END IF;
 SELECT * INTO c FROM public.customers WHERE id=p_customer_id FOR UPDATE;
 IF NOT FOUND OR NOT public.erp_is_approved_owner(c.restaurant_id) THEN RAISE EXCEPTION 'CUSTOMER_PORTAL_FORBIDDEN'; END IF;
 IF p_revoke THEN
  UPDATE public.customer_portal_access SET active=false,token_hash=NULL,expires_at=NULL,updated_at=now() WHERE customer_id=c.id;
  RETURN jsonb_build_object('revoked',true);
 END IF;
 IF c.is_active IS NOT TRUE OR p_email IS NULL OR btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'CUSTOMER_PORTAL_EMAIL_REQUIRED'; END IF;
 v_token := encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.customer_portal_access(customer_id,invited_email,token_hash,expires_at,created_by)
 VALUES(c.id,lower(btrim(p_email)),encode(extensions.digest(v_token,'sha256'),'hex'),now()+interval '7 days',auth.uid())
 ON CONFLICT(customer_id) DO UPDATE SET invited_email=EXCLUDED.invited_email,token_hash=EXCLUDED.token_hash,
 expires_at=EXCLUDED.expires_at,created_by=EXCLUDED.created_by,user_id=NULL,active=false,updated_at=now();
 RETURN jsonb_build_object('token',v_token);
END $$;

CREATE FUNCTION customer_portal_private.accept(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.customer_portal_access; v_email text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'CUSTOMER_PORTAL_FORBIDDEN'; END IF;
 SELECT lower(email) INTO v_email FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
 IF v_email IS NULL THEN RAISE EXCEPTION 'CUSTOMER_PORTAL_VERIFIED_EMAIL_REQUIRED'; END IF;
 SELECT * INTO a FROM public.customer_portal_access WHERE token_hash=encode(extensions.digest(p_token,'sha256'),'hex') FOR UPDATE;
 IF NOT FOUND OR a.expires_at<=now() OR a.invited_email IS DISTINCT FROM v_email OR NOT EXISTS(
  SELECT 1 FROM public.customers c WHERE c.id=a.customer_id AND c.is_active
 ) THEN RAISE EXCEPTION 'CUSTOMER_PORTAL_INVITATION_INVALID'; END IF;
 UPDATE public.customer_portal_access SET user_id=auth.uid(),active=true,token_hash=NULL,expires_at=NULL,updated_at=now() WHERE customer_id=a.customer_id;
 RETURN jsonb_build_object('customer_id',a.customer_id);
END $$;

CREATE FUNCTION customer_portal_private.accounts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'CUSTOMER_PORTAL_FORBIDDEN'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'business',r.name,'currency',r.currency,'branch',c.branch) ORDER BY r.name,c.name)
 FROM public.customer_portal_access a JOIN public.customers c ON c.id=a.customer_id JOIN public.restaurants r ON r.id=c.restaurant_id
 WHERE a.user_id=auth.uid() AND a.active AND c.is_active),'[]'::jsonb);
END $$;

CREATE FUNCTION customer_portal_private.statement(p_customer_id uuid,p_kind text,p_from date,p_to date,p_page integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.customers; v_totals jsonb; v_rows jsonb; v_count bigint;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'CUSTOMER_PORTAL_FORBIDDEN'; END IF;
 SELECT customer.* INTO c FROM public.customers customer JOIN public.customer_portal_access a ON a.customer_id=customer.id
 WHERE customer.id=p_customer_id AND a.user_id=auth.uid() AND a.active AND customer.is_active;
 IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_PORTAL_FORBIDDEN'; END IF;
 IF p_kind NOT IN ('invoices','payments','orders') OR p_kind IS NULL OR p_page IS NULL OR p_page<0 OR p_page>100000 OR p_from>p_to THEN RAISE EXCEPTION 'CUSTOMER_PORTAL_FILTER_INVALID'; END IF;
 SELECT jsonb_build_object('total',coalesce(sum(greatest(total_amount,0)),0),'paid',coalesce(sum(greatest(paid_amount,0)),0),
  'balance',coalesce(sum(greatest(remaining_amount,0)),0),'overdue',coalesce(sum(greatest(remaining_amount,0)) FILTER(WHERE due_date<CURRENT_DATE),0))
 INTO v_totals FROM public.debt_records d WHERE d.customer_id=c.id AND d.restaurant_id=c.restaurant_id
 AND (c.branch_id IS NULL OR d.branch_id=c.branch_id) AND d.party_type='customer' AND d.type='receivable' AND d.status IS DISTINCT FROM 'written_off';
 IF p_kind='invoices' THEN
  WITH records AS (
   SELECT d.id,d.invoice_number AS reference,d.date,d.due_date,d.total_amount AS amount,d.paid_amount,d.remaining_amount,d.status
   FROM public.debt_records d WHERE d.customer_id=c.id AND d.restaurant_id=c.restaurant_id AND (c.branch_id IS NULL OR d.branch_id=c.branch_id)
   AND d.party_type='customer' AND d.type='receivable' AND (p_from IS NULL OR d.date>=p_from) AND (p_to IS NULL OR d.date<=p_to)
  ) SELECT (SELECT count(*) FROM records),(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT * FROM records ORDER BY date DESC NULLS LAST,id LIMIT 25 OFFSET p_page*25)x) INTO v_count,v_rows;
 ELSIF p_kind='payments' THEN
  WITH records AS (
   SELECT p.id,p.receipt_number AS reference,p.date,p.amount,p.payment_method,d.invoice_number
   FROM public.debt_payments p JOIN public.debt_records d ON d.id=p.debt_id
   WHERE d.customer_id=c.id AND d.restaurant_id=c.restaurant_id AND p.restaurant_id=c.restaurant_id
   AND (p.customer_id IS NULL OR p.customer_id=c.id) AND (c.branch_id IS NULL OR (d.branch_id=c.branch_id AND p.branch_id=c.branch_id))
   AND d.party_type='customer' AND d.type='receivable' AND (p_from IS NULL OR p.date>=p_from) AND (p_to IS NULL OR p.date<=p_to)
  ) SELECT (SELECT count(*) FROM records),(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT * FROM records ORDER BY date DESC NULLS LAST,id LIMIT 25 OFFSET p_page*25)x) INTO v_count,v_rows;
 ELSE
  WITH records AS (
   SELECT o.id,o.order_number AS reference,o.created_date AS date,o.total_amount AS amount,o.status,o.payment_status,o.subtotal,o.tax_amount,o.discount,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.product_id,'name',pr.name,'name_ar',pr.name_ar,'name_fa',pr.name_fa,'quantity',i.quantity,'unit_price',i.unit_price,'total_price',i.total_price)),'[]'::jsonb)
     FROM public.order_items i LEFT JOIN public.products pr ON pr.id=i.product_id AND pr.restaurant_id=c.restaurant_id WHERE i.order_id=o.id AND i.restaurant_id=c.restaurant_id) AS items
   FROM public.orders o WHERE o.customer_id=c.id AND o.restaurant_id=c.restaurant_id AND (c.branch_id IS NULL OR o.branch_id=c.branch_id)
   AND (p_from IS NULL OR o.created_date>=p_from::timestamptz) AND (p_to IS NULL OR o.created_date<(p_to+1)::timestamptz)
  ) SELECT (SELECT count(*) FROM records),(SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT * FROM records ORDER BY date DESC NULLS LAST,id LIMIT 25 OFFSET p_page*25)x) INTO v_count,v_rows;
 END IF;
 RETURN jsonb_build_object('totals',v_totals,'rows',v_rows,'count',v_count,'page',p_page,'page_size',25,'as_of',now());
END $$;

-- Public invoker wrappers expose only the bounded API, not the private schema.
CREATE FUNCTION public.erp_customer_portal_invite(p_customer_id uuid,p_email text,p_revoke boolean DEFAULT false) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT customer_portal_private.invite(p_customer_id,p_email,p_revoke) $$;
CREATE FUNCTION public.erp_customer_portal_accept(p_token text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT customer_portal_private.accept(p_token) $$;
CREATE FUNCTION public.erp_customer_portal_accounts() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT customer_portal_private.accounts() $$;
CREATE FUNCTION public.erp_customer_portal_statement(p_customer_id uuid,p_kind text DEFAULT 'invoices',p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_page integer DEFAULT 0) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT customer_portal_private.statement(p_customer_id,p_kind,p_from,p_to,p_page) $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA customer_portal_private FROM PUBLIC,anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA customer_portal_private TO authenticated;
REVOKE ALL ON FUNCTION public.erp_customer_portal_invite(uuid,text,boolean),public.erp_customer_portal_accept(text),public.erp_customer_portal_accounts(),public.erp_customer_portal_statement(uuid,text,date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_customer_portal_invite(uuid,text,boolean),public.erp_customer_portal_accept(text),public.erp_customer_portal_accounts(),public.erp_customer_portal_statement(uuid,text,date,date,integer) TO authenticated;
COMMIT;
