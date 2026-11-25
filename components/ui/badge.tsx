import { cn } from "@/lib/utils";

const tones = {
  available: "bg-success/15 text-success",
  reserved: "bg-warning/15 text-warning",
  partially_sold: "bg-accent/20 text-accent",
  sold: "bg-foreground/10 text-foreground",
  inactive: "bg-surface-2 text-muted",
  neutral: "bg-surface-2 text-foreground",
} as const;

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof tones;
  children: string;
}) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone])}>
      {children}
    </span>
  );
}
