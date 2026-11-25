"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import type { Notice } from "@/lib/auth/session";

export function AppShell({
  title,
  role,
  notices,
  children,
}: {
  title: string;
  role: "admin" | "sales" | null;
  notices: Notice[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="md:grid md:grid-cols-[16rem_1fr]">
        <aside className="hidden min-h-dvh md:block">
          <Sidebar role={role} />
        </aside>
        <div className="min-w-0">
          <Topbar title={title} notices={notices} onOpenMenu={() => setOpen(true)} />
          <main className="px-3 py-4 md:px-6 md:py-6">{children}</main>
        </div>
      </div>
      {open ? (
        <div className="fixed inset-0 z-40 flex bg-black/60 md:hidden">
          <div className="h-full w-72 max-w-[85vw] overflow-y-auto">
            <Sidebar role={role} onNavigate={() => setOpen(false)} />
          </div>
          <button type="button" className="flex-1" aria-label="إغلاق" onClick={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
