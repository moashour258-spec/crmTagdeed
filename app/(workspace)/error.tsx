"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      title="تعذر تحميل الصفحة"
      body="حاول مرة أخرى. لو استمرت المشكلة، راجع الاتصال بمشروع التطوير."
      action={<Button type="button" onClick={reset}>إعادة المحاولة</Button>}
    />
  );
}
