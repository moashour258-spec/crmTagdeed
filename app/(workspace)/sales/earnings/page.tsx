import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const statusLabel: Record<string, string> = {
  pending: "قيد الاعتماد",
  approved: "معتمدة",
  paid: "مصروفة",
  cancelled: "ملغاة",
};

type BonusLine = { rule_name?: string; amount?: number };

export default async function EarningsPage() {
  if (!hasPublicEnv()) {
    return <EmptyState title="أرباحي" body="اربط مشروع سوبربيز للتطوير لعرض عمولاتك." />;
  }
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return <EmptyState title="أرباحي" body="سجّل الدخول لعرض عمولاتك." />;
  const { data: rows } = await supabase
    .from("v_my_commissions")
    .select("id, sale_id, sale_item_id, kind, status, base_amount, bonus_amount, total_amount, bonus_lines, user_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const mine = rows ?? [];
  const saleIds = [...new Set(mine.map((row) => row.sale_id))];
  const itemIds = [...new Set(mine.map((row) => row.sale_item_id))];
  const [{ data: payments }, { data: items }] = await Promise.all([
    saleIds.length ? supabase.from("sale_payment_summary").select("sale_id, payment_status").in("sale_id", saleIds) : Promise.resolve({ data: [] }),
    itemIds.length ? supabase.from("v_my_sale_items").select("id, name").in("id", itemIds) : Promise.resolve({ data: [] }),
  ]);
  const paymentBySale = new Map((payments ?? []).map((payment) => [payment.sale_id, payment.payment_status]));
  const nameByItem = new Map((items ?? []).map((item) => [item.id, item.name]));

  if (mine.length === 0) return <EmptyState title="أرباحي" body="لا توجد عمولات على مبيعاتك بعد." />;

  return (
    <div className="grid gap-3">
      {mine.map((row) => {
        const waiting = row.kind === "earning" && row.status === "pending" && paymentBySale.get(row.sale_id) !== "paid";
        const lines = Array.isArray(row.bonus_lines) ? (row.bonus_lines as BonusLine[]) : [];
        return (
          <article key={row.id} className="grid gap-1 rounded-xl border border-border bg-surface p-4">
            <h2 className="font-semibold">{nameByItem.get(row.sale_item_id) ?? (row.kind === "clawback" ? "استرداد عمولة" : "قطعة")}</h2>
            <p className="text-sm">
              الأساس {formatMoney(Number(row.base_amount))} · البونص {formatMoney(Number(row.bonus_amount))} · الإجمالي {formatMoney(Number(row.total_amount))}
            </p>
            <p className="text-sm text-muted">{waiting ? "بانتظار تحصيل العميل" : statusLabel[row.status] ?? row.status}</p>
            {lines.length > 0 ? (
              <ul className="text-sm text-muted">
                {lines.map((line) => (
                  <li key={`${row.id}-${line.rule_name}`}>{line.rule_name} · {formatMoney(Number(line.amount ?? 0))}</li>
                ))}
              </ul>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
