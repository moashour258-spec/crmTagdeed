import Image from "next/image";
import type { ReactNode } from "react";

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
      <Image src="/logo.jpg" alt="" width={64} height={64} className="h-16 w-16 rounded-xl bg-logo-badge object-cover object-top" />
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {body ? <p className="max-w-md text-sm text-muted">{body}</p> : null}
      {action}
    </div>
  );
}
