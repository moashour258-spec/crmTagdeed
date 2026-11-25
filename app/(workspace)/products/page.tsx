import Link from "next/link";
import { ProductForm } from "@/components/catalog/product-form";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  if (!hasPublicEnv()) {
    return <EmptyState title="المنتجات" body="اربط مشروع سوبربيز للتطوير لإدارة المنتجات والاستيراد." />;
  }
  const { q = "" } = await searchParams;
  const safe = q.replace(/[%_,]/g, "").trim();
  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select("id, name, code, public_code, status, list_price, min_price")
    .order("created_at", { ascending: false })
    .limit(50);
  if (safe) {
    query = query.or(`name.ilike.%${safe}%,code.ilike.%${safe}%,public_code.ilike.%${safe}%`);
  }
  const [{ data: products }, { data: categories }, { data: stores }] = await Promise.all([
    query,
    supabase.from("categories").select("id, name_ar, parent_id").eq("is_active", true),
    supabase.from("stores").select("id, name").eq("is_active", true),
  ]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex flex-1 gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="بحث بالاسم أو الكود"
            className="h-11 w-full rounded-xl border border-border bg-surface px-3"
          />
          <Button type="submit" variant="secondary">بحث</Button>
        </form>
        <Button asChild variant="secondary"><Link href="/products/import">استيراد</Link></Button>
        <Button asChild variant="secondary"><Link href="/products/template">القالب</Link></Button>
      </div>
      <ProductForm
        categories={(categories ?? []).filter((category) => category.parent_id).map((category) => ({ id: category.id, label: category.name_ar }))}
        stores={(stores ?? []).map((store) => ({ id: store.id, label: store.name }))}
      />
      <div className="grid gap-3">
        {(products ?? []).map((product) => (
          <Link key={product.id} href={`/products/${product.id}`} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">{product.name}</h2>
                <p className="text-sm text-muted">{product.public_code} · {product.code}</p>
              </div>
              <p className="tabular-nums">{formatMoney(Number(product.list_price))} · {product.status}</p>
            </div>
          </Link>
        ))}
        {(products ?? []).length === 0 ? <p className="text-sm text-muted">لا توجد منتجات مطابقة.</p> : null}
      </div>
    </div>
  );
}
