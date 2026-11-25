import Link from "next/link";
import { DecisionForm } from "@/components/sales/decision-form";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
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
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
  const [{ data: review }, { data: overdue }, { data: late }, { data: paid }] = await Promise.all([
    supabase.from("sales").select("id, invoice_no, customer_name").eq("installments_need_review", true).eq("status", "completed"),
    supabase.from("installment_status").select("id, sale_id, due_date, amount").eq("status", "overdue").limit(30),
    supabase.from("sales").select("id, invoice_no, customer_name, delivery_date").eq("status", "completed").eq("delivery_status", "scheduled").lt("delivery_date", today),
    supabase.from("sale_payment_summary").select("sale_id").eq("payment_status", "paid").limit(40),
  ]);
  const paidIds = (paid ?? []).map((row) => row.sale_id);
  const { data: undelivered } = paidIds.length
    ? await supabase.from("sales").select("id, invoice_no, customer_name, delivery_status").in("id", paidIds).eq("status", "completed").not("delivery_status", "in", "(delivered,pickup)")
    : { data: [] };

  return (
    <div className="grid gap-6">
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
      <section className="grid gap-2">
        <h3 className="font-semibold">أقساط تحتاج مراجعة</h3>
        {(review ?? []).map((sale) => <Link key={sale.id} href={`/sales/${sale.id}`} className="text-sm underline">{sale.invoice_no} · {sale.customer_name}</Link>)}
        {(review ?? []).length === 0 ? <p className="text-sm text-muted">لا يوجد.</p> : null}
      </section>
      <section className="grid gap-2">
        <h3 className="font-semibold">أقساط متأخرة</h3>
        {(overdue ?? []).map((row) => (
          <Link key={row.id} href={`/sales/${row.sale_id}`} className="text-sm underline">
            {formatDate(new Date(row.due_date))} · {formatMoney(Number(row.amount))}
          </Link>
        ))}
        {(overdue ?? []).length === 0 ? <p className="text-sm text-muted">لا يوجد.</p> : null}
      </section>
      <section className="grid gap-2">
        <h3 className="font-semibold">تسليم متأخر</h3>
        {(late ?? []).map((sale) => <Link key={sale.id} href={`/sales/${sale.id}`} className="text-sm underline">{sale.invoice_no} · {sale.customer_name}</Link>)}
        {(late ?? []).length === 0 ? <p className="text-sm text-muted">لا يوجد.</p> : null}
      </section>
      <section className="grid gap-2">
        <h3 className="font-semibold">مدفوع ولم يُسلّم</h3>
        {(undelivered ?? []).map((sale) => <Link key={sale.id} href={`/sales/${sale.id}`} className="text-sm underline">{sale.invoice_no} · {sale.customer_name}</Link>)}
        {(undelivered ?? []).length === 0 ? <p className="text-sm text-muted">لا يوجد.</p> : null}
      </section>
    </div>
  );
}
