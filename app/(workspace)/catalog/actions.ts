"use server";

import { arabicError } from "@/lib/auth/errors";
import { previewImport, type ImportRow } from "@/lib/catalog/import-preview";
import { detectMedia } from "@/lib/catalog/media-bytes";
import { parseImportFile } from "@/lib/catalog/parse-sheet";
import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true; id?: string; activated?: boolean }
  | { ok: false; error: string };

const offlineError = "مشروع سوبربيز للتطوير غير مربوط بعد. أضف مفاتيح البيئة ثم أعد التشغيل.";
const offline: ActionResult = { ok: false, error: offlineError };

async function db() {
  return createClient();
}

export async function saveStoreAction(input: {
  id?: string;
  name: string;
  storeCode: string;
  address: string;
  phone: string;
  notes: string;
}) {
  if (!hasPublicEnv()) return offline;
  const supabase = await db();
  const row = {
    name: input.name.trim(),
    store_code: input.storeCode.trim().toUpperCase(),
    address: input.address.trim() || null,
    phone: input.phone.trim() || null,
    notes: input.notes.trim() || null,
  };
  const result = input.id
    ? await supabase.from("stores").update(row).eq("id", input.id)
    : await supabase.from("stores").insert(row);
  return result.error ? { ok: false as const, error: arabicError(result.error) } : { ok: true as const };
}

export async function setStoreActiveAction(id: string, active: boolean): Promise<ActionResult> {
  if (!hasPublicEnv()) return offline;
  const supabase = await db();
  const { error } = await supabase.from("stores").update({ is_active: active }).eq("id", id);
  if (error?.message.includes("store_has_stock")) {
    return { ok: false, error: "انقل المنتجات المتاحة أو المحجوزة قبل تعطيل المخزن" };
  }
  return error ? { ok: false, error: arabicError(error) } : { ok: true };
}

export async function moveStoreProductsAction(fromStore: string, toStore: string): Promise<ActionResult> {
  if (!hasPublicEnv()) return offline;
  const supabase = await db();
  const { error } = await supabase.rpc("move_store_products", { from_store: fromStore, to_store: toStore });
  return error ? { ok: false, error: arabicError(error) } : { ok: true };
}

export async function saveCategoryAction(input: { id?: string; name: string; parentId: string; sortOrder: number }) {
  if (!hasPublicEnv()) return offline;
  const supabase = await db();
  const slug = input.name.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40) || "category";
  const row = {
    name_ar: input.name.trim(),
    slug: input.id ? undefined : `${slug}-${Date.now().toString(36)}`,
    parent_id: input.parentId || null,
    sort_order: input.sortOrder,
  };
  const result = input.id
    ? await supabase.from("categories").update({ name_ar: row.name_ar, parent_id: row.parent_id, sort_order: row.sort_order }).eq("id", input.id)
    : await supabase.from("categories").insert(row);
  if (result.error?.message.includes("category_depth")) {
    return { ok: false as const, error: "الفئات مستويان فقط" };
  }
  return result.error ? { ok: false as const, error: arabicError(result.error) } : { ok: true as const };
}

export async function reorderCategoriesAction(ids: string[]) {
  if (!hasPublicEnv()) return offline;
  const supabase = await db();
  const { error } = await supabase.rpc("reorder_categories", { ids });
  return error ? { ok: false as const, error: arabicError(error) } : { ok: true as const };
}

export async function saveProductAction(input: {
  id?: string;
  name: string;
  description: string;
  categoryId: string;
  storeId: string;
  listPrice: number;
  minPrice: number | null;
  commissionType: "percentage" | "fixed";
  commissionValue: number;
  productType: "single" | "set";
  allowPieceSale: boolean;
}) {
  if (!hasPublicEnv()) return offline;
  const supabase = await db();
  const fields = {
    name: input.name.trim(),
    description: input.description.trim() || null,
    category_id: input.categoryId,
    store_id: input.storeId,
    list_price: input.listPrice,
    min_price: input.minPrice,
    commission_type: input.commissionType,
    commission_value: input.commissionValue,
    product_type: input.productType,
    allow_piece_sale: input.productType === "set" && input.allowPieceSale,
  };
  const result = input.id
    ? await supabase.from("products").update(fields).eq("id", input.id).select("id").single()
    : await supabase
        .from("products")
        .insert({ ...fields, status: "inactive" as const })
        .select("id")
        .single();
  return result.error ? { ok: false as const, error: arabicError(result.error) } : { ok: true as const, id: result.data.id as string };
}

export async function activateProductAction(id: string): Promise<ActionResult> {
  if (!hasPublicEnv()) return offline;
  const supabase = await db();
  const { error } = await supabase.rpc("activate_product", { product_id: id });
  return error ? { ok: false, error: arabicError(error) } : { ok: true };
}

export async function archiveProductAction(id: string): Promise<ActionResult> {
  if (!hasPublicEnv()) return offline;
  const supabase = await db();
  const { error } = await supabase.rpc("archive_product", { product_id: id });
  return error ? { ok: false, error: arabicError(error) } : { ok: true };
}

