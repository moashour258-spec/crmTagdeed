"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { generatePassword } from "@/lib/auth/password";
import { createClient } from "@/lib/supabase/client";

export function AccountPasswordForm({ email }: { email: string }) {
  const t = useTranslations("auth");
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <h2 className="mb-3 text-base font-semibold">{t("changePassword")}</h2>
      <form
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (next.length < 10) {
            toast.push({ title: t("passwordTooShort"), tone: "danger" });
            return;
          }
          setPending(true);
          const supabase = createClient();
          const signed = await supabase.auth.signInWithPassword({ email, password: current });
          if (signed.error) {
            setPending(false);
            toast.push({ title: t("invalidCredentials"), tone: "danger" });
            return;
          }
          const updated = await supabase.auth.updateUser({ password: next });
          if (updated.error) {
            setPending(false);
            toast.push({ title: t("passwordTooShort"), tone: "danger" });
            return;
          }
          await supabase.auth.signOut({ scope: "others" });
          setPending(false);
          setCurrent("");
          setNext("");
          toast.push({ title: t("passwordChanged"), tone: "success" });
          toast.push({ title: t("signedOutOthers"), tone: "info" });
        }}
      >
        <label className="grid gap-1 text-sm font-medium">
          {t("currentPassword")}
          <Input type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t("newPassword")}
          <Input
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            required
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => setNext(generatePassword())}>{t("generatePassword")}</Button>
          <Button type="button" variant="ghost" onClick={() => setVisible((value) => !value)}>
            {visible ? t("hidePassword") : t("showPassword")}
          </Button>
        </div>
        <Button type="submit" disabled={pending || !email}>{t("savePassword")}</Button>
      </form>
    </section>
  );
}
