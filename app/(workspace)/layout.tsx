"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/shell/app-shell";
import { navItems } from "@/components/shell/nav";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const item = navItems.find((entry) => entry.href === pathname);
  const title = item ? t(item.key) : t("dashboard");
  return <AppShell title={title}>{children}</AppShell>;
}
