import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const labels: Record<string, string> = {
  pending: "في الانتظار",
  scheduled: "مجدول",
  delivered: "تم التسليم",
  pickup: "استلام من المعرض",
};

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; late?: string }>;
}) {
  if (!hasPublicEnv()) {
    return <EmptyState title="التسليمات" body="اربط مشروع سوبربيز للتطوير لمتابعة التسليم." />;
  }
  const { status = "", late = "" } = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("sales")
    .select("id, invoice_no, customer_name, delivery_status, delivery_date, status")
    .eq("status", "completed")
    .order("sold_at", { ascending: false })
    .limit(80);
  if (status) query = query.eq("delivery_status", status);
  if (late === "1") query = query.eq("delivery_status", "scheduled").lt("delivery_date", new Date().toISOString().slice(0, 10));
  const { data: sales } = await query;

  return (
    <div className="grid gap-4">
      <form className="flex flex-wrap gap-2">
        <select name="status" defaultValue={status} className="h-11 rounded-xl border border-border bg-surface px-3">
          <option value="">كل الحالات</option>
          <option value="pending">في الانتظار</option>
          <option value="scheduled">مجدول</option>
          <option value="delivered">تم التسليم</option>
          <option value="pickup">استلام من المعرض</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="late" value="1" defaultChecked={late === "1"} />
          المتأخر فقط
        </label>
        <button type="submit" className="h-11 rounded-[10px] bg-surface-2 px-4 text-sm font-semibold">تصفية</button>
      </form>
      <div className="grid gap-2">
        {(sales ?? []).map((sale) => (
          <Link key={sale.id} href={`/sales/${sale.id}`} className="rounded-xl border border-border bg-surface p-4">
            <p className="font-semibold">{sale.invoice_no}</p>
            <p className="text-sm text-muted">
              {sale.customer_name} · {labels[sale.delivery_status] ?? sale.delivery_status}
              {sale.delivery_date ? ` · ${formatDate(new Date(sale.delivery_date))}` : ""}
            </p>
          </Link>
        ))}
        {(sales ?? []).length === 0 ? <p className="text-sm text-muted">لا توجد تسليمات مطابقة.</p> : null}
      </div>
    </div>
  );
}
