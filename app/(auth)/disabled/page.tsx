import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";

export default async function DisabledPage() {
  const t = await getTranslations("auth");
  return (
    <AuthCard title={t("disabledTitle")}>
      <p className="text-sm text-muted">تواصل مع المدير إذا كان التعطيل بالخطأ. عمولاتك المستحقة تبقى محفوظة.</p>
      <form action="/auth/sign-out" method="post" className="mt-4">
        <Button type="submit" variant="secondary">خروج</Button>
      </form>
    </AuthCard>
  );
}
