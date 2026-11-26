import Link from "next/link";
import { AddToBasket, RefreshCatalog, ReserveButton } from "@/components/sales/catalog-tools";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const statusLabel: Record<string, string> = {
  available: "متاح",
  reserved: "محجوز لك",
  partially_sold: "بيع جزئي",
};

export default async function SalesCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; min?: string; max?: string }>;
}) {
  if (!hasPublicEnv()) {
    return <EmptyState title="المنتجات المتاحة" body="اربط مشروع سوبربيز للتطوير لعرض القطع المتاحة للبيع." />;
  }
  const { q = "", category = "", min = "", max = "" } = await searchParams;
  const safe = q.replace(/[%_,]/g, "").trim();
  const supabase = await createClient();
  let query = supabase
    .from("v_catalog")
    .select(
      "public_code, name, category_id, category_name, list_price, status, primary_image_path, is_set, est_total, reserved_by_me, my_reservation_id",
    )
    .order("name")
    .limit(60);
  if (safe) query = query.ilike("name", `%${safe}%`);
  if (category) query = query.eq("category_id", category);
  if (min) query = query.gte("list_price", Number(min));
  if (max) query = query.lte("list_price", Number(max));
  const [{ data: products }, { data: categories }] = await Promise.all([
    query,
    supabase.from("categories").select("id, name_ar").eq("is_active", true).order("sort_order"),
  ]);

  const withImages = await Promise.all(
    (products ?? []).map(async (product) => {
      let imageUrl: string | null = null;
      if (product.primary_image_path) {
        const signed = await supabase.storage
          .from("product-images")
          .createSignedUrl(product.primary_image_path as string, 60 * 30);
        imageUrl = signed.data?.signedUrl ?? null;
      }
      return { ...product, imageUrl };
    }),
  );

  return (
    <div className="grid gap-4">
      <RefreshCatalog />
      <div>
        <h1 className="text-xl font-semibold">المنتجات المتاحة</h1>
        <p className="text-sm text-muted">القطع المفعّلة الجاهزة للحجز أو البيع.</p>
      </div>
      <form className="grid gap-2 sm:grid-cols-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="بحث بالاسم"
          className="h-11 rounded-xl border border-border bg-surface px-3"
        />
        <select name="category" defaultValue={category} className="h-11 rounded-xl border border-border bg-surface px-3">
          <option value="">كل الفئات</option>
          {(categories ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name_ar}
            </option>
          ))}
        </select>
        <input
          name="min"
          defaultValue={min}
          inputMode="decimal"
          placeholder="من سعر"
          className="h-11 rounded-xl border border-border bg-surface px-3"
        />
        <input
          name="max"
          defaultValue={max}
          inputMode="decimal"
          placeholder="إلى سعر"
          className="h-11 rounded-xl border border-border bg-surface px-3"
        />
        <Button type="submit" variant="secondary" className="sm:col-span-4">
          تصفية
        </Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2">
        {withImages.map((product) => (
          <article key={product.public_code} className="grid gap-3 overflow-hidden rounded-xl border border-border bg-surface">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.imageUrl} alt="" className="aspect-[4/3] w-full object-cover" />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center bg-surface-2 text-sm text-muted">بدون صورة</div>
            )}
            <div className="grid gap-3 p-4 pt-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">
                    <Link href={`/sales/catalog/${product.public_code}`}>{product.name}</Link>
                  </h2>
                  <p className="text-sm text-muted">
                    {product.public_code} · {product.category_name}
                  </p>
                </div>
                <span className="rounded-full bg-surface-2 px-2 py-1 text-xs">
                  {statusLabel[product.status] ?? product.status}
                </span>
              </div>
              <p className="tabular-nums text-lg font-semibold">{formatMoney(Number(product.list_price))} ج.م</p>
              <p className="text-sm text-muted">عمولة تقديرية {formatMoney(Number(product.est_total))} ج.م</p>
              <div className="flex flex-wrap gap-2">
                <AddToBasket
                  line={{
                    publicCode: product.public_code,
                    name: product.name,
                    listPrice: Number(product.list_price),
                  }}
                />
                <ReserveButton
                  publicCode={product.public_code}
                  reservationId={product.reserved_by_me ? product.my_reservation_id : null}
                />
              </div>
            </div>
          </article>
        ))}
      </div>
      {withImages.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          لا توجد قطع متاحة الآن. المنتجات تظهر هنا بعد ما المدير يرفع صورة للمنتج (بيتفعّل تلقائيًا).
        </p>
      ) : null}
    </div>
  );
}
