"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/shell/app-shell";
import { navItems } from "@/components/shell/nav";
import type { Notice } from "@/lib/auth/session";

export function WorkspaceFrame({
  role,
  notices,
  children,
}: {
  role: "admin" | "sales" | null;
  notices: Notice[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const messages = useTranslations("messages");
  const item = navItems.find((entry) => entry.href === pathname);
  const title = item ? t(item.key) : pathname === "/" ? t("dashboard") : messages("notFound");
  return (
    <AppShell title={title} role={role} notices={notices}>
      {children}
    </AppShell>
  );
}
