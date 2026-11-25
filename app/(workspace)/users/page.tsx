import { UsersManager, type DirectoryUser } from "@/components/admin/users-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { getGate } from "@/lib/auth/session";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function UsersPage() {
  if (!hasPublicEnv()) {
    return <EmptyState title="لا توجد بيانات" body="اربط مشروع سوبربيز للتطوير لعرض المستخدمين." />;
  }
  const gate = await getGate();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_user_directory");
  if (error) {
    return <EmptyState title="غير مسموح" body="هذه الشاشة للمديرين فقط." />;
  }
  return <UsersManager users={(data ?? []) as DirectoryUser[]} isSuperAdmin={Boolean(gate?.isSuperAdmin)} />;
}
