import * as XLSX from "xlsx";
import type { ImportRow } from "@/lib/catalog/import-preview";

const headerMap: Record<string, keyof ImportRow> = {
  name: "name",
  category: "category",
  store: "store",
  list_price: "list_price",
  min_price: "min_price",
  commission_type: "commission_type",
  commission_value: "commission_value",
  description: "description",
  product_type: "product_type",
};

export function parseImportFile(bytes: Uint8Array) {
  if (bytes.byteLength > 2 * 1024 * 1024) {
    throw new Error("file_too_large");
  }
  const book = XLSX.read(bytes, { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rows.slice(0, 501).map((row) => {
    const mapped: ImportRow = {};
    for (const [key, value] of Object.entries(row)) {
      const field = headerMap[key.trim().toLowerCase()];
      if (!field) continue;
      (mapped as Record<string, string | number | null>)[field] = typeof value === "number" ? value : String(value);
    }
    return mapped;
  });
}

export function templateWorkbook(categories: string[], stores: string[]) {
  const book = XLSX.utils.book_new();
  const products = XLSX.utils.aoa_to_sheet([
    ["name", "category", "store", "list_price", "min_price", "commission_type", "commission_value", "description", "product_type"],
  ]);
  const reference = XLSX.utils.aoa_to_sheet([
    ["categories", "stores"],
    ...Array.from({ length: Math.max(categories.length, stores.length) }, (_, index) => [
      categories[index] ?? "",
      stores[index] ?? "",
    ]),
  ]);
  XLSX.utils.book_append_sheet(book, products, "products");
  XLSX.utils.book_append_sheet(book, reference, "reference");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
