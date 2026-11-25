import { NextResponse } from "next/server";
import { getGate } from "@/lib/auth/session";
import { toCsv } from "@/lib/csv";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!hasPublicEnv()) return new NextResponse("مشروع التطوير غير مربوط", { status: 503 });
  const gate = await getGate();
  if (!gate || gate.role !== "sales") return NextResponse.redirect(new URL("/", request.url));
  const supabase = await createClient();
  const { data: sales } = await supabase
    .from("v_my_sales")
    .select("id, invoice_no, customer_name, total_price, sold_at, status, delivery_status")
    .order("sold_at", { ascending: false })
    .limit(5000);
  const ids = (sales ?? []).map((sale) => sale.id);
  const { data: payments } = ids.length
    ? await supabase.from("sale_payment_summary").select("sale_id, payment_status").in("sale_id", ids)
    : { data: [] };
  const paymentBySale = new Map((payments ?? []).map((row) => [row.sale_id, row.payment_status]));
  const body = toCsv(
    ["الفاتورة", "التاريخ", "العميل", "الإجمالي", "حالة الدفع", "التسليم", "حالة الفاتورة"],
    (sales ?? []).map((sale) => [sale.invoice_no, sale.sold_at, sale.customer_name, sale.total_price, paymentBySale.get(sale.id) ?? "", sale.delivery_status ?? "", sale.status]),
  );
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"my-sales.csv\"",
      "Cache-Control": "no-store",
    },
  });
}
