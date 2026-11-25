import Link from "next/link";
import { CorrectionForm } from "@/components/sales/correction-form";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function MySalesPage() {
  if (!hasPublicEnv()) {
    return <EmptyState title="مبيعاتي" body="اربط مشروع سوبربيز للتطوير لعرض فواتيرك." />;
  }
  const supabase = await createClient();
  const { data: sales } = await supabase
    .from("v_my_sales")
    .select("id, invoice_no, customer_name, customer_phone, payment_method, total_price, sold_at, status, delivery_status")
    .order("sold_at", { ascending: false })
    .limit(40);
  const ids = (sales ?? []).map((sale) => sale.id);
  const [{ data: payments }, { data: installments }] = await Promise.all([
    ids.length ? supabase.from("sale_payment_summary").select("sale_id, payment_status, balance").in("sale_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("installment_status").select("sale_id, seq, due_date, amount, status").in("sale_id", ids).order("seq") : Promise.resolve({ data: [] }),
  ]);
  const paymentBySale = new Map((payments ?? []).map((row) => [row.sale_id, row]));
  const planBySale = new Map<string, NonNullable<typeof installments>>();
  for (const row of installments ?? []) {
    planBySale.set(row.sale_id, [...(planBySale.get(row.sale_id) ?? []), row]);
  }

  return (
    <div className="grid gap-3">
      <Link href="/sales/my-sales/export" className="text-sm underline">تصدير مبيعاتي</Link>
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
          <p className="text-sm text-muted">
            {sale.status === "cancelled" ? "ملغاة" : "مكتملة"}
            {" · "}
            {paymentBySale.get(sale.id)?.payment_status === "paid" ? "مدفوعة" : paymentBySale.get(sale.id)?.payment_status === "partial" ? "مدفوعة جزئيًا" : "غير مدفوعة"}
            {sale.delivery_status ? ` · التسليم: ${sale.delivery_status === "delivered" ? "تم" : sale.delivery_status === "scheduled" ? "مجدول" : sale.delivery_status === "pickup" ? "استلام" : "في الانتظار"}` : ""}
          </p>
          {(planBySale.get(sale.id) ?? []).map((row) => (
            <p key={`${row.sale_id}-${row.seq}`} className="text-sm text-muted">
              قسط {row.seq} · {formatDate(new Date(row.due_date))} · {formatMoney(Number(row.amount))} · {row.status === "paid" ? "مدفوع" : row.status === "overdue" ? "متأخر" : row.status === "partial" ? "جزئي" : "قادم"}
            </p>
          ))}
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
