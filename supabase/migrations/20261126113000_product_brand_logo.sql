-- Optional HTTPS logo URL; no server-side image retrieval or changes to existing products.
alter table public.product_brand_master add column image_url text;
alter table public.product_brand_master add constraint product_brand_master_image_url_check
  check (image_url is null or (char_length(image_url) <= 2048 and image_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$'));
grant insert (image_url), update (image_url) on public.product_brand_master to authenticated;
comment on column public.product_brand_master.image_url is 'Optional public HTTPS logo URL. Existing tenant RLS applies. No server-side fetch.';
