create policy retail_inventory_master_product_read on public.products for select to authenticated using (branch_id is null and retail_inventory_private.allowed(restaurant_id,null));
notify pgrst,'reload schema';
