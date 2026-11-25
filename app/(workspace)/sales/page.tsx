import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function AdminSalesPage() {
  if (!hasPublicEnv()) {
    return <EmptyState title="المبيعات" body="اربط مشروع سوبربيز للتطوير لمتابعة الفواتير والمدفوعات." />;
  }
  const supabase = await createClient();
  const { data: sales } = await supabase
    .from("sales")
    .select("id, invoice_no, customer_name, total_price, status, sold_at, installments_need_review")
    .order("sold_at", { ascending: false })
    .limit(50);

  return (
    <div className="grid gap-3">
      {(sales ?? []).map((sale) => (
        <Link key={sale.id} href={`/sales/${sale.id}`} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">{sale.invoice_no}</h2>
              <p className="text-sm text-muted">{sale.customer_name} · {sale.status === "cancelled" ? "ملغاة" : "مكتملة"}</p>
            </div>
            <div className="text-end">
              <p className="tabular-nums">{formatMoney(Number(sale.total_price))}</p>
              <p className="text-xs text-muted">{formatDateTime(new Date(sale.sold_at))}</p>
            </div>
          </div>
          {sale.installments_need_review ? <p className="mt-2 text-sm text-muted">خطة الأقساط تحتاج مراجعة</p> : null}
        </Link>
      ))}
      {(sales ?? []).length === 0 ? <p className="text-sm text-muted">لا توجد فواتير.</p> : null}
    </div>
  );
}
