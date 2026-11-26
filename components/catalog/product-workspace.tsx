"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  activateProductAction,
  archiveProductAction,
  deleteProductAction,
  deleteProductMediaAction,
  saveProductAction,
} from "@/app/(workspace)/catalog/actions";
import { completeSaleAction } from "@/app/(workspace)/sales/actions";
import { ProductTools } from "@/components/catalog/product-tools";
import { AddToBasket } from "@/components/sales/catalog-tools";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/format";

type Option = { id: string; label: string };
type MediaRow = {
  id: string;
  kind: "image" | "video";
  storage_path: string;
  is_primary: boolean;
  sort_order: number;
  url?: string | null;
};

export type ProductDetail = {
  id: string;
  name: string;
  description: string | null;
  code: string;
  public_code: string;
  status: "available" | "reserved" | "partially_sold" | "sold" | "inactive";
  list_price: number;
  min_price: number | null;
  commission_type: "percentage" | "fixed";
  commission_value: number;
  product_type: "single" | "set";
  allow_piece_sale: boolean;
  category_id: string;
  store_id: string;
};

const statusTone = {
  available: "available",
  reserved: "reserved",
  partially_sold: "partially_sold",
  sold: "sold",
  inactive: "inactive",
} as const;

export function ProductWorkspace({
  product,
  media,
  categories,
  stores,
}: {
  product: ProductDetail;
  media: MediaRow[];
  categories: Option[];
  stores: Option[];
}) {
  const t = useTranslations("product");
  const statusLabels = useTranslations("productStatus");
  const toast = useToast();
  const router = useRouter();
  const imageCount = useMemo(() => media.filter((item) => item.kind === "image").length, [media]);

  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? "");
  const [categoryId, setCategoryId] = useState(product.category_id);
  const [storeId, setStoreId] = useState(product.store_id);
  const [listPrice, setListPrice] = useState(String(product.list_price));
  const [minPrice, setMinPrice] = useState(product.min_price == null ? "" : String(product.min_price));
  const [commissionType, setCommissionType] = useState<"percentage" | "fixed">(product.commission_type);
  const [commissionValue, setCommissionValue] = useState(String(product.commission_value));
  const [productType, setProductType] = useState<"single" | "set">(product.product_type);
  const [allowPieceSale, setAllowPieceSale] = useState(product.allow_piece_sale);
  const [pending, setPending] = useState(false);
  const [salePrice, setSalePrice] = useState(String(product.list_price));
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("كاش");

  const canEdit = product.status === "available" || product.status === "inactive";
  const canSell = product.status === "available";
  const canActivate = product.status === "inactive" && imageCount > 0;

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) {
    setPending(true);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      toast.push({ title: result.error ?? "حدث خطأ، حاول مرة أخرى", tone: "danger" });
      return;
    }
    toast.push({ title: success, tone: "success" });
    after?.();
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/products" className="text-sm text-link">
          العودة للمنتجات
        </Link>
        <div className="flex flex-wrap gap-2">
          {canActivate ? (
            <Button
              disabled={pending}
              onClick={() => void run(() => activateProductAction(product.id), "تم تفعيل المنتج")}
            >
              تفعيل للبيع
            </Button>
          ) : null}
          {canEdit && product.status === "available" ? (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => void run(() => archiveProductAction(product.id), "تم تعطيل المنتج")}
            >
              تعطيل
            </Button>
          ) : null}
          {canEdit ? (
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("حذف المنتج نهائيًا؟ لا يمكن التراجع.")) return;
                void run(
                  () => deleteProductAction(product.id),
                  "تم حذف المنتج",
                  () => router.push("/products"),
                );
              }}
            >
              حذف
            </Button>
          ) : null}
        </div>
      </div>

      <section className="grid gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{product.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {product.public_code} · {product.code}
            </p>
          </div>
          <Badge tone={statusTone[product.status]}>{statusLabels(product.status)}</Badge>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <p>
            <span className="text-muted">سعر العرض: </span>
            <span className="font-semibold tabular-nums">{formatMoney(product.list_price)} ج.م</span>
          </p>
          <p>
            <span className="text-muted">أقل سعر: </span>
            <span className="tabular-nums">
              {product.min_price == null ? "—" : `${formatMoney(product.min_price)} ج.م`}
            </span>
          </p>
          <p>
            <span className="text-muted">النوع: </span>
            {product.product_type === "set" ? t("set") : t("single")}
          </p>
        </div>
        {product.status === "inactive" ? (
          <p className="text-sm text-danger">
            {imageCount === 0
              ? "المنتج غير مفعّل. ارفع صورة ثم اضغط «تفعيل للبيع»."
              : "المنتج جاهز للصورة. اضغط «تفعيل للبيع» ليظهر في الكتالوج."}
          </p>
        ) : null}
      </section>

      <section className="grid gap-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold">تعديل البيانات</h2>
        {!canEdit ? (
          <p className="text-sm text-muted">لا يمكن تعديل منتج محجوز أو مباع.</p>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () =>
                  saveProductAction({
                    id: product.id,
                    name,
                    description,
                    categoryId,
                    storeId,
                    listPrice: Number(listPrice),
                    minPrice: minPrice ? Number(minPrice) : null,
                    commissionType,
                    commissionValue: Number(commissionValue),
                    productType,
                    allowPieceSale,
                  }),
                "تم حفظ التعديلات",
              );
            }}
          >
            <label className="grid gap-1 text-sm font-medium">
              {t("name")}
              <Input value={name} onChange={(event) => setName(event.target.value)} required disabled={pending} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {t("description")}
              <Input value={description} onChange={(event) => setDescription(event.target.value)} disabled={pending} />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                {t("category")}
                <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={pending}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                {t("store")}
                <Select value={storeId} onChange={(event) => setStoreId(event.target.value)} disabled={pending}>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                {t("listPrice")}
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={listPrice}
                  onChange={(event) => setListPrice(event.target.value)}
                  required
                  disabled={pending}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                {t("minPrice")}
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={minPrice}
                  onChange={(event) => setMinPrice(event.target.value)}
                  disabled={pending}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                نوع العمولة
                <Select
                  value={commissionType}
                  onChange={(event) => setCommissionType(event.target.value as "percentage" | "fixed")}
                  disabled={pending}
                >
                  <option value="percentage">نسبة مئوية</option>
                  <option value="fixed">مبلغ ثابت</option>
                </Select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                قيمة العمولة
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={commissionValue}
                  onChange={(event) => setCommissionValue(event.target.value)}
                  disabled={pending}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                {t("type")}
                <Select
                  value={productType}
                  onChange={(event) => setProductType(event.target.value as "single" | "set")}
                  disabled={pending}
                >
                  <option value="single">{t("single")}</option>
                  <option value="set">{t("set")}</option>
                </Select>
              </label>
            </div>
            {productType === "set" ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allowPieceSale}
                  onChange={(event) => setAllowPieceSale(event.target.checked)}
                  disabled={pending}
                />
                {t("allowPieceSale")}
              </label>
            ) : null}
            <Button type="submit" disabled={pending}>
              حفظ التعديلات
            </Button>
          </form>
        )}
      </section>

      <ProductTools
        productId={product.id}
        media={media}
        onDeleteMedia={
          canEdit
            ? async (mediaId) => {
                await run(() => deleteProductMediaAction(mediaId), "تم حذف الملف");
              }
            : undefined
        }
      />

      <section className="grid gap-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold">البيع</h2>
        {!canSell ? (
          <p className="text-sm text-muted">
            {product.status === "inactive"
              ? "فعّل المنتج أولًا قبل إتمام البيع."
              : product.status === "reserved"
                ? "المنتج محجوز حاليًا."
                : "المنتج غير متاح للبيع."}
          </p>
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <AddToBasket
                line={{
                  publicCode: product.public_code,
                  name: product.name,
                  listPrice: Number(product.list_price),
                }}
              />
              <Button asChild variant="secondary">
                <Link href="/sales/cart">فتح سلة البيع</Link>
              </Button>
            </div>
            <form
              className="grid gap-3 rounded-xl border border-border bg-surface-2/40 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  () =>
                    completeSaleAction({
                      lines: [{ publicCode: product.public_code, price: Number(salePrice) }],
                      customerName,
                      customerPhone,
                      customerAddress,
                      notes,
                      paymentMethod,
                    }),
                  "تم تسجيل البيع",
                  () => router.push("/sales"),
                );
              }}
            >
              <p className="text-sm font-medium">بيع سريع لهذا المنتج</p>
              <label className="grid gap-1 text-sm font-medium">
                سعر البيع
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={salePrice}
                  onChange={(event) => setSalePrice(event.target.value)}
                  required
                  disabled={pending}
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">
                  اسم العميل
                  <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} required disabled={pending} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  هاتف العميل
                  <Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} required disabled={pending} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  العنوان
                  <Input value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)} disabled={pending} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  طريقة الدفع
                  <Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} disabled={pending}>
                    <option value="كاش">كاش</option>
                    <option value="تحويل">تحويل</option>
                    <option value="تقسيط">تقسيط</option>
                  </Select>
                </label>
              </div>
              <label className="grid gap-1 text-sm font-medium">
                ملاحظات
                <Input value={notes} onChange={(event) => setNotes(event.target.value)} disabled={pending} />
              </label>
              <Button type="submit" disabled={pending}>
                إتمام البيع
              </Button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
