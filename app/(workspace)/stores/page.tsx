import { StoresManager, type StoreRow } from "@/components/catalog/stores-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function StoresPage() {
  if (!hasPublicEnv()) {
    return <EmptyState title="المخازن" body="اربط مشروع سوبربيز للتطوير لإدارة المخازن." />;
  }
  const supabase = await createClient();
  const { data: stores } = await supabase.from("stores").select("id, name, store_code, address, phone, notes, is_active").order("name");
  const { data: products } = await supabase.from("products").select("store_id, status");
  const rows: StoreRow[] = (stores ?? []).map((store) => ({
    ...(store as Omit<StoreRow, "stock">),
    stock: (products ?? []).filter((product) => product.store_id === store.id && (product.status === "available" || product.status === "reserved")).length,
  }));
  return <StoresManager stores={rows} />;
}
