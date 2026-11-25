import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";

const exports = [
  ["sales", "المبيعات"],
  ["payables", "مستحقات العمولات"],
  ["inventory", "المخزون"],
  ["audit", "سجل التدقيق"],
  ["overdue", "أقساط متأخرة"],
  ["late", "تسليم متأخر"],
] as const;

export default function ReportsPage() {
  if (!hasPublicEnv()) {
    return <EmptyState title="التقارير" body="اربط مشروع سوبربيز للتطوير لتصدير التقارير." />;
  }
  return (
    <form action="/reports/export" method="get" className="grid max-w-xl gap-3">
      <p className="text-sm text-muted">الملف CSV بترميز UTF-8، ويفتح في إكسل مع النص العربي. الخلايا التي تبدأ بعلامة معادلة تُحفظ كنص.</p>
      <label className="grid gap-1 text-sm">
        من
        <input name="from" type="date" className="h-11 rounded-xl border border-border bg-surface px-3" />
      </label>
      <label className="grid gap-1 text-sm">
        إلى
        <input name="to" type="date" className="h-11 rounded-xl border border-border bg-surface px-3" />
      </label>
      <div className="flex flex-wrap gap-2">
        {exports.map(([kind, label]) => (
          <button key={kind} name="kind" value={kind} className="h-11 rounded-[10px] bg-primary px-4 text-sm font-semibold text-on-primary">
            {label}
          </button>
        ))}
      </div>
    </form>
  );
}
