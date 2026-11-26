import { getTranslations } from "next-intl/server";
import { Bars } from "@/components/dashboard/bars";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { arabicError } from "@/lib/auth/errors";
import { getGate } from "@/lib/auth/session";
import { hasPublicEnv } from "@/lib/env";
import { formatDateTime, formatMoney } from "@/lib/format";
import { reportRange } from "@/lib/reports/range";
import { labelStatus, parseAdminStats, parseSalesStats } from "@/lib/reports/stats";
import { createClient } from "@/lib/supabase/server";

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const field = "h-11 w-full rounded-xl border border-border bg-surface px-3";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const t = await getTranslations("dashboard");
  if (!hasPublicEnv()) {
    return <EmptyState title={t("revenue")} body="اربط مشروع سوبربيز للتطوير لعرض الأرقام من قاعدة البيانات." />;
  }
  const gate = await getGate();
  const preset = one(params.preset) || "month";
  const range = reportRange(preset, one(params.from), one(params.to));
  const supabase = await createClient();

  if (gate?.role === "sales") {
    const [{ data, error }, { count: availableCount }] = await Promise.all([
      supabase.rpc("fn_my_dashboard", { p_from: range.from, p_to: range.to }),
      supabase.from("v_catalog").select("public_code", { count: "exact", head: true }),
    ]);
    if (error) return <EmptyState title="أرباحي" body={arabicError(error)} />;
    const stats = parseSalesStats(data);
    return (
      <div className="grid gap-6">
        <a
          href="/sales/catalog"
          className="rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2"
        >
          <p className="font-semibold">المنتجات المتاحة للبيع</p>
          <p className="mt-1 text-sm text-muted">
            {(availableCount ?? 0) > 0
              ? `فيه ${availableCount} منتج جاهز — اضغط للعرض والحجز أو الإضافة للسلة.`
              : "لا توجد منتجات متاحة الآن. لما المدير يفعّل منتجًا هيظهر هنا."}
          </p>
        </a>
        <FilterForm preset={preset} from={one(params.from)} to={one(params.to)} />
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="قطع مباعة" value={String(stats.productsSold)} />
          <StatCard label={t("revenue")} value={formatMoney(stats.revenue)} />
          <StatCard label="العمولة" value={formatMoney(stats.earnedCommission)} />
          <StatCard label={t("totalBonuses")} value={formatMoney(stats.earnedBonus)} />
          <StatCard label="قيد الاعتماد" value={formatMoney(stats.pending)} />
          <StatCard label="معتمدة" value={formatMoney(stats.approved)} />
          <StatCard label="مصروفة" value={formatMoney(stats.paid)} />
        </section>
        <section className="grid gap-2">
          <h2 className="font-semibold">{t("salesOverTime")}</h2>
          <Bars rows={stats.series} empty="لا توجد مبيعات في هذه الفترة." />
        </section>
        <section className="grid gap-2">
          <h2 className="font-semibold">آخر الفواتير</h2>
          {stats.recent.length === 0 ? <p className="text-sm text-muted">لا توجد فواتير مكتملة في هذه الفترة.</p> : null}
          {stats.recent.map((sale) => (
            <p key={sale.invoice} className="text-sm">
              {sale.invoice} · {sale.customer} · {formatMoney(sale.total)}
              {sale.soldAt ? ` · ${formatDateTime(new Date(sale.soldAt))}` : ""}
            </p>
          ))}
        </section>
      </div>
    );
  }

  const storeId = one(params.store);
  const employeeId = one(params.employee);
  const categoryId = one(params.category);
  const [{ data, error }, { data: stores }, { data: people }, { data: categories }] = await Promise.all([
    supabase.rpc("admin_dashboard_stats", {
      p_from: range.from,
      p_to: range.to,
      store_ids: storeId ? [storeId] : null,
      employee_ids: employeeId ? [employeeId] : null,
      category_ids: categoryId ? [categoryId] : null,
    }),
    supabase.from("stores").select("id, name").order("name"),
    supabase.from("user_roles").select("user_id, role").eq("role", "sales"),
    supabase.from("categories").select("id, name_ar").eq("is_active", true).order("sort_order"),
  ]);
  if (error) return <EmptyState title={t("revenue")} body={arabicError(error)} />;
  const sellerIds = (people ?? []).map((person) => person.user_id);
  const { data: sellers } = sellerIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", sellerIds)
    : { data: [] };
  const stats = parseAdminStats(data);
  const cards = [
    ["totalProducts", String(stats.kpis.totalProducts)],
    ["availableProducts", String(stats.kpis.availableProducts)],
    ["reservedProducts", String(stats.kpis.reservedProducts)],
    ["soldProducts", String(stats.kpis.soldProducts)],
    ["totalStores", String(stats.kpis.stores)],
    ["totalAdmins", String(stats.kpis.admins)],
    ["totalSalesUsers", String(stats.kpis.salesEmployees)],
    ["completedSales", String(stats.kpis.completedSales)],
    ["revenue", formatMoney(stats.kpis.revenue)],
    ["totalCommissions", formatMoney(stats.kpis.totalCommissions)],
    ["totalBonuses", formatMoney(stats.kpis.totalBonuses)],
  ] as const;

  return (
    <div className="grid gap-6">
      <FilterForm
        preset={preset}
        from={one(params.from)}
        to={one(params.to)}
        storeId={storeId}
        employeeId={employeeId}
        categoryId={categoryId}
        stores={stores ?? []}
        sellers={(sellers ?? []).map((seller) => ({ id: seller.id, label: seller.full_name || seller.email }))}
        categories={categories ?? []}
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([key, value]) => <StatCard key={key} label={t(key)} value={value} />)}
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <Chart title={t("salesOverTime")} rows={stats.salesOverTime} />
        <Chart title={t("salesByStore")} rows={stats.byStore} />
        <Chart title={t("salesByCategory")} rows={stats.byCategory} />
        <Chart title={t("topProducts")} rows={stats.topProducts} />
        <Chart title={t("commissionDistribution")} rows={stats.distribution.map((row) => ({ ...row, label: labelStatus(row.label) }))} />
        <section className="grid gap-2">
          <h2 className="font-semibold">{t("employeePerformance")}</h2>
          {stats.employees.length === 0 ? <p className="text-sm text-muted">لا توجد مبيعات في هذه الفترة.</p> : null}
          {stats.employees.map((employee) => (
            <p key={employee.label} className="text-sm">
              {employee.label} · {employee.sales} فاتورة · {formatMoney(employee.revenue)} · عمولة {formatMoney(employee.commission)}
            </p>
          ))}
        </section>
      </section>
    </div>
  );
}

