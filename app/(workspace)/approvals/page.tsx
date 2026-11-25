import { DecisionForm } from "@/components/sales/decision-form";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function ApprovalsPage() {
  if (!hasPublicEnv()) {
    return <EmptyState title="الطلبات المعلقة" body="اربط مشروع سوبربيز للتطوير لمراجعة طلبات السعر." />;
  }
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("price_requests")
    .select("id, requested_price, note, product_id, status")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const productIds = [...new Set((requests ?? []).map((request) => request.product_id))];
  const { data: products } = productIds.length
    ? await supabase.from("products").select("id, name, public_code").in("id", productIds)
    : { data: [] };
  const names = new Map((products ?? []).map((product) => [product.id, product]));

  return (
    <div className="grid gap-3">
      {(requests ?? []).map((request) => {
        const product = names.get(request.product_id);
        return (
          <article key={request.id} className="grid gap-3 rounded-xl border border-border bg-surface p-4">
            <div>
              <h2 className="font-semibold">{product?.name ?? "قطعة"}</h2>
              <p className="text-sm text-muted">{product?.public_code} · السعر المطلوب {formatMoney(Number(request.requested_price))}</p>
              {request.note ? <p className="text-sm">{request.note}</p> : null}
            </div>
            <DecisionForm requestId={request.id} requested={Number(request.requested_price)} />
          </article>
        );
      })}
      {(requests ?? []).length === 0 ? <p className="text-sm text-muted">لا توجد طلبات سعر معلّقة.</p> : null}
    </div>
  );
}
