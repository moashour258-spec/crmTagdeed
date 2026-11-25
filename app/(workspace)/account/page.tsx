import { getTranslations } from "next-intl/server";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { EmptyState } from "@/components/ui/empty-state";

export default async function AccountPage() {
  const t = await getTranslations("theme");
  const common = await getTranslations("common");
  return (
    <div className="grid gap-4">
      <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h2 className="mb-3 text-base font-semibold">{t("title")}</h2>
        <ThemeToggle />
      </section>
      <EmptyState title={common("empty")} body="بيانات الحساب تظهر بعد تسجيل الدخول." />
    </div>
  );
}
