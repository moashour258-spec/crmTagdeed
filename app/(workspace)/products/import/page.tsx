"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { commitImportAction, previewImportAction } from "@/app/(workspace)/catalog/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { ImportIssue, ImportRow } from "@/lib/catalog/import-preview";

export default function ImportPage() {
  const toast = useToast();
  const router = useRouter();
  const [valid, setValid] = useState<ImportRow[]>([]);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [fileName, setFileName] = useState("import.csv");

  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-semibold">استيراد المنتجات</h2>
      <input
        type="file"
        accept=".csv,.xlsx"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > 2 * 1024 * 1024) {
            toast.push({ title: "الملف أكبر من 2 ميجا", tone: "danger" });
            return;
          }
          setFileName(file.name);
          const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
          const preview = await previewImportAction(bytes);
          if (!preview.ok) {
            toast.push({ title: preview.error, tone: "danger" });
            return;
          }
          setValid(preview.valid);
          setIssues(preview.issues);
        }}
      />
      <p className="text-sm text-muted">صفوف صحيحة: {valid.length}. صفوف بها ملاحظات: {issues.length}.</p>
      <ul className="grid gap-1 text-sm">
        {issues.map((issue) => <li key={`${issue.row}-${issue.reason}`}>صف {issue.row}: {issue.reason}</li>)}
      </ul>
      <Button
        disabled={valid.length === 0}
        onClick={async () => {
          const result = await commitImportAction(valid, fileName);
          if (!result.ok) toast.push({ title: result.error, tone: "danger" });
          else router.push("/products");
        }}
      >
        حفظ الصفوف الصحيحة
      </Button>
    </div>
  );
}
