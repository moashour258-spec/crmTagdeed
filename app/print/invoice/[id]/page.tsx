import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { formatDateTime, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  if (!hasPublicEnv()) {
    return <EmptyState title="الفاتورة" body="اربط مشروع سوبربيز للتطوير لطباعة الفاتورة." />;
  }
  const { id } = await params;
  const supabase = await createClient();
  const { data: sale } = await supabase
    .from("v_my_sales")
    .select("id, invoice_no, customer_name, customer_phone, customer_address, payment_method, total_price, sold_at, status, delivery_status")
    .eq("id", id)
    .maybeSingle();
  if (!sale) notFound();
  const { data: items } = await supabase
    .from("v_my_sale_items")
    .select("id, name, public_code, sale_price")
    .eq("sale_id", id);

  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8" dir="rtl">
      <header className="grid gap-1">
        <p className="text-sm text-muted">تجديد</p>
        <h1 className="text-2xl font-semibold">{sale.invoice_no}{sale.status === "cancelled" ? " · ملغاة" : ""}</h1>
        <p className="text-sm text-muted">{formatDateTime(new Date(sale.sold_at))}</p>
      </header>
      <section className="grid gap-1 text-sm">
        <p>العميل: {sale.customer_name}</p>
        <p>الهاتف: {sale.customer_phone}</p>
        {sale.customer_address ? <p>العنوان: {sale.customer_address}</p> : null}
        <p>طريقة الدفع: {sale.payment_method}</p>
        {sale.delivery_status ? <p>التسليم: {sale.delivery_status === "delivered" ? "تم التسليم" : sale.delivery_status === "scheduled" ? "مجدول" : sale.delivery_status === "pickup" ? "استلام من المعرض" : "في الانتظار"}</p> : null}
      </section>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-start">
            <th className="py-2 text-start">القطعة</th>
            <th className="py-2 text-start">الكود</th>
            <th className="py-2 text-start">السعر</th>
          </tr>
        </thead>
        <tbody>
          {(items ?? []).map((item) => (
            <tr key={item.id} className="border-b border-border">
              <td className="py-2">{item.name}</td>
              <td className="py-2">{item.public_code}</td>
              <td className="py-2 tabular-nums">{formatMoney(Number(item.sale_price))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-lg font-semibold tabular-nums">الإجمالي {formatMoney(Number(sale.total_price))}</p>
    </main>
  );
}
