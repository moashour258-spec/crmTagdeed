import { getTranslations } from "next-intl/server";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";

const stats = [
  "totalProducts",
  "availableProducts",
  "reservedProducts",
  "soldProducts",
  "completedSales",
  "revenue",
] as const;

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const common = await getTranslations("common");
  return (
    <div className="grid gap-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((key) => (
          <StatCard key={key} label={t(key)} value="—" />
        ))}
      </section>
      <DataTable
        columns={[
          { key: "invoice", header: "الفاتورة", cell: () => "" },
          { key: "customer", header: "العميل", cell: () => "" },
          { key: "total", header: "الإجمالي", cell: () => "" },
        ]}
        rows={[]}
        getRowKey={() => "empty"}
        page={1}
        pageSize={20}
        total={0}
        emptyTitle={common("empty")}
        emptyBody="ستظهر المبيعات هنا بعد تسجيل أول بيعة."
      />
    </div>
  );
}
