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

export async function approveCommissionsAction(ids: string[], reason: string): Promise<Result> {
  if (!hasPublicEnv()) return offline;
  if (ids.length === 0) return { ok: false, error: "اختر عمولة واحدة على الأقل" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_commissions", {
    ids,
    override_reason: reason.trim() || null,
  });
  if (error) return fail(error);
  revalidatePath("/commissions");
  revalidatePath("/payouts");
  revalidatePath("/sales/earnings");
  return { ok: true };
}

export async function payoutAction(input: { userId: string; paidAt: string; method: string; note: string }): Promise<Result> {
  if (!hasPublicEnv()) return offline;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_commission_payout", {
    user_id: input.userId,
    paid_at: input.paidAt,
    method: input.method,
    note: input.note.trim() || null,
  });
  if (error) return fail(error);
  revalidatePath("/payouts");
  revalidatePath("/commissions");
  revalidatePath("/sales/earnings");
  return { ok: true };
}

export async function bulkCommissionAction(input: {
  search: string;
  priceMin: string;
  priceMax: string;
  storeId: string;
  categoryId: string;
  status: string;
  ids: string;
  newType: "percentage" | "fixed";
  newValue: number;
  note: string;
}): Promise<Result> {
  if (!hasPublicEnv()) return offline;
  const filters: Record<string, string | number> = {};
  if (input.search.trim()) filters.search = input.search.trim();
  if (input.priceMin.trim()) filters.price_min = Number(input.priceMin);
  if (input.priceMax.trim()) filters.price_max = Number(input.priceMax);
  if (input.storeId) filters.store_id = input.storeId;
  if (input.categoryId) filters.category_id = input.categoryId;
  if (input.status) filters.status = input.status;
  const ids = input.ids
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
  const supabase = await createClient();
  const { error } = await supabase.rpc("bulk_update_commission", {
    filters,
    ids,
    new_type: input.newType,
    new_value: input.newValue,
    note: input.note.trim() || null,
  });
  if (error) return fail(error);
  revalidatePath("/commissions/bulk");
  revalidatePath("/products");
  return { ok: true };
}

export async function undoBulkAction(ruleId: string): Promise<Result> {
  if (!hasPublicEnv()) return offline;
  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_bulk_commission", { rule_id: ruleId });
  if (error) return fail(error);
  revalidatePath("/commissions/bulk");
  revalidatePath("/products");
  return { ok: true };
}
