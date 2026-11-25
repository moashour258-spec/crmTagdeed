import Link from "next/link";
import { ApproveForm, type PendingCommission } from "@/components/commissions/approve-form";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function CommissionsPage() {
  if (!hasPublicEnv()) {
    return <EmptyState title="العمولات" body="اربط مشروع سوبربيز للتطوير لاعتماد العمولات." />;
  }
  const supabase = await createClient();
  const { data: pending } = await supabase
    .from("commissions")
    .select("id, sale_id, user_id, base_amount, bonus_amount, total_amount")
    .eq("status", "pending")
    .eq("kind", "earning")
    .order("created_at", { ascending: true });
  const rows = pending ?? [];
  const saleIds = [...new Set(rows.map((row) => row.sale_id))];
  const userIds = [...new Set(rows.map((row) => row.user_id))];
  const [{ data: sales }, { data: people }, { data: payments }] = await Promise.all([
    saleIds.length ? supabase.from("sales").select("id, invoice_no, customer_name").in("id", saleIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.from("profiles").select("id, full_name, email").in("id", userIds) : Promise.resolve({ data: [] }),
    saleIds.length ? supabase.from("sale_payment_summary").select("sale_id, payment_status").in("sale_id", saleIds) : Promise.resolve({ data: [] }),
  ]);
  const saleById = new Map((sales ?? []).map((sale) => [sale.id, sale]));
  const personById = new Map((people ?? []).map((person) => [person.id, person.full_name || person.email]));
  const paymentBySale = new Map((payments ?? []).map((payment) => [payment.sale_id, payment.payment_status]));
  const view: PendingCommission[] = rows.map((row) => {
    const sale = saleById.get(row.sale_id);
    return {
      id: row.id,
      seller: personById.get(row.user_id) ?? "موظف",
      invoice: sale ? `${sale.invoice_no} · ${sale.customer_name}` : "فاتورة",
      base: Number(row.base_amount),
      bonus: Number(row.bonus_amount),
      total: Number(row.total_amount),
      payment: paymentBySale.get(row.sale_id) ?? "unpaid",
    };
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/commissions/bulk" className="underline">تعديل جماعي</Link>
        <Link href="/payouts" className="underline">الصرف</Link>
        <Link href="/bonuses" className="underline">البونص</Link>
      </div>
      <p className="text-sm text-muted">العمولة تُعتمد بعد تحصيل الفاتورة. إذا لم يكتمل التحصيل، اكتب سبب الاعتماد.</p>
      <ApproveForm rows={view} />
    </div>
  );
}
