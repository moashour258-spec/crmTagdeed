import type { ReactNode } from "react";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-card">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo className="h-24 max-w-[10rem]" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
          </div>
        </div>
        {children}
        <div className="mt-4 flex justify-end">
          <ThemeToggle />
        </div>
      </div>
    </main>
  );
}
