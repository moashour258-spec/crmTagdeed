import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { reportRange } from "@/lib/reports/range";
import { createClient } from "@/lib/supabase/server";

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const pageSize = 20;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  if (!hasPublicEnv()) {
    return <EmptyState title="سجل التدقيق" body="اربط مشروع سوبربيز للتطوير لقراءة السجل." />;
  }
  const action = one(params.action);
  const entity = one(params.entity);
  const actor = one(params.actor);
  const page = Math.max(1, Number(one(params.page)) || 1);
  const range = reportRange(one(params.from) || one(params.to) ? "custom" : "all", one(params.from), one(params.to));
  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("id, created_at, actor_id, action, entity_type, entity_id, visibility, old_values, new_values, reason", { count: "exact" })
    .order("created_at", { ascending: false });
  if (action) query = query.ilike("action", `%${action}%`);
  if (entity) query = query.eq("entity_type", entity);
  if (actor) query = query.eq("actor_id", actor);
  if (range.from) query = query.gte("created_at", range.from);
  if (range.to) query = query.lt("created_at", range.to);
  const { data, count } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  const rows = data ?? [];
  const actorIds = [...new Set(rows.map((row) => row.actor_id).filter(Boolean))] as string[];
  const { data: people } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] };
  const names = new Map((people ?? []).map((person) => [person.id, person.full_name || person.email]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const queryString = new URLSearchParams();
  if (action) queryString.set("action", action);
  if (entity) queryString.set("entity", entity);
  if (actor) queryString.set("actor", actor);
  if (one(params.from)) queryString.set("from", one(params.from));
  if (one(params.to)) queryString.set("to", one(params.to));

  return (
    <div className="grid gap-4">
      <form method="get" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-1 text-sm">
          الإجراء
          <input name="action" defaultValue={action} className="h-11 rounded-xl border border-border bg-surface px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          الكيان
          <input name="entity" defaultValue={entity} className="h-11 rounded-xl border border-border bg-surface px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          من
          <input name="from" type="date" defaultValue={one(params.from)} className="h-11 rounded-xl border border-border bg-surface px-3" />
        </label>
        <label className="grid gap-1 text-sm">
          إلى
          <input name="to" type="date" defaultValue={one(params.to)} className="h-11 rounded-xl border border-border bg-surface px-3" />
        </label>
        <button type="submit" className="h-11 rounded-[10px] bg-primary px-4 text-sm font-semibold text-on-primary">تصفية</button>
      </form>
      <p className="text-sm text-muted">المدير يرى الأحداث التشغيلية. المدير العام يرى أحداث الإدارة والأمان أيضًا.</p>
      {rows.length === 0 ? <EmptyState title="لا توجد أحداث" body="غيّر التصفية أو انتظر عملية جديدة." /> : null}
      {rows.map((row) => (
        <article key={row.id} className="grid gap-2 rounded-xl border border-border bg-surface p-4">
          <h2 className="font-semibold">{row.action}</h2>
          <p className="text-sm text-muted">
            {formatDateTime(new Date(row.created_at))} · {names.get(row.actor_id) ?? "النظام"} · {row.entity_type}
            {row.visibility === "restricted" ? " · مقيّد" : ""}
          </p>
          {row.reason ? <p className="text-sm">السبب: {row.reason}</p> : null}
          <div className="grid gap-2 md:grid-cols-2">
            <pre className="overflow-auto rounded-xl bg-surface-2 p-3 text-xs">{JSON.stringify(row.old_values ?? {}, null, 2)}</pre>
            <pre className="overflow-auto rounded-xl bg-surface-2 p-3 text-xs">{JSON.stringify(row.new_values ?? {}, null, 2)}</pre>
          </div>
        </article>
      ))}
      <div className="flex items-center justify-between text-sm">
        <span className="tabular-nums">{page} / {pages}</span>
        <div className="flex gap-3">
          {page > 1 ? <Link href={`/audit?${new URLSearchParams([...queryString, ["page", String(page - 1)]])}`} className="underline">السابق</Link> : null}
          {page < pages ? <Link href={`/audit?${new URLSearchParams([...queryString, ["page", String(page + 1)]])}`} className="underline">التالي</Link> : null}
        </div>
      </div>
    </div>
  );
}
