"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { arabicError } from "@/lib/auth/errors";
import { generatePassword, isStrongPassword } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/client";

export function AccountPasswordForm({ email }: { email: string }) {
  const t = useTranslations("auth");
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <h2 className="mb-3 text-base font-semibold">{t("changePassword")}</h2>
      <form
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          const form = new FormData(event.currentTarget);
          const currentPassword = String(form.get("currentPassword") ?? current);
          const nextPassword = String(form.get("newPassword") ?? next).trim();
          setCurrent(currentPassword);
          setNext(nextPassword);
          if (!isStrongPassword(nextPassword)) {
            setError(t("passwordTooShort"));
            return;
          }
          setPending(true);
          try {
            const supabase = createClient();
            const signed = await supabase.auth.signInWithPassword({ email, password: currentPassword });
            if (signed.error) {
              setPending(false);
              setError(t("invalidCredentials"));
              return;
            }
            const updated = await supabase.auth.updateUser({ password: nextPassword });
            if (updated.error) {
              setPending(false);
              setError(arabicError({ message: updated.error.message, code: updated.error.code }));
              return;
            }
            await supabase.auth.signOut({ scope: "others" });
            setPending(false);
            setCurrent("");
            setNext("");
            toast.push({ title: t("passwordChanged"), tone: "success" });
            toast.push({ title: t("signedOutOthers"), tone: "info" });
          } catch {
            setError(t("loginFailed"));
            setPending(false);
          }
        }}
      >
        <label className="grid gap-1 text-sm font-medium">
          {t("currentPassword")}
          <Input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            required
            disabled={pending}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t("newPassword")}
          <Input
            name="newPassword"
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            value={next}
            onChange={(event) => {
              setNext(event.target.value);
              setError(null);
            }}
            required
            minLength={10}
            disabled={pending}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setNext(generatePassword());
              setError(null);
            }}
          >
            {t("generatePassword")}
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setVisible((value) => !value)}>
            {visible ? t("hidePassword") : t("showPassword")}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending || !email} aria-busy={pending}>
          {pending ? "جاري الحفظ…" : t("savePassword")}
        </Button>
      </form>
    </section>
  );
}
