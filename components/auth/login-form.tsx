"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { arabicError } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ configured }: { configured: boolean }) {
  const t = useTranslations("auth");
  const app = useTranslations("app");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthCard title={app("name")} subtitle={app("tagline")}>
      <form
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          if (!configured) {
            setError(t("devNotConnected"));
            return;
          }
          if (password.length < 10) {
            setError(t("passwordTooShort"));
            return;
          }
          setPending(true);
          try {
            const supabase = createClient();
            const { error: signInError } = await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            });
            if (signInError) {
              setError(arabicError({ message: signInError.message, code: signInError.code }));
              setPending(false);
              return;
            }
            // Hard navigation so middleware sees the new session cookies immediately.
            window.location.assign("/");
          } catch {
            setError(t("loginFailed"));
            setPending(false);
          }
        }}
      >
        <label className="grid gap-1 text-sm font-medium">
          {t("email")}
          <Input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
            required
            disabled={pending}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t("password")}
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
            required
            disabled={pending}
          />
        </label>
        {error ? (
          <p role="alert" className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? t("loggingIn") : t("login")}
        </Button>
      </form>
      <Link href="/forgot-password" className="mt-4 inline-block text-sm text-link">
        {t("forgotPassword")}
      </Link>
    </AuthCard>
  );
}
