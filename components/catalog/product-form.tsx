"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveProductAction } from "@/app/(workspace)/catalog/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { previewCommission } from "@/lib/catalog/commission";
import { formatMoney } from "@/lib/format";

type Option = { id: string; label: string };

export function ProductForm({
  categories,
  stores,
}: {
  categories: Option[];
  stores: Option[];
}) {
  const t = useTranslations("product");
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [listPrice, setListPrice] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [commissionType, setCommissionType] = useState<"percentage" | "fixed">("percentage");
  const [commissionValue, setCommissionValue] = useState("5");
  const [productType, setProductType] = useState<"single" | "set">("single");
  const [allowPieceSale, setAllowPieceSale] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const example = useMemo(
    () => previewCommission(Number(listPrice || 0), commissionType, Number(commissionValue || 0)),
    [listPrice, commissionType, commissionValue],
  );

  if (stores.length === 0) {
    return (
      <div className="grid gap-3 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-danger">لازم تضيف مخزنًا نشطًا قبل حفظ أي منتج.</p>
        <Button asChild>
          <Link href="/stores">إضافة مخزن</Link>
        </Button>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="grid gap-3 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-danger">لازم تضيف فئة فرعية قبل حفظ أي منتج.</p>
        <Button asChild>
          <Link href="/categories">إدارة الفئات</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-3 rounded-xl border border-border bg-surface p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        if (!storeId) {
          setError("اختر المخزن");
          return;
        }
        if (!categoryId) {
          setError("اختر الفئة");
          return;
        }
        if (!name.trim()) {
          setError("اكتب اسم المنتج");
          return;
        }
        const price = Number(listPrice);
        if (!Number.isFinite(price) || price <= 0) {
          setError("سعر العرض غير صحيح");
          return;
        }
        setPending(true);
        const result = await saveProductAction({
          name,
          description,
          categoryId,
          storeId,
          listPrice: price,
          minPrice: minPrice ? Number(minPrice) : null,
          commissionType,
          commissionValue: Number(commissionValue),
          productType,
          allowPieceSale,
        });
        setPending(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/products/${result.id}`);
        router.refresh();
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
      <p className="text-sm text-muted">
        عمولة تقديرية على سعر العرض: {formatMoney(example)} ج.م. بعد الحفظ ارفع صورة أو فيديو لتفعيل المنتج.
      </p>
      {error ? (
        <p role="alert" className="rounded-[10px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "جاري الحفظ…" : "حفظ المنتج"}
      </Button>
    </form>
  );
}
