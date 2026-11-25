"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <AuthCard title={t("forgotPassword")}>
      <form
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          try {
            const supabase = createClient();
            const site = window.location.origin;
            await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${site}/reset-password` });
          } catch {
            setPending(false);
            toast.push({ title: t("devNotConnected"), tone: "danger" });
            return;
          }
          setPending(false);
          toast.push({ title: t("resetSent"), tone: "success" });
        }}
      >
        <label className="grid gap-1 text-sm font-medium">
          {t("email")}
          <Input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <Button type="submit" disabled={pending}>{t("sendResetLink")}</Button>
      </form>
      <Link href="/login" className="mt-4 inline-block text-sm text-link">{t("login")}</Link>
    </AuthCard>
  );
}
