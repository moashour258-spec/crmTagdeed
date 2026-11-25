"use server";

import { revalidatePath } from "next/cache";
import { arabicError } from "@/lib/auth/errors";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const offline: Result = {
  ok: false,
  error: "مشروع سوبربيز للتطوير غير مربوط بعد. أضف مفاتيح البيئة ثم أعد التشغيل.",
};

function fail(error: { message?: string; code?: string } | null): Result {
  return { ok: false, error: arabicError(error) };
}

export async function saveBonusAction(input: {
  name: string;
  bonusType: "percentage" | "fixed";
  bonusValue: number;
  priceMin: string;
  priceMax: string;
}): Promise<Result> {
  if (!hasPublicEnv()) return offline;
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_bonus_rule", {
    rule_id: null,
    rule_name: input.name.trim(),
    bonus_type: input.bonusType,
    bonus_value: input.bonusValue,
    price_min: input.priceMin.trim() ? Number(input.priceMin) : null,
    price_max: input.priceMax.trim() ? Number(input.priceMax) : null,
    starts_at: null,
    ends_at: null,
    product_ids: [],
    category_ids: [],
    store_ids: [],
  });
  if (error) return fail(error);
  revalidatePath("/bonuses");
  return { ok: true };
}

export async function toggleBonusAction(ruleId: string, active: boolean): Promise<Result> {
  if (!hasPublicEnv()) return offline;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_bonus_active", { rule_id: ruleId, active });
  if (error) return fail(error);
  revalidatePath("/bonuses");
  return { ok: true };
}
