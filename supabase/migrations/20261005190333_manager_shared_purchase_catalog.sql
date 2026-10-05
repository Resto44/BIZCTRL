CREATE POLICY manager_shared_category_read ON public.product_categories FOR SELECT TO authenticated
USING (branch_id IS NULL AND EXISTS (
 SELECT 1 FROM public.erp_memberships m
 WHERE m.user_id=(SELECT auth.uid()) AND m.status='approved' AND m.role='manager'
 AND m.restaurant_id=product_categories.restaurant_id
 AND public.erp_can_access_scope_text(m.restaurant_id::text,m.branch_id::text)
));
CREATE POLICY manager_shared_product_read ON public.products FOR SELECT TO authenticated
USING (branch_id IS NULL AND public.erp_has_any_permission(ARRAY['viewProducts','viewInventory'])
 AND EXISTS (
 SELECT 1 FROM public.erp_memberships m
 WHERE m.user_id=(SELECT auth.uid()) AND m.status='approved' AND m.role='manager'
 AND m.restaurant_id=products.restaurant_id
 AND public.erp_can_access_scope_text(m.restaurant_id::text,m.branch_id::text)
));
