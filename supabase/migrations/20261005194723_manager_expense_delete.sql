CREATE POLICY manager_expense_delete ON public.expenses FOR DELETE TO authenticated
USING (
 public.erp_can_write_module_scope_text(restaurant_id::text,branch_id::text,'createExpenses')
 AND EXISTS (SELECT 1 FROM public.erp_memberships m
 WHERE m.user_id=(SELECT auth.uid()) AND m.role='manager' AND m.status='approved'
 AND m.restaurant_id=expenses.restaurant_id AND m.branch_id=expenses.branch_id)
);
