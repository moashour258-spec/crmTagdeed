import { BonusForm } from "@/components/commissions/bonus-form";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function BonusesPage() {
  if (!hasPublicEnv()) {
    return <EmptyState title="البونص" body="اربط مشروع سوبربيز للتطوير لإضافة قواعد البونص." />;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("bonus_rules")
    .select("id, name, bonus_type, bonus_value, price_min, price_max, is_active")
    .order("created_at", { ascending: false });
  return (
    <BonusForm
      rules={(data ?? []).map((rule) => ({
        id: rule.id,
        name: rule.name,
        bonusType: rule.bonus_type,
        bonusValue: Number(rule.bonus_value),
        priceMin: rule.price_min == null ? null : Number(rule.price_min),
        priceMax: rule.price_max == null ? null : Number(rule.price_max),
        active: rule.is_active,
      }))}
    />
  );
}
