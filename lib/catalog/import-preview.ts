import { previewCommission, type CommissionType } from "@/lib/catalog/commission";

export type ImportRow = {
  name?: string;
  category?: string;
  store?: string;
  list_price?: number | string;
  min_price?: number | string | null;
  commission_type?: string;
  commission_value?: number | string | null;
  description?: string;
  product_type?: string;
};

export type ImportIssue = { row: number; reason: string };
export type ImportPreview = { valid: ImportRow[]; issues: ImportIssue[] };

const types = new Set(["percentage", "fixed"]);
const productTypes = new Set(["single", "set"]);

export function previewImport(
  rows: ImportRow[],
  categories: string[],
  stores: string[],
): ImportPreview {
  const valid: ImportRow[] = [];
  const issues: ImportIssue[] = [];
  if (rows.length > 500) {
    return { valid: [], issues: [{ row: 0, reason: "الحد الأقصى 500 صف" }] };
  }
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const name = String(row.name ?? "").trim();
    const category = String(row.category ?? "").trim();
    const store = String(row.store ?? "").trim();
    const price = Number(row.list_price);
    const minPrice = row.min_price === "" || row.min_price == null ? null : Number(row.min_price);
    const commissionType = String(row.commission_type || "percentage");
    const commissionValue = row.commission_value === "" || row.commission_value == null ? 0 : Number(row.commission_value);
    const productType = String(row.product_type || "single");
    if (!name) {
      issues.push({ row: rowNumber, reason: "الاسم مطلوب" });
      return;
    }
    if (!categories.includes(category)) {
      issues.push({ row: rowNumber, reason: "الفئة غير معروفة" });
      return;
    }
    if (!stores.includes(store)) {
      issues.push({ row: rowNumber, reason: "المخزن غير معروف" });
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      issues.push({ row: rowNumber, reason: "سعر العرض غير صحيح" });
      return;
    }
    if (minPrice != null && (!Number.isFinite(minPrice) || minPrice <= 0 || minPrice > price)) {
      issues.push({ row: rowNumber, reason: "أقل سعر غير صحيح" });
      return;
    }
    if (!types.has(commissionType) || !Number.isFinite(commissionValue) || commissionValue < 0) {
      issues.push({ row: rowNumber, reason: "العمولة غير صحيحة" });
      return;
    }
    if (commissionType === "percentage" && commissionValue > 100) {
      issues.push({ row: rowNumber, reason: "نسبة العمولة أكبر من 100" });
      return;
    }
    if (!productTypes.has(productType)) {
      issues.push({ row: rowNumber, reason: "نوع المنتج غير صحيح" });
      return;
    }
    valid.push({
      name,
      category,
      store,
      list_price: price,
      min_price: minPrice,
      commission_type: commissionType,
      commission_value: commissionValue,
      description: row.description ?? "",
      product_type: productType,
    });
  });
  return { valid, issues };
}

export function exampleEarning(price: number, type: CommissionType, value: number) {
  return previewCommission(price, type, value);
}
