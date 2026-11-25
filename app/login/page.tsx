"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export default function LoginPage() {
  const t = useTranslations("auth");
  const app = useTranslations("app");
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-card">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo className="h-24 max-w-[10rem]" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">{app("name")}</h1>
            <p className="text-sm text-muted">{app("tagline")}</p>
          </div>
        </div>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!email || password.length < 10) {
              toast.push({ title: t("passwordTooShort"), tone: "danger" });
              return;
            }
            toast.push({ title: "تسجيل الدخول يتصل بسوبربيز في المرحلة التالية.", tone: "info" });
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
          <Button type="submit">{t("login")}</Button>
        </form>
        <div className="mt-4 flex items-center justify-between gap-3">
          <Link href="/" className="text-sm text-link">
            لوحة التحكم
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </main>
  );
}
