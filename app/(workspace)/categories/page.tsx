import { CategoriesManager, type CategoryRow } from "@/components/catalog/categories-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function CategoriesPage() {
  if (!hasPublicEnv()) {
    return <EmptyState title="الفئات" body="اربط مشروع سوبربيز للتطوير لإدارة الفئات." />;
  }
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("id, name_ar, parent_id, sort_order, is_active").order("sort_order");
  return <CategoriesManager categories={(data ?? []) as CategoryRow[]} />;
}
