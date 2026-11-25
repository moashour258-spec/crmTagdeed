import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToBasket, PriceRequestForm, ReserveButton } from "@/components/sales/catalog-tools";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function CatalogItemPage({ params }: { params: Promise<{ code: string }> }) {
  if (!hasPublicEnv()) {
    return <EmptyState title="تفاصيل القطعة" body="اربط مشروع سوبربيز للتطوير لعرض التفاصيل." />;
  }
  const { code } = await params;
  const supabase = await createClient();
  const { data: product } = await supabase
    .from("v_catalog")
    .select("public_code, name, description, category_name, list_price, status, is_set, est_total, reserved_by_me, my_reservation_id")
    .eq("public_code", code)
    .maybeSingle();
  if (!product) notFound();
  const [{ data: pieces }, { data: media }] = await Promise.all([
    supabase.rpc("fn_catalog_components", { p_public_code: code }),
    supabase.rpc("fn_product_media", { p_public_code: code }),
  ]);

  return (
    <div className="grid gap-4">
      <Link href="/sales/catalog" className="text-sm text-muted">رجوع للمنتجات المتاحة</Link>
      <div className="grid gap-2 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-xl font-semibold">{product.name}</h2>
        <p className="text-sm text-muted">{product.public_code} · {product.category_name}</p>
        {product.description ? <p>{product.description}</p> : null}
        <p className="tabular-nums">{formatMoney(Number(product.list_price))}</p>
        <p className="text-sm text-muted">عمولة تقديرية {formatMoney(Number(product.est_total))}</p>
        {(media ?? []).length > 0 ? <p className="text-xs text-muted">{media?.length} ملف وسائط محفوظ</p> : null}
        <div className="flex flex-wrap gap-2">
          <AddToBasket line={{ publicCode: product.public_code, name: product.name, listPrice: Number(product.list_price) }} />
          <ReserveButton publicCode={product.public_code} reservationId={product.reserved_by_me ? product.my_reservation_id : null} />
        </div>
        {product.my_reservation_id ? <PriceRequestForm reservationId={product.my_reservation_id} /> : null}
      </div>
      {product.is_set ? (
        <div className="grid gap-3">
          <h3 className="font-semibold">قطع الطقم</h3>
          {(pieces ?? []).map((piece: { suffix: string; name: string; public_code: string; list_price: number }) => (
            <div key={piece.suffix} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-4">
              <div>
                <p className="font-semibold">{piece.name}</p>
                <p className="text-sm text-muted">{piece.public_code} · {formatMoney(Number(piece.list_price))}</p>
              </div>
              <AddToBasket
                line={{
                  publicCode: product.public_code,
                  suffix: piece.suffix,
                  name: piece.name,
                  listPrice: Number(piece.list_price),
                }}
              />
            </div>
          ))}
          {(pieces ?? []).length === 0 ? <p className="text-sm text-muted">لا توجد قطع متاحة داخل الطقم.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
