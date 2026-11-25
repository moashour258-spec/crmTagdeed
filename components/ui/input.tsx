import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
