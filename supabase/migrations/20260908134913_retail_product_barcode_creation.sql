-- Internal CODE128 identifiers, not registered GS1 identifiers.
create sequence public.retail_product_barcode_seq as bigint
  minvalue 1 maxvalue 999999999999 no cycle;
revoke all on sequence public.retail_product_barcode_seq from public, anon;
grant usage on sequence public.retail_product_barcode_seq to authenticated;

-- Preserve manufacturer codes and existing behavior in other business portals.
create unique index products_internal_barcode_unique
  on public.products (restaurant_id, barcode)
  where barcode like 'BC-%';

create function public.erp_create_product_barcode(
  p_restaurant_id uuid, p_product_id uuid default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_barcode text;
  v_attempt integer;
begin
  if auth.uid() is null or not coalesce(public.erp_can_write_module_scope_text(
    p_restaurant_id::text, null, 'updateInventory'), false) then
    raise exception 'You do not have permission to create product barcodes.' using errcode = '42501';
  end if;
  if not public.erp_is_supermarket_product_portal(p_restaurant_id) then
    raise exception 'Barcode creation is available in the supermarket portal.' using errcode = '42501';
  end if;

  if p_product_id is not null then
    select barcode into v_barcode from public.products
      where id = p_product_id and restaurant_id = p_restaurant_id and branch_id is null
      for update;
    if not found then
      raise exception 'Master product not found or not accessible.' using errcode = '42501';
    end if;
    if nullif(btrim(v_barcode), '') is not null then
      return jsonb_build_object('product_id', p_product_id, 'barcode', v_barcode,
        'saved', true, 'generated', false);
    end if;
  end if;

  for v_attempt in 1..100 loop
    v_barcode := 'BC-' || lpad(nextval('public.retail_product_barcode_seq'::regclass)::text, 12, '0');
    if exists (select 1 from public.products where restaurant_id = p_restaurant_id and barcode = v_barcode) then
      continue;
    end if;
    if p_product_id is null then
      -- Reserved draft: the normal product form performs the eventual save.
      return jsonb_build_object('product_id', null, 'barcode', v_barcode, 'saved', false, 'generated', true);
    end if;
    begin
      update public.products set barcode = v_barcode, updated_date = now()
        where id = p_product_id and restaurant_id = p_restaurant_id and branch_id is null;
      if not found then
        raise exception 'Product barcode could not be saved.' using errcode = '42501';
      end if;
      return jsonb_build_object('product_id', p_product_id, 'barcode', v_barcode, 'saved', true, 'generated', true);
    exception when unique_violation then
      -- A manually entered internal code may occupy the next sequence value.
      null;
    end;
  end loop;
  raise exception 'Unable to allocate a barcode. Please try again.';
end;
$$;
revoke all on function public.erp_create_product_barcode(uuid, uuid) from public, anon;
grant execute on function public.erp_create_product_barcode(uuid, uuid) to authenticated;
