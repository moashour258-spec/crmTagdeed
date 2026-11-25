"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { NotificationBell } from "@/components/shell/notification-bell";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import type { Notice } from "@/lib/auth/session";

export function Topbar({
  title,
  onOpenMenu,
  notices,
}: {
  title: string;
  onOpenMenu: () => void;
  notices: Notice[];
}) {
  const t = useTranslations("nav");
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-3 py-3 md:px-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="md:hidden" onClick={onOpenMenu} aria-label="القائمة">
          <Menu className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <NotificationBell notices={notices} />
        <ThemeToggle />
        <form action="/auth/sign-out" method="post">
          <Button type="submit" variant="secondary" size="sm">{t("logout")}</Button>
        </form>
      </div>
    </header>
  );
}
