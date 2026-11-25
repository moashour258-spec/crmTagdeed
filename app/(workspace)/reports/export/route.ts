import { NextResponse } from "next/server";
import { getGate } from "@/lib/auth/session";
import { toCsv } from "@/lib/csv";
import { hasPublicEnv } from "@/lib/env";
import { reportRange } from "@/lib/reports/range";
import { createClient } from "@/lib/supabase/server";

function file(name: string, body: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function day(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export async function GET(request: Request) {
  if (!hasPublicEnv()) return new NextResponse("مشروع التطوير غير مربوط", { status: 503 });
  const gate = await getGate();
  if (gate?.role !== "admin") return NextResponse.redirect(new URL("/", request.url));
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "sales";
  const range = reportRange("custom", url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? "");
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());

  if (kind === "inventory") {
    const { data } = await supabase.from("products").select("name, public_code, code, status, list_price, store_id, category_id").order("name").limit(10000);
    const storeIds = [...new Set((data ?? []).map((row) => row.store_id))];
    const categoryIds = [...new Set((data ?? []).map((row) => row.category_id))];
    const [{ data: stores }, { data: categories }] = await Promise.all([
      storeIds.length ? supabase.from("stores").select("id, name").in("id", storeIds) : Promise.resolve({ data: [] }),
      categoryIds.length ? supabase.from("categories").select("id, name_ar").in("id", categoryIds) : Promise.resolve({ data: [] }),
    ]);
    const storeName = new Map((stores ?? []).map((store) => [store.id, store.name]));
    const categoryName = new Map((categories ?? []).map((category) => [category.id, category.name_ar]));
    return file("inventory", toCsv(
      ["الاسم", "الكود العام", "الكود", "الحالة", "المخزن", "الفئة", "سعر العرض"],
      (data ?? []).map((row) => [row.name, row.public_code, row.code, row.status, storeName.get(row.store_id) ?? "", categoryName.get(row.category_id) ?? "", row.list_price]),
    ));
  }

  if (kind === "audit") {
    let query = supabase.from("audit_logs").select("created_at, actor_id, action, entity_type, entity_id, visibility, old_values, new_values").order("created_at", { ascending: false }).limit(5000);
    if (range.from) query = query.gte("created_at", range.from);
    if (range.to) query = query.lt("created_at", range.to);
    const { data } = await query;
    return file("audit", toCsv(
      ["الوقت", "المنفّذ", "الإجراء", "الكيان", "الظهور", "قبل", "بعد"],
      (data ?? []).map((row) => [row.created_at, row.actor_id, row.action, row.entity_type, row.visibility, JSON.stringify(row.old_values ?? {}), JSON.stringify(row.new_values ?? {})]),
    ));
  }

  if (kind === "overdue") {
    const { data } = await supabase.from("installment_status").select("sale_id, due_date, amount, status").eq("status", "overdue").limit(5000);
    const saleIds = [...new Set((data ?? []).map((row) => row.sale_id))];
    const { data: sales } = saleIds.length
      ? await supabase.from("sales").select("id, invoice_no, customer_name").in("id", saleIds)
      : { data: [] };
    const saleById = new Map((sales ?? []).map((sale) => [sale.id, sale]));
    return file("overdue", toCsv(
      ["الفاتورة", "العميل", "الاستحقاق", "المبلغ"],
      (data ?? []).map((row) => {
        const sale = saleById.get(row.sale_id);
        return [sale?.invoice_no ?? "", sale?.customer_name ?? "", row.due_date, row.amount];
      }),
    ));
  }

  if (kind === "late") {
    const { data } = await supabase
      .from("sales")
      .select("invoice_no, customer_name, delivery_date, delivery_status")
      .eq("status", "completed")
      .eq("delivery_status", "scheduled")
      .lt("delivery_date", today)
      .limit(5000);
    return file("late-deliveries", toCsv(
      ["الفاتورة", "العميل", "موعد التسليم", "الحالة"],
      (data ?? []).map((row) => [row.invoice_no, row.customer_name, row.delivery_date, row.delivery_status]),
    ));
  }

  let salesQuery = supabase.from("sales").select("id, invoice_no, customer_name, seller_id, total_price, status, sold_at").order("sold_at", { ascending: false }).limit(5000);
  if (range.from) salesQuery = salesQuery.gte("sold_at", range.from);
  if (range.to) salesQuery = salesQuery.lt("sold_at", range.to);
  if (kind === "sales") salesQuery = salesQuery.eq("status", "completed");
  const { data: sales } = await salesQuery;
  const rows = sales ?? [];
  const sellerIds = [...new Set(rows.map((row) => row.seller_id))];
  const { data: sellers } = sellerIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", sellerIds)
    : { data: [] };
  const sellerName = new Map((sellers ?? []).map((seller) => [seller.id, seller.full_name || seller.email]));

  if (kind === "payables") {
    const saleIds = rows.map((row) => row.id);
    const { data: commissions } = saleIds.length
      ? await supabase.from("commissions").select("user_id, status, total_amount, kind, sale_id").in("sale_id", saleIds).limit(10000)
      : { data: [] };
    const totals = new Map<string, { pending: number; approved: number; paid: number; clawback: number }>();
    for (const row of commissions ?? []) {
      const current = totals.get(row.user_id) ?? { pending: 0, approved: 0, paid: 0, clawback: 0 };
      const amount = Number(row.total_amount);
      if (row.kind === "clawback") current.clawback += amount;
      else if (row.status === "pending") current.pending += amount;
      else if (row.status === "approved") current.approved += amount;
      else if (row.status === "paid") current.paid += amount;
      totals.set(row.user_id, current);
    }
    const missing = [...totals.keys()].filter((id) => !sellerName.has(id));
    if (missing.length) {
      const { data: extra } = await supabase.from("profiles").select("id, full_name, email").in("id", missing);
      for (const person of extra ?? []) sellerName.set(person.id, person.full_name || person.email);
    }
    return file("payables", toCsv(
      ["الموظف", "من", "إلى", "قيد الاعتماد", "معتمدة", "مصروفة", "استرداد"],
      [...totals.entries()].map(([id, total]) => [sellerName.get(id) ?? id, day(range.from), day(range.to), total.pending, total.approved, total.paid, total.clawback]),
    ));
  }

  return file("sales", toCsv(
    ["الفاتورة", "التاريخ", "العميل", "الموظف", "الإجمالي", "الحالة"],
    rows.map((row) => [row.invoice_no, row.sold_at, row.customer_name, sellerName.get(row.seller_id) ?? "", row.total_price, row.status]),
  ));
}
