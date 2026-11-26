import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductTools } from "@/components/catalog/product-tools";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!hasPublicEnv()) notFound();
  const { id } = await params;
  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, name, code, public_code, status, list_price, description")
    .eq("id", id)
    .maybeSingle();
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
    <div className="grid gap-4">
      <Link href="/products" className="text-sm text-link">
        العودة للمنتجات
      </Link>
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-xl font-semibold">{product.name}</h2>
        <p className="text-sm text-muted">
          {product.public_code} · {product.code} · {product.status}
        </p>
        {product.description ? <p className="mt-2 text-sm">{product.description}</p> : null}
        {withUrls.length === 0 ? (
          <p className="mt-3 text-sm text-danger">ناقص صور. التفعيل يحتاج صورة واحدة على الأقل — ارفعها من القسم التالي.</p>
        ) : null}
      </section>
      <ProductTools productId={product.id} media={withUrls} />
    </div>
  );
}
