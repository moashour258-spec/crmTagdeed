"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";

export function Topbar({ title, onOpenMenu }: { title: string; onOpenMenu: () => void }) {
  const t = useTranslations("auth");
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-3 py-3 md:px-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="md:hidden" onClick={onOpenMenu} aria-label="القائمة">
          <Menu className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Button asChild variant="secondary" size="sm">
          <Link href="/login">{t("login")}</Link>
        </Button>
      </div>
    </header>
  );
}
