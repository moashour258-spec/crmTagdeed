import { BulkForm } from "@/components/commissions/bulk-form";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function BulkCommissionPage() {
  if (!hasPublicEnv()) {
    return <EmptyState title="تعديل العمولات" body="اربط مشروع سوبربيز للتطوير لتعديل عمولة القطع دفعة واحدة." />;
  }
  const supabase = await createClient();
  const [{ data: stores }, { data: categories }, { data: rules }] = await Promise.all([
    supabase.from("stores").select("id, name").eq("is_active", true).order("name"),
    supabase.from("categories").select("id, name_ar").eq("is_active", true).order("sort_order"),
    supabase.from("commission_rules").select("id, new_type, new_value, affected_count, undone_at, created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  return (
    <BulkForm
      stores={(stores ?? []).map((store) => ({ id: store.id, label: store.name }))}
      categories={(categories ?? []).map((category) => ({ id: category.id, label: category.name_ar }))}
      batches={(rules ?? []).map((rule) => ({
        id: rule.id,
        undone: Boolean(rule.undone_at),
        summary: `${rule.affected_count} قطعة · ${rule.new_type === "percentage" ? `${rule.new_value}%` : rule.new_value}`,
      }))}
    />
  );
}
