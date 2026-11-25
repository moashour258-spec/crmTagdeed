export type Bar = { label: string; value: number };

export type AdminStats = {
  kpis: {
    totalProducts: number;
    availableProducts: number;
    reservedProducts: number;
    soldProducts: number;
    stores: number;
    admins: number;
    salesEmployees: number;
    completedSales: number;
    revenue: number;
    totalCommissions: number;
    totalBonuses: number;
  };
  salesOverTime: Bar[];
  byStore: Bar[];
  byCategory: Bar[];
  topProducts: Bar[];
  employees: { label: string; sales: number; revenue: number; commission: number }[];
  distribution: Bar[];
};

export type SalesStats = {
  productsSold: number;
  revenue: number;
  earnedCommission: number;
  earnedBonus: number;
  pending: number;
  approved: number;
  paid: number;
  recent: { invoice: string; customer: string; total: number; soldAt: string }[];
  series: Bar[];
};

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bars(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const item = row as { name?: string; day?: string; status?: string; total?: unknown };
    return { label: String(item.name ?? item.day ?? item.status ?? ""), value: num(item.total) };
  });
}

export function parseAdminStats(value: unknown): AdminStats {
  const data = (value ?? {}) as {
    kpis?: Record<string, unknown>;
    sales_over_time?: unknown;
    by_store?: unknown;
    by_category?: unknown;
    top_products?: unknown;
    employee_performance?: unknown;
    commission_distribution?: unknown;
  };
  const kpis = data.kpis ?? {};
  const employees = Array.isArray(data.employee_performance) ? data.employee_performance : [];
  return {
    kpis: {
      totalProducts: num(kpis.total_products),
      availableProducts: num(kpis.available_products),
      reservedProducts: num(kpis.reserved_products),
      soldProducts: num(kpis.sold_products),
      stores: num(kpis.stores),
      admins: num(kpis.admins),
      salesEmployees: num(kpis.sales_employees),
      completedSales: num(kpis.completed_sales),
      revenue: num(kpis.revenue),
      totalCommissions: num(kpis.total_commissions),
      totalBonuses: num(kpis.total_bonuses),
    },
    salesOverTime: bars(data.sales_over_time),
    byStore: bars(data.by_store),
    byCategory: bars(data.by_category),
    topProducts: bars(data.top_products),
    employees: employees.map((row) => {
      const item = row as { name?: string; sales?: unknown; revenue?: unknown; commission?: unknown };
      return {
        label: String(item.name ?? ""),
        sales: num(item.sales),
        revenue: num(item.revenue),
        commission: num(item.commission),
      };
    }),
    distribution: bars(data.commission_distribution),
  };
}

export function parseSalesStats(value: unknown): SalesStats {
  const data = (value ?? {}) as Record<string, unknown>;
  const recent = Array.isArray(data.recent) ? data.recent : [];
  return {
    productsSold: num(data.products_sold),
    revenue: num(data.revenue),
    earnedCommission: num(data.earned_commission),
    earnedBonus: num(data.earned_bonus),
    pending: num(data.pending),
    approved: num(data.approved),
    paid: num(data.paid),
    recent: recent.map((row) => {
      const item = row as { invoice?: string; customer?: string; total?: unknown; sold_at?: string };
      return {
        invoice: String(item.invoice ?? ""),
        customer: String(item.customer ?? ""),
        total: num(item.total),
        soldAt: String(item.sold_at ?? ""),
      };
    }),
    series: bars(data.series),
  };
}

const statusLabels: Record<string, string> = {
  pending: "قيد الاعتماد",
  approved: "معتمدة",
  paid: "مصروفة",
  cancelled: "ملغاة",
};

export function labelStatus(status: string) {
  return statusLabels[status] ?? status;
}