function Chart({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  return (
    <section className="grid gap-2">
      <h2 className="font-semibold">{title}</h2>
      <Bars rows={rows} empty="لا توجد بيانات في هذه الفترة." />
    </section>
  );
}

function FilterForm({
  preset,
  from,
  to,
  storeId = "",
  employeeId = "",
  categoryId = "",
  stores = [],
  sellers = [],
  categories = [],
}: {
  preset: string;
  from: string;
  to: string;
  storeId?: string;
  employeeId?: string;
  categoryId?: string;
  stores?: { id: string; name: string }[];
  sellers?: { id: string; label: string }[];
  categories?: { id: string; name_ar: string }[];
}) {
  return (
    <form method="get" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="grid gap-1 text-sm">
        الفترة
        <select name="preset" defaultValue={preset} className={field}>
          <option value="month">هذا الشهر</option>
          <option value="today">اليوم</option>
          <option value="year">هذه السنة</option>
          <option value="all">كل الفترات</option>
          <option value="custom">من وإلى</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        من
        <input name="from" type="date" defaultValue={from} className={field} />
      </label>
      <label className="grid gap-1 text-sm">
        إلى
        <input name="to" type="date" defaultValue={to} className={field} />
      </label>
      {stores.length > 0 ? (
        <label className="grid gap-1 text-sm">
          المخزن
          <select name="store" defaultValue={storeId} className={field}>
            <option value="">كل المخازن</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </label>
      ) : null}
      {sellers.length > 0 ? (
        <label className="grid gap-1 text-sm">
          الموظف
          <select name="employee" defaultValue={employeeId} className={field}>
            <option value="">كل الموظفين</option>
            {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.label}</option>)}
          </select>
        </label>
      ) : null}
      {categories.length > 0 ? (
        <label className="grid gap-1 text-sm">
          الفئة
          <select name="category" defaultValue={categoryId} className={field}>
            <option value="">كل الفئات</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name_ar}</option>)}
          </select>
        </label>
      ) : null}
      <button type="submit" className="h-11 self-end rounded-[10px] bg-primary px-4 text-sm font-semibold text-on-primary">عرض</button>
    </form>
  );
}
