"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { finishPasswordAction } from "@/app/(auth)/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { arabicError } from "@/lib/auth/errors";
import { generatePassword, isStrongPassword } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/client";

export default function ChangePasswordPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthCard title={t("mustChangeTitle")}>
      <form
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          // Read from the form so mobile autofill is picked up even if React state lagged.
          const form = new FormData(event.currentTarget);
          const nextPassword = String(form.get("password") ?? password).trim();
          setPassword(nextPassword);
          if (!isStrongPassword(nextPassword)) {
            setError(t("passwordTooShort"));
            return;
          }
          setPending(true);
          try {
            const supabase = createClient();
            const updated = await supabase.auth.updateUser({ password: nextPassword });
            if (updated.error) {
              setError(arabicError({ message: updated.error.message, code: updated.error.code }));
              setPending(false);
              return;
            }
            const result = await finishPasswordAction();
            setPending(false);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push("/");
            router.refresh();
          } catch {
            setError(t("loginFailed"));
            setPending(false);
          }
        }}
      >
        <label className="grid gap-1 text-sm font-medium">
          {t("newPassword")}
          <Input
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
            required
            minLength={10}
            disabled={pending}
          />
        </label>
        <p className="text-xs text-muted">{t("passwordHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setPassword(generatePassword());
              setError(null);
            }}
          >
            {t("generatePassword")}
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setVisible((value) => !value)}>
            {visible ? t("hidePassword") : t("showPassword")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending || !password}
            onClick={async () => {
              await navigator.clipboard.writeText(password);
            }}
          >
            {t("copy")}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "جاري الحفظ…" : t("savePassword")}
        </Button>
      </form>
      <form action="/auth/sign-out" method="post" className="mt-4">
        <Button type="submit" variant="ghost">
          خروج
        </Button>
      </form>
    </AuthCard>
  );
}
