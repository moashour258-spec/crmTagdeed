"use client";

import { useState, useTransition } from "react";
import { decidePriceAction } from "@/app/(workspace)/sales/actions";
import { Button } from "@/components/ui/button";

export function DecisionForm({ requestId, requested }: { requestId: string; requested: number }) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await decidePriceAction(
            requestId,
            form.get("approve") === "yes",
            Number(form.get("price")),
            String(form.get("note") ?? ""),
          );
          setMessage(result.ok ? "تم حفظ القرار" : result.error);
        });
      }}
    >
      <input name="price" type="number" min="1" step="1" defaultValue={requested} className="h-11 w-32 rounded-xl border border-border bg-surface px-3" />
      <input name="note" placeholder="ملاحظة" className="h-11 min-w-36 flex-1 rounded-xl border border-border bg-surface px-3" />
      <Button type="submit" name="approve" value="yes" disabled={pending}>موافقة</Button>
      <Button type="submit" name="approve" value="no" variant="secondary" disabled={pending}>رفض</Button>
      {message ? <span className="text-sm text-muted">{message}</span> : null}
    </form>
  );
}
