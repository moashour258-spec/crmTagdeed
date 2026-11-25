"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { generatePassword } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const toast = useToast();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <AuthCard title={t("changePassword")}>
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
          const { error } = await supabase.auth.updateUser({ password });
          setPending(false);
          if (error) {
            toast.push({ title: t("passwordTooShort"), tone: "danger" });
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
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => setPassword(generatePassword())}>
            {t("generatePassword")}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setVisible((value) => !value)}>
            {visible ? t("hidePassword") : t("showPassword")}
          </Button>
        </div>
        <Button type="submit" disabled={pending}>{t("savePassword")}</Button>
      </form>
    </AuthCard>
  );
}
