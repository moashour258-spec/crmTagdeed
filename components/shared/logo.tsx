import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className="inline-flex rounded-xl bg-logo-badge p-1">
      <Image
        src="/logo.jpg"
        alt="تجديد"
        width={compact ? 32 : 144}
        height={compact ? 32 : 72}
        className={cn("object-cover object-top", compact ? "h-8 w-8" : "h-12 w-auto", className)}
      />
    </span>
  );
}
