export type CommissionType = "percentage" | "fixed";

export function previewCommission(price: number, type: CommissionType, value: number) {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(value) || value < 0) return 0;
  if (type === "percentage") {
    const bounded = Math.min(value, 100);
    return Math.round((price * bounded) / 100 * 100) / 100;
  }
  return Math.min(value, price);
}
