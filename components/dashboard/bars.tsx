import { formatMoney } from "@/lib/format";

export function Bars({ rows, empty }: { rows: { label: string; value: number }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <div key={row.label} className="grid items-center gap-2 sm:grid-cols-[9rem_1fr_auto]">
          <span className="truncate text-sm">{row.label}</span>
          <div className="h-3 rounded-full bg-surface-2" role="presentation">
            <div className="h-3 rounded-full bg-primary" style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} />
          </div>
          <span className="text-sm tabular-nums">{formatMoney(row.value)}</span>
        </div>
      ))}
    </div>
  );
}
