"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/shared/logo";
import { navItems } from "@/components/shell/nav";
import { cn } from "@/lib/utils";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav className="flex h-full flex-col gap-2 bg-sidebar p-3 text-on-primary">
      <Link href="/" className="mb-2 flex items-center gap-3 px-1" onClick={onNavigate}>
        <Logo />
        <span className="text-sm leading-5 text-on-primary">لأدوات منزلية مستعملة</span>
      </Link>
      {navItems.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "rounded-[10px] px-3 py-2 text-sm font-medium text-on-primary hover:bg-on-primary/10",
              active && "bg-on-primary/15",
            )}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
