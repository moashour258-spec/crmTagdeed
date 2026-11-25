import { getTranslations } from "next-intl/server";
import { AccountPasswordForm } from "@/components/account/password-form";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { getGate } from "@/lib/auth/session";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function AccountPage() {
  const theme = await getTranslations("theme");
  const gate = await getGate();
  let email = "";
  let needsPrivateData = false;
  if (hasPublicEnv() && gate) {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    email = auth.user?.email ?? "";
    if (gate.isSuperAdmin) {
      const { data } = await supabase.from("employee_private_data").select("user_id").maybeSingle();
      needsPrivateData = !data;
    }
  }

  return (
    <div className="grid gap-4">
      {needsPrivateData ? (
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          يمكنك إضافة رقم الهاتف والعنوان والرقم القومي لاحقًا من هذه الصفحة عندما تتاح الشاشة.
        </p>
      ) : null}
      <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h2 className="mb-3 text-base font-semibold">{theme("title")}</h2>
        <ThemeToggle />
      </section>
      <AccountPasswordForm email={email} />
    </div>
  );
}
