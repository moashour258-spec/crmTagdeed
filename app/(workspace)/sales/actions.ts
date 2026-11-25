"use server";

import { revalidatePath } from "next/cache";
import { arabicError } from "@/lib/auth/errors";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const offline = {
  ok: false as const,
  error: "مشروع سوبربيز للتطوير غير مربوط بعد. أضف مفاتيح البيئة ثم أعد التشغيل.",
};

function fail(error: { message?: string; code?: string } | null): { ok: false; error: string } {
  return { ok: false, error: arabicError(error) };
}

export async function reserveAction(publicCode: string): Promise<ActionResult> {
  if (!hasPublicEnv()) return offline;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reserve_by_code", { public_code: publicCode, component_suffix: null });
  if (error) return fail(error);
  revalidatePath("/sales/catalog");
  return { ok: true, id: data };
}

export async function cancelReservationAction(reservationId: string): Promise<ActionResult> {
  if (!hasPublicEnv()) return offline;
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_reservation", { id: reservationId });
  if (error) return fail(error);
  revalidatePath("/sales/catalog");
  return { ok: true };
}

export async function requestPriceAction(reservationId: string, price: number, note: string): Promise<ActionResult> {
  if (!hasPublicEnv()) return offline;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_price_approval", {
    reservation_id: reservationId,
    price,
    note,
  });
  if (error) return fail(error);
  revalidatePath("/approvals");
  return { ok: true, id: data };
}

export async function decidePriceAction(requestId: string, approve: boolean, price: number, note: string): Promise<ActionResult> {
  if (!hasPublicEnv()) return offline;
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_price_request", {
    id: requestId,
    approve,
    price,
    note,
  });
  if (error) return fail(error);
  revalidatePath("/approvals");
  return { ok: true };
}

export type SaleLine = { publicCode: string; suffix?: string; price: number };

export async function previewSaleAction(lines: SaleLine[]): Promise<{ ok: true; preview: unknown } | { ok: false; error: string }> {
  if (!hasPublicEnv()) return offline;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("preview_sale_earnings", {
    items: lines.map((line) => ({
      public_code: line.publicCode,
      suffix: line.suffix || null,
      price: line.price,
    })),
  });
  if (error) return fail(error);
  return { ok: true as const, preview: data };
}

export async function completeSaleAction(input: {
  lines: SaleLine[];
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes: string;
  paymentMethod: string;
}): Promise<ActionResult> {
  if (!hasPublicEnv()) return offline;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_sale", {
    items: input.lines.map((line) => ({
      public_code: line.publicCode,
      suffix: line.suffix || null,
      price: line.price,
    })),
    customer: {
      name: input.customerName,
      phone: input.customerPhone,
      address: input.customerAddress,
      notes: input.notes,
    },
    payment_method: input.paymentMethod,
    delivery: null,
  });
  if (error) return fail(error);
  revalidatePath("/sales/catalog");
  revalidatePath("/sales/my-sales");
  return { ok: true, id: data };
}

export async function requestCorrectionAction(saleId: string, note: string): Promise<ActionResult> {
  if (!hasPublicEnv()) return offline;
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_sale_correction", { sale_id: saleId, note });
  if (error) return fail(error);
  return { ok: true };
}
