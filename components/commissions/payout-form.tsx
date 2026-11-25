"use client";

import { useState, useTransition } from "react";
import { payoutAction } from "@/app/(workspace)/commissions/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format";

export type PayoutEmployee = {
  userId: string;
  name: string;
  net: number;
  count: number;
};

export function PayoutForm({ employees }: { employees: PayoutEmployee[] }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<{ userId: string; paidAt: string; method: string; note: string; name: string; net: number } | null>(null);

  if (employees.length === 0) return <p className="text-sm text-muted">لا توجد عمولات معتمدة بانتظار الصرف.</p>;

  return (
    <>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const userId = String(form.get("userId"));
          const employee = employees.find((item) => item.userId === userId);
          if (!employee) return;
          setDraft({
            userId,
            paidAt: String(form.get("paidAt")),
            method: String(form.get("method")),
            note: String(form.get("note") ?? ""),
            name: employee.name,
            net: employee.net,
          });
          setOpen(true);
        }}
      >
        <label className="grid gap-1 text-sm">
          الموظف
          <select name="userId" className="h-11 rounded-xl border border-border bg-surface px-3" required>
            {employees.map((employee) => (
              <option key={employee.userId} value={employee.userId}>
                {employee.name} · {formatMoney(employee.net)} · {employee.count}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="paidAt" type="date" required className="h-11 rounded-xl border border-border bg-surface px-3" />
          <select name="method" className="h-11 rounded-xl border border-border bg-surface px-3">
            <option>كاش</option>
            <option>تحويل</option>
          </select>
        </div>
        <input name="note" placeholder="ملاحظة" className="h-11 rounded-xl border border-border bg-surface px-3" />
        <Button type="submit">مراجعة الصرف</Button>
        {message ? <p className="text-sm text-muted">{message}</p> : null}
      </form>
      <Dialog
        open={open}
        title="تأكيد الصرف"
        onClose={() => setOpen(false)}
        footer={
          <Button
            type="button"
            disabled={pending || !draft}
            onClick={() => {
              if (!draft) return;
              start(async () => {
                const result = await payoutAction(draft);
                setMessage(result.ok ? "تم تسجيل الصرف" : result.error);
                setOpen(false);
              });
            }}
          >
            صرف {draft ? formatMoney(draft.net) : ""}
          </Button>
        }
      >
        <p className="text-sm">
          سيُصرف صافي عمولات {draft?.name} المعتمدة، بما فيها أي استرداد لم يُخصم بعد. الصفوف التي تُصرف الآن لا تدخل صرفاً ثانياً.
        </p>
      </Dialog>
    </>
  );
}
