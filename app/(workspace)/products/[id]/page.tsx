import { notFound } from "next/navigation";
import { ProductWorkspace } from "@/components/catalog/product-workspace";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!hasPublicEnv()) notFound();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: product }, { data: categories }, { data: stores }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, description, code, public_code, status, list_price, min_price, commission_type, commission_value, product_type, allow_piece_sale, category_id, store_id",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("categories").select("id, name_ar, parent_id").eq("is_active", true),
    supabase.from("stores").select("id, name").eq("is_active", true),
  ]);
  if (!product) notFound();

  const { data: media } = await supabase
    .from("product_media")
    .select("id, kind, storage_path, is_primary, sort_order")
    .eq("product_id", id)
    .order("sort_order");

  const withUrls = await Promise.all(
    (media ?? []).map(async (item) => {
      const bucket = item.kind === "video" ? "product-videos" : "product-images";
      const signed = await supabase.storage.from(bucket).createSignedUrl(item.storage_path, 60 * 30);
      return {
        id: item.id as string,
        kind: item.kind as "image" | "video",
        storage_path: item.storage_path as string,
        is_primary: Boolean(item.is_primary),
        sort_order: Number(item.sort_order ?? 0),
        url: signed.data?.signedUrl ?? null,
      };
    }),
  );

  return (
    <ProductWorkspace
      product={{
        id: product.id,
        name: product.name,
        description: product.description,
        code: product.code,
        public_code: product.public_code,
        status: product.status,
        list_price: Number(product.list_price),
        min_price: product.min_price == null ? null : Number(product.min_price),
        commission_type: product.commission_type,
        commission_value: Number(product.commission_value),
        product_type: product.product_type,
        allow_piece_sale: Boolean(product.allow_piece_sale),
        category_id: product.category_id,
        store_id: product.store_id,
      }}
      media={withUrls}
      categories={(categories ?? [])
        .filter((category) => category.parent_id)
        .map((category) => ({ id: category.id, label: category.name_ar }))}
      stores={(stores ?? []).map((store) => ({ id: store.id, label: store.name }))}
    />
  );
}
