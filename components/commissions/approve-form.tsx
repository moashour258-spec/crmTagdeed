"use client";

import { useState, useTransition } from "react";
import { approveCommissionsAction } from "@/app/(workspace)/commissions/actions";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";

export type PendingCommission = {
  id: string;
  seller: string;
  invoice: string;
  base: number;
  bonus: number;
  total: number;
  payment: string;
};

const paymentLabel: Record<string, string> = {
  unpaid: "غير محصّل",
  partial: "محصّل جزئياً",
  paid: "محصّل",
};

export function ApproveForm({ rows }: { rows: PendingCommission[] }) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  if (rows.length === 0) return <p className="text-sm text-muted">لا توجد عمولات قيد الاعتماد.</p>;
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const ids = form.getAll("id").map(String);
        start(async () => {
          const result = await approveCommissionsAction(ids, String(form.get("reason") ?? ""));
          setMessage(result.ok ? "تم الاعتماد" : result.error);
        });
      }}
    >
      <div className="grid gap-2">
        {rows.map((row) => (
          <label key={row.id} className="grid gap-1 rounded-xl border border-border bg-surface p-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <input type="checkbox" name="id" value={row.id} className="size-4" />
            <span>
              <span className="font-semibold">{row.seller}</span>
              <span className="text-sm text-muted"> · {row.invoice} · {paymentLabel[row.payment] ?? row.payment}</span>
            </span>
            <span className="text-sm">
              أساس {formatMoney(row.base)} · بونص {formatMoney(row.bonus)} · {formatMoney(row.total)}
            </span>
          </label>
        ))}
      </div>
      <input name="reason" placeholder="سبب الاعتماد إذا لم تُحصّل الفاتورة" className="h-11 rounded-xl border border-border bg-surface px-3" />
      <Button type="submit" disabled={pending}>اعتماد المحدد</Button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </form>
  );
}
