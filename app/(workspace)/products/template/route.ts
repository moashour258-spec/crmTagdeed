import { NextResponse } from "next/server";
import { templateWorkbook } from "@/lib/catalog/parse-sheet";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  let categories = ["كراسي", "كنب"];
  let stores = ["المخزن الرئيسي"];
  if (hasPublicEnv()) {
    const supabase = await createClient();
    const [{ data: categoryRows }, { data: storeRows }] = await Promise.all([
      supabase.from("categories").select("name_ar").eq("is_active", true),
      supabase.from("stores").select("name").eq("is_active", true),
    ]);
    if (categoryRows?.length) categories = categoryRows.map((row) => row.name_ar as string);
    if (storeRows?.length) stores = storeRows.map((row) => row.name as string);
  }
  const body = templateWorkbook(categories, stores);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=tajdeed-products.xlsx",
    },
  });
}
