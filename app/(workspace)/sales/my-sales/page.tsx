import Link from "next/link";
import { CorrectionForm } from "@/components/sales/correction-form";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function MySalesPage() {
  if (!hasPublicEnv()) {
    return <EmptyState title="مبيعاتي" body="اربط مشروع سوبربيز للتطوير لعرض فواتيرك." />;
  }
  const supabase = await createClient();
  const { data: sales } = await supabase
    .from("v_my_sales")
    .select("id, invoice_no, customer_name, customer_phone, payment_method, total_price, sold_at, status")
    .order("sold_at", { ascending: false })
    .limit(40);

  return (
    <div className="grid gap-3">
      {(sales ?? []).map((sale) => (
        <article key={sale.id} className="grid gap-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">{sale.invoice_no}</h2>
              <p className="text-sm text-muted">{sale.customer_name} · {sale.customer_phone} · {sale.payment_method}</p>
            </div>
            <div className="text-end">
              <p className="tabular-nums">{formatMoney(Number(sale.total_price))}</p>
              <p className="text-xs text-muted">{formatDateTime(new Date(sale.sold_at))}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/print/invoice/${sale.id}`} className="text-sm underline">طباعة الفاتورة</Link>
            <CorrectionForm saleId={sale.id} />
          </div>
        </article>
      ))}
      {(sales ?? []).length === 0 ? <p className="text-sm text-muted">لم تسجّل مبيعات بعد.</p> : null}
    </div>
  );
}
