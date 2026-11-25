"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const options = ["light", "dark", "system"] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("theme");
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <div className="flex rounded-full border border-border bg-surface p-1" role="group" aria-label={t("title")}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold text-muted",
            ready && theme === option && "bg-primary text-on-primary",
          )}
          onClick={() => setTheme(option)}
        >
          {t(option)}
        </button>
      ))}
    </div>
  );
}
