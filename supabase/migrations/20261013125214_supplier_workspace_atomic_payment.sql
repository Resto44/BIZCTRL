-- Atomic, retry-safe posting under the caller's existing RLS rights.
CREATE OR REPLACE FUNCTION public.post_supplier_invoice_payment(
 p_request_id uuid,p_invoice_id uuid,p_amount numeric,p_date date,
 p_method text DEFAULT 'cash',p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 i public.supplier_invoices%ROWTYPE;
 p public.supplier_payments%ROWTYPE;
 v_paid numeric; v_status text; v_count integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.erp_has_permission('createPurchases') THEN
  RAISE EXCEPTION 'Purchase payment permission required' USING ERRCODE='42501';
 END IF;
 IF p_request_id IS NULL OR p_date IS NULL OR p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount<=0 OR round(p_amount,2)<>p_amount OR p_method IS NULL OR p_method NOT IN ('cash','network','bank_transfer') THEN
  RAISE EXCEPTION 'Invalid payment amount, date, method or request ID';
 END IF;
 SELECT * INTO i FROM public.supplier_invoices WHERE id=p_invoice_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.supplier_payments WHERE id=p_request_id;
 IF FOUND THEN
  IF p.invoice_id IS DISTINCT FROM p_invoice_id OR p.amount IS DISTINCT FROM p_amount OR p.date IS DISTINCT FROM p_date OR p.payment_method IS DISTINCT FROM p_method OR p.notes IS DISTINCT FROM p_notes THEN
   RAISE EXCEPTION 'Request ID already used for a different payment';
  END IF;
  RETURN jsonb_build_object('payment',to_jsonb(p),'newStatus',i.status,'remaining',greatest(i.total_amount-coalesce(i.paid_amount,0),0));
 END IF;
 IF i.supplier_id IS NULL OR i.branch_id IS NULL OR i.restaurant_id IS NULL OR i.status IN ('draft','cancelled','canceled','void','rejected') OR coalesce(i.approval_status,'') IN ('pending','rejected','draft') THEN
  RAISE EXCEPTION 'Invoice must be posted, approved and linked to a supplier and branch';
 END IF;
 SELECT coalesce(sum(amount),0) INTO v_paid FROM public.supplier_payments WHERE invoice_id=i.id;
 IF abs(v_paid-coalesce(i.paid_amount,0))>0.005 THEN RAISE EXCEPTION 'Invoice payment records need reconciliation before another payment'; END IF;
 IF p_amount>i.total_amount-v_paid THEN RAISE EXCEPTION 'Payment exceeds outstanding balance'; END IF;
 INSERT INTO public.supplier_payments(id,invoice_id,supplier_id,supplier_name,branch,branch_id,restaurant_id,tenant_id,amount,date,payment_method,notes,created_by)
 VALUES(p_request_id,i.id,i.supplier_id,i.supplier_name,i.branch,i.branch_id,i.restaurant_id,i.tenant_id,p_amount,p_date,p_method,p_notes,auth.jwt()->>'email') RETURNING * INTO p;
 v_paid:=v_paid+p_amount;
 v_status:=CASE WHEN v_paid>=i.total_amount THEN 'paid' ELSE 'partial' END;
 UPDATE public.supplier_invoices SET paid_amount=v_paid,status=v_status WHERE id=i.id;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count<>1 THEN RAISE EXCEPTION 'Invoice update denied' USING ERRCODE='42501'; END IF;
 IF i.debt_record_id IS NOT NULL THEN
  UPDATE public.debt_records SET paid_amount=v_paid,remaining_amount=greatest(i.total_amount-v_paid,0),status=v_status WHERE id=i.debt_record_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'Linked debt update denied' USING ERRCODE='42501'; END IF;
 END IF;
 -- Existing supplier_payments trigger posts the canonical cash movement in
 -- this same transaction. Do not fabricate another wallet debit here.
 RETURN jsonb_build_object('payment',to_jsonb(p),'newStatus',v_status,'remaining',greatest(i.total_amount-v_paid,0));
END $$;
REVOKE ALL ON FUNCTION public.post_supplier_invoice_payment(uuid,uuid,numeric,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_supplier_invoice_payment(uuid,uuid,numeric,date,text,text) TO authenticated;
