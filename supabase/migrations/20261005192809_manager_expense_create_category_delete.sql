DO $fix$
DECLARE definition text; category_table text;
BEGIN
 SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc
 WHERE proname='erp_default_permissions' AND pronamespace='public'::regnamespace;
 IF position('"viewExpenses":true' in definition)=0 THEN RAISE EXCEPTION 'Unexpected permission defaults'; END IF;
 EXECUTE replace(definition,'"viewExpenses":true','"viewExpenses":true,"createExpenses":true');
 FOREACH category_table IN ARRAY ARRAY['product_categories','expense_categories','sales_categories','online_order_categories'] LOOP
 EXECUTE format('CREATE POLICY manager_category_delete ON public.%I FOR DELETE TO authenticated USING (
 public.erp_can_access_scope_text(restaurant_id::text,branch_id::text)
 AND EXISTS (SELECT 1 FROM public.erp_memberships m WHERE m.user_id=(SELECT auth.uid())
 AND m.status=''approved'' AND m.role=''manager'' AND m.restaurant_id=%I.restaurant_id AND m.branch_id=%I.branch_id)
 )',category_table,category_table,category_table);
 END LOOP;
END $fix$;
