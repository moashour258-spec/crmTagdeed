import { PayoutForm, type PayoutEmployee } from "@/components/commissions/payout-form";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function PayoutsPage() {
  if (!hasPublicEnv()) {
    return <EmptyState title="صرف العمولات" body="اربط مشروع سوبربيز للتطوير لصرف العمولات المعتمدة." />;
  }
  const supabase = await createClient();
  const { data: approved } = await supabase
    .from("commissions")
    .select("user_id, total_amount")
    .eq("status", "approved");
  const totals = new Map<string, { net: number; count: number }>();
  for (const row of approved ?? []) {
    const current = totals.get(row.user_id) ?? { net: 0, count: 0 };
    current.net += Number(row.total_amount);
    current.count += 1;
    totals.set(row.user_id, current);
  }
  const userIds = [...totals.keys()];
  const { data: people } = userIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", userIds)
    : { data: [] };
  const names = new Map((people ?? []).map((person) => [person.id, person.full_name || person.email]));
  const employees: PayoutEmployee[] = userIds.map((userId) => ({
    userId,
    name: names.get(userId) ?? "موظف",
    net: totals.get(userId)?.net ?? 0,
    count: totals.get(userId)?.count ?? 0,
  }));
  const { data: history } = await supabase
    .from("commission_payments")
    .select("id, user_id, total_amount, paid_at, method")
    .order("created_at", { ascending: false })
    .limit(12);

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted">الصرف يقفل كل عمولة واسترداد معتمد لهذا الموظف في حركة واحدة. إذا كان الصافي سالباً يُرحَّل إلى الصرف التالي.</p>
      <PayoutForm employees={employees} />
      <section className="grid gap-2">
        <h2 className="font-semibold">آخر عمليات الصرف</h2>
        {(history ?? []).length === 0 ? <p className="text-sm text-muted">لا يوجد صرف بعد.</p> : null}
        {(history ?? []).map((payment) => (
          <p key={payment.id} className="text-sm">
            {formatDate(new Date(payment.paid_at))} · {payment.method} · {formatMoney(Number(payment.total_amount))}
          </p>
        ))}
      </section>
    </div>
  );
}
