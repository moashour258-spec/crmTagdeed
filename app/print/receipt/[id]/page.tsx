import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  if (!hasPublicEnv()) {
    return <EmptyState title="الإيصال" body="اربط مشروع سوبربيز للتطوير لطباعة الإيصال." />;
  }
  const { id } = await params;
  const supabase = await createClient();
  const { data: payment } = await supabase
    .from("sale_payments")
    .select("id, receipt_no, sale_id, kind, amount, paid_at, method, note, reason")
    .eq("id", id)
    .maybeSingle();
  if (!payment) notFound();
  const [{ data: sale }, { data: settings }] = await Promise.all([
    supabase.from("sales").select("invoice_no, customer_name").eq("id", payment.sale_id).maybeSingle(),
    supabase.from("app_settings").select("key, value").in("key", ["company_name", "company_footer"]),
  ]);
  const company = new Map((settings ?? []).map((row) => [row.key, String(row.value).replace(/^"|"$/g, "")]));

  return (
    <main className="mx-auto grid max-w-md gap-4 px-4 py-8" dir="rtl">
      <header>
        <p className="text-sm text-muted">{company.get("company_name") || "تجديد"}</p>
        <h1 className="text-2xl font-semibold">{payment.receipt_no}</h1>
      </header>
      <section className="grid gap-1 text-sm">
        <p>الفاتورة: {sale?.invoice_no}</p>
        <p>العميل: {sale?.customer_name}</p>
        <p>{payment.kind === "refund" ? "استرداد" : "دفعة"} · {payment.method}</p>
        <p>التاريخ: {formatDate(new Date(payment.paid_at))}</p>
        {payment.reason ? <p>السبب: {payment.reason}</p> : null}
        {payment.note ? <p>{payment.note}</p> : null}
      </section>
      <p className="text-lg font-semibold tabular-nums">{formatMoney(Number(payment.amount))}</p>
      <p className="text-sm text-muted">{company.get("company_footer")}</p>
    </main>
  );
}