export async function deleteProductAction(id: string): Promise<ActionResult> {
  if (!hasPublicEnv()) return offline;
  const supabase = await db();
  const { data, error } = await supabase.rpc("delete_product", { product_id: id });
  if (error) return { ok: false, error: arabicError(error) };
  const paths = Array.isArray(data) ? (data as string[]) : [];
  if (paths.length > 0) {
    await supabase.storage.from("product-images").remove(paths);
    await supabase.storage.from("product-videos").remove(paths);
  }
  return { ok: true };
}

export async function deleteProductMediaAction(mediaId: string): Promise<ActionResult> {
  if (!hasPublicEnv()) return offline;
  const supabase = await db();
  const { data, error } = await supabase.rpc("delete_product_media", { media_id: mediaId });
  if (error) return { ok: false, error: arabicError(error) };
  const paths = Array.isArray(data) ? (data as string[]) : [];
  for (const path of paths) {
    await supabase.storage.from("product-images").remove([path]);
    await supabase.storage.from("product-videos").remove([path]);
  }
  return { ok: true };
}

export async function duplicateProductAction(id: string): Promise<ActionResult> {
  if (!hasPublicEnv()) return offline;
  const supabase = await db();
  const { data, error } = await supabase.rpc("duplicate_product", { product_id: id });
  return error ? { ok: false, error: arabicError(error) } : { ok: true, id: data as string };
}

export async function previewImportAction(file: number[]) {
  if (!hasPublicEnv()) return { ok: false as const, error: offlineError, valid: [], issues: [] };
  const rows = parseImportFile(new Uint8Array(file));
  const supabase = await db();
  const [{ data: categories }, { data: stores }] = await Promise.all([
    supabase.from("categories").select("name_ar, parent_id"),
    supabase.from("stores").select("name").eq("is_active", true),
  ]);
  const names = (categories ?? []).map((category) => category.name_ar as string);
  const preview = previewImport(rows, names, (stores ?? []).map((store) => store.name as string));
  return { ok: true as const, ...preview };
}

export async function commitImportAction(rows: ImportRow[], fileName: string) {
  if (!hasPublicEnv()) return offline;
  const supabase = await db();
  const { error } = await supabase.rpc("import_products", { rows, file_name: fileName });
  return error ? { ok: false as const, error: arabicError(error) } : { ok: true as const };
}

export async function prepareUploadAction(productId: string, mime: string, size: number) {
  if (!hasPublicEnv()) return { ok: false as const, error: offlineError };
  const kind = mime.startsWith("video/") ? "video" : "image";
  const allowedImage = ["image/jpeg", "image/png", "image/webp"];
  const allowedVideo = ["video/mp4", "video/webm", "video/quicktime"];
  if (kind === "image" && !allowedImage.includes(mime)) {
    return { ok: false as const, error: "نوع الملف غير مدعوم" };
  }
  if (kind === "video" && !allowedVideo.includes(mime)) {
    return { ok: false as const, error: "نوع الملف غير مدعوم" };
  }
  if (kind === "image" && size > 5 * 1024 * 1024) {
    return { ok: false as const, error: "حجم الصورة أكبر من 5 ميجا" };
  }
  if (kind === "video" && size > 50 * 1024 * 1024) {
    return { ok: false as const, error: "حجم الفيديو أكبر من 50 ميجا" };
  }
  const bucket = kind === "video" ? "product-videos" : "product-images";
  const path = `products/${productId}/${crypto.randomUUID()}`;
  const supabase = await db();
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) return { ok: false as const, error: "فشل تجهيز الرفع" };
  return { ok: true as const, bucket, path, token: data.token, kind, size };
}

export async function confirmUploadAction(input: {
  productId: string;
  bucket: string;
  path: string;
  mime: string;
  size: number;
  duration: number | null;
  posterPath: string | null;
}) {
  if (!hasPublicEnv()) return offline;
  const supabase = await db();
  const downloaded = await supabase.storage.from(input.bucket).download(input.path);
  if (downloaded.error || !downloaded.data) {
    return { ok: false as const, error: "تعذر التحقق من الملف" };
  }
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const detected = detectMedia(bytes, input.mime);
  const tooLarge = detected?.kind === "video" ? bytes.byteLength > 50 * 1024 * 1024 : bytes.byteLength > 5 * 1024 * 1024;
  if (!detected || tooLarge) {
    await supabase.storage.from(input.bucket).remove([input.path]);
    return { ok: false as const, error: "نوع الملف غير مدعوم" };
  }
  const { error } = await supabase.rpc("register_product_media", {
    product_id: input.productId,
    kind: detected.kind,
    storage_path: input.path,
    mime_type: detected.mime,
    size_bytes: bytes.byteLength,
    duration_seconds: input.duration,
    poster_path: input.posterPath,
  });
  if (error) {
    await supabase.storage.from(input.bucket).remove([input.path]);
    return { ok: false as const, error: arabicError(error) };
  }
  // First image auto-activates inactive products in register_product_media.
  return { ok: true as const, activated: detected.kind === "image" };
}
