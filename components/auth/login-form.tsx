"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ configured }: { configured: boolean }) {
  const t = useTranslations("auth");
  const app = useTranslations("app");
  const toast = useToast();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <AuthCard title={app("name")} subtitle={app("tagline")}>
      <form
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!configured) {
            toast.push({ title: t("devNotConnected"), tone: "danger" });
            return;
          }
          if (password.length < 10) {
            toast.push({ title: t("passwordTooShort"), tone: "danger" });
            return;
          }
          setPending(true);
          const supabase = createClient();
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          setPending(false);
          if (error) {
            toast.push({ title: t("invalidCredentials"), tone: "danger" });
            return;
          }
          router.refresh();
          router.push("/");
        }}
      >
        <label className="grid gap-1 text-sm font-medium">
          {t("email")}
          <Input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t("password")}
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <Button type="submit" disabled={pending}>{t("login")}</Button>
      </form>
      <Link href="/forgot-password" className="mt-4 inline-block text-sm text-link">
        {t("forgotPassword")}
      </Link>
    </AuthCard>
  );
}
