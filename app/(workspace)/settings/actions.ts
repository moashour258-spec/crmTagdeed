"use server";

import { revalidatePath } from "next/cache";
import { arabicError } from "@/lib/auth/errors";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

export async function updateSettingAction(key: string, raw: string): Promise<Result> {
  if (!hasPublicEnv()) {
    return { ok: false, error: "مشروع سوبربيز للتطوير غير مربوط بعد. أضف مفاتيح البيئة ثم أعد التشغيل." };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "اكتب قيمة الإعداد" };
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    value = trimmed;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_setting", { key, value });
  if (error) return { ok: false, error: arabicError(error) };
  revalidatePath("/settings");
  return { ok: true };
}
