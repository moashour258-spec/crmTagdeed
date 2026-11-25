import { SettingRow } from "@/components/settings/setting-row";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  if (!hasPublicEnv()) {
    return <EmptyState title="الإعدادات" body="اربط مشروع سوبربيز للتطوير لتعديل إعدادات تجديد." />;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("key, value, super_admin_only")
    .order("key");
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">اكتب القيمة كما تُخزَّن: رقم، أو نص، أو JSON. سقف البونص والعمولة الافتراضية للمدير العام فقط.</p>
      {(data ?? []).map((setting) => (
        <SettingRow
          key={setting.key}
          settingKey={setting.key}
          value={typeof setting.value === "string" ? setting.value : JSON.stringify(setting.value)}
          restricted={setting.super_admin_only}
        />
      ))}
      {(data ?? []).length === 0 ? <p className="text-sm text-muted">لا توجد إعدادات ظاهرة لهذا الحساب.</p> : null}
    </div>
  );
}
