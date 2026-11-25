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

export async function recordPaymentAction(input: {
  saleId: string;
  kind: "payment" | "refund";
  amount: number;
  paidAt: string;
  method: string;
  note: string;
  reason: string;
}): Promise<Result> {
  if (!hasPublicEnv()) return offline;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_sale_payment", {
    sale_id: input.saleId,
    kind: input.kind,
    amount: input.amount,
    paid_at: input.paidAt,
    method: input.method,
    note: input.note,
    reason: input.reason || null,
  });
  if (error) return fail(error);
  revalidatePath(`/sales/${input.saleId}`);
  return { ok: true };
}

export async function savePlanAction(saleId: string, rows: { seq: number; dueDate: string; amount: number }[], reason: string): Promise<Result> {
  if (!hasPublicEnv()) return offline;
  const supabase = await createClient();
  const payload = rows.map((row) => ({ seq: row.seq, due_date: row.dueDate, amount: row.amount }));
  const { error } = reason.trim()
    ? await supabase.rpc("reschedule_installments", { sale_id: saleId, rows: payload, reason })
    : await supabase.rpc("set_installment_plan", { sale_id: saleId, rows: payload });
  if (error) return fail(error);
  revalidatePath(`/sales/${saleId}`);
  revalidatePath("/approvals");
  return { ok: true };
}

export async function setDeliveryAction(input: {
  saleId: string;
  status: "pending" | "scheduled" | "delivered" | "pickup";
  date: string;
  address: string;
  notes: string;
}): Promise<Result> {
  if (!hasPublicEnv()) return offline;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_delivery", {
    sale_id: input.saleId,
    status: input.status,
    delivery_date: input.date || null,
    address: input.address,
    notes: input.notes,
  });
  if (error) return fail(error);
  revalidatePath(`/sales/${input.saleId}`);
  revalidatePath("/deliveries");
  return { ok: true };
}

export async function cancelItemAction(input: {
  saleId: string;
  itemId: string;
  reason: string;
  restore: "available" | "inactive";
  refundAmount: number | null;
}): Promise<Result> {
  if (!hasPublicEnv()) return offline;
  const supabase = await createClient();
  const refund = input.refundAmount && input.refundAmount > 0
    ? { amount: input.refundAmount, method: "كاش", reason: input.reason }
    : null;
  const { error } = await supabase.rpc("cancel_sale_item", {
    sale_item_id: input.itemId,
    reason: input.reason,
    restore_status: input.restore,
    refund,
  });
  if (error) return fail(error);
  revalidatePath(`/sales/${input.saleId}`);
  revalidatePath("/sales/catalog");
  return { ok: true };
}

export async function cancelSaleAction(input: {
  saleId: string;
  reason: string;
  restore: "available" | "inactive";
  refundAmount: number | null;
}): Promise<Result> {
  if (!hasPublicEnv()) return offline;
  const supabase = await createClient();
  const refund = input.refundAmount && input.refundAmount > 0
    ? { amount: input.refundAmount, method: "كاش", reason: input.reason }
    : null;
  const { error } = await supabase.rpc("cancel_sale", {
    sale_id: input.saleId,
    reason: input.reason,
    restore_status: input.restore,
    refund,
  });
  if (error) return fail(error);
  revalidatePath(`/sales/${input.saleId}`);
  return { ok: true };
}
