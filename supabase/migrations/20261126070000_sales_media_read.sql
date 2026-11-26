-- Sales need to read product media for the catalog; uploads stay admin-only.

drop policy if exists tajdeed_media_sales_read on storage.objects;
create policy tajdeed_media_sales_read on storage.objects
  for select
  using (
    bucket_id in ('product-images', 'product-videos')
    and private.is_sales_or_admin()
  );
