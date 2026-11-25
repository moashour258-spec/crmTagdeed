"use client";

import { useState, useTransition } from "react";
import { requestCorrectionAction } from "@/app/(workspace)/sales/actions";
import { Button } from "@/components/ui/button";

export function CorrectionForm({ saleId }: { saleId: string }) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const note = String(new FormData(event.currentTarget).get("note") ?? "");
        start(async () => {
          const result = await requestCorrectionAction(saleId, note);
          setMessage(result.ok ? "أُرسل طلب التصحيح" : result.error);
        });
      }}
    >
      <input name="note" required placeholder="ما الذي يحتاج تصحيحًا؟" className="h-11 min-w-48 flex-1 rounded-xl border border-border bg-surface px-3" />
      <Button type="submit" variant="secondary" disabled={pending}>اطلب تصحيحًا</Button>
      {message ? <span className="text-sm text-muted">{message}</span> : null}
    </form>
  );
}
