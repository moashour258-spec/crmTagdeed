import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelControls, DeliveryForm, PaymentForm, PlanForm } from "@/components/admin/sale-controls";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const paymentStatus: Record<string, string> = { unpaid: "غير مدفوع", partial: "مدفوع جزئيًا", paid: "مدفوع" };
const installmentStatus: Record<string, string> = { paid: "مدفوع", partial: "جزئي", overdue: "متأخر", upcoming: "قادم" };

export default async function AdminSalePage({ params }: { params: Promise<{ id: string }> }) {
  if (!hasPublicEnv()) {
    return <EmptyState title="الفاتورة" body="اربط مشروع سوبربيز للتطوير لفتح الفاتورة." />;
  }
  const { id } = await params;
  const supabase = await createClient();
  const { data: sale } = await supabase
    .from("sales")
    .select("id, invoice_no, customer_name, customer_phone, customer_address, total_price, status, payment_method, delivery_status, delivery_date, delivery_address, delivery_notes, installments_need_review")
    .eq("id", id)
    .maybeSingle();
  if (!sale) notFound();
  const [{ data: items }, { data: payments }, { data: summary }, { data: installments }] = await Promise.all([
    supabase.from("sale_items").select("id, product_id, sale_price, status, is_live").eq("sale_id", id),
    supabase.from("sale_payments").select("id, receipt_no, kind, amount, paid_at, method").eq("sale_id", id).order("created_at"),
    supabase.from("sale_payment_summary").select("net_paid, balance, payment_status").eq("sale_id", id).maybeSingle(),
    supabase.from("installment_status").select("id, seq, due_date, amount, covered, status").eq("sale_id", id).order("seq"),
  ]);
  const productIds = [...new Set((items ?? []).map((item) => item.product_id))];
  const { data: products } = productIds.length
    ? await supabase.from("products").select("id, name, public_code").in("id", productIds)
    : { data: [] };
  const names = new Map((products ?? []).map((product) => [product.id, product]));
  const open = sale.status === "completed";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">{sale.invoice_no}</h2>
          <p className="text-sm text-muted">{sale.customer_name} · {sale.customer_phone} · {sale.status === "cancelled" ? "ملغاة" : "مكتملة"}</p>
        </div>
        <Link href={`/print/invoice/${sale.id}`} className="text-sm underline">طباعة الفاتورة</Link>
      </div>
      <p className="tabular-nums">الإجمالي {formatMoney(Number(sale.total_price))} · الصافي {formatMoney(Number(summary?.net_paid ?? 0))} · {paymentStatus[summary?.payment_status ?? "unpaid"]}</p>
      {sale.installments_need_review ? <p className="text-sm text-muted">خطة الأقساط تحتاج مراجعة بعد الإلغاء.</p> : null}
      <div className="grid gap-2">
        {(items ?? []).map((item) => {
          const product = names.get(item.product_id);
          return (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-4">
              <div>
                <p className="font-semibold">{product?.name ?? "قطعة"}</p>
                <p className="text-sm text-muted">{product?.public_code} · {formatMoney(Number(item.sale_price))} · {item.status === "active" ? "نشطة" : "ملغاة"}</p>
              </div>
              {open && item.status === "active" ? <CancelControls saleId={sale.id} itemId={item.id} label="إلغاء القطعة" /> : null}
            </div>
          );
        })}
      </div>
      <section className="grid gap-2">
        <h3 className="font-semibold">المدفوعات</h3>
        {(payments ?? []).map((payment) => (
          <p key={payment.id} className="text-sm">
            <Link href={`/print/receipt/${payment.id}`} className="underline">{payment.receipt_no}</Link>
            {" · "}{payment.kind === "refund" ? "استرداد" : "دفعة"} {formatMoney(Number(payment.amount))} · {payment.method} · {formatDate(new Date(payment.paid_at))}
          </p>
        ))}
        {open ? <PaymentForm saleId={sale.id} /> : null}
      </section>
      <section className="grid gap-2">
        <h3 className="font-semibold">الأقساط</h3>
        {(installments ?? []).map((row) => (
          <p key={row.id} className="text-sm">
            قسط {row.seq} · {formatDate(new Date(row.due_date))} · {formatMoney(Number(row.amount))} · المغطى {formatMoney(Number(row.covered))} · {installmentStatus[row.status] ?? row.status}
          </p>
        ))}
        {open ? <PlanForm saleId={sale.id} hasPlan={(installments ?? []).length > 0} /> : null}
      </section>
      {open ? (
        <section className="grid gap-2">
          <h3 className="font-semibold">التسليم</h3>
          <DeliveryForm
            saleId={sale.id}
            status={sale.delivery_status}
            date={sale.delivery_date ?? ""}
            address={sale.delivery_address ?? sale.customer_address ?? ""}
            notes={sale.delivery_notes ?? ""}
          />
          <CancelControls saleId={sale.id} label="إلغاء الفاتورة" />
        </section>
      ) : null}
    </div>
  );
}
