"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { finishPasswordAction } from "@/app/(auth)/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { generatePassword } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/client";

export default function ChangePasswordPage() {
  const t = useTranslations("auth");
  const toast = useToast();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <AuthCard title={t("mustChangeTitle")}>
      <form
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (password.length < 10) {
            toast.push({ title: t("passwordTooShort"), tone: "danger" });
            return;
          }
          setPending(true);
          const supabase = createClient();
          const updated = await supabase.auth.updateUser({ password });
          if (updated.error) {
            setPending(false);
            toast.push({ title: t("passwordTooShort"), tone: "danger" });
            return;
          }
          const result = await finishPasswordAction();
          setPending(false);
          if (!result.ok) {
            toast.push({ title: result.error, tone: "danger" });
            return;
          }
          toast.push({ title: t("passwordChanged"), tone: "success" });
          router.push("/");
          router.refresh();
        }}
      >
        <label className="grid gap-1 text-sm font-medium">
          {t("newPassword")}
          <Input
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setPassword(generatePassword())}>
            {t("generatePassword")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setVisible((value) => !value)}>
            {visible ? t("hidePassword") : t("showPassword")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(password);
              toast.push({ title: t("copied"), tone: "success" });
            }}
          >
            {t("copy")}
          </Button>
        </div>
        <Button type="submit" disabled={pending}>{t("savePassword")}</Button>
      </form>
      <form action="/auth/sign-out" method="post" className="mt-4">
        <Button type="submit" variant="ghost">خروج</Button>
      </form>
    </AuthCard>
  );
}
