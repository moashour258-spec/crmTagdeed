"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { saveProductAction } from "@/app/(workspace)/catalog/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
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
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [listPrice, setListPrice] = useState("10000");
  const [minPrice, setMinPrice] = useState("");
  const [commissionType, setCommissionType] = useState<"percentage" | "fixed">("percentage");
  const [commissionValue, setCommissionValue] = useState("5");
  const [productType, setProductType] = useState<"single" | "set">("single");
  const [allowPieceSale, setAllowPieceSale] = useState(false);
  const example = useMemo(
    () => previewCommission(Number(listPrice), commissionType, Number(commissionValue)),
    [listPrice, commissionType, commissionValue],
  );

  return (
    <form
      className="grid gap-3 rounded-xl border border-border bg-surface p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await saveProductAction({
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
        });
        if (!result.ok) {
          toast.push({ title: result.error, tone: "danger" });
          return;
        }
        router.push(`/products/${result.id}`);
        router.refresh();
      }}
    >
      <Input placeholder={t("name")} value={name} onChange={(event) => setName(event.target.value)} required />
      <Input placeholder={t("description")} value={description} onChange={(event) => setDescription(event.target.value)} />
      <div className="grid gap-3 md:grid-cols-2">
        <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
        </Select>
        <Select value={storeId} onChange={(event) => setStoreId(event.target.value)}>
          {stores.map((store) => <option key={store.id} value={store.id}>{store.label}</option>)}
        </Select>
        <Input type="number" min="1" step="0.01" value={listPrice} onChange={(event) => setListPrice(event.target.value)} required />
        <Input type="number" min="0" step="0.01" placeholder={t("minPrice")} value={minPrice} onChange={(event) => setMinPrice(event.target.value)} />
        <Select value={commissionType} onChange={(event) => setCommissionType(event.target.value as "percentage" | "fixed")}>
          <option value="percentage">نسبة مئوية</option>
          <option value="fixed">مبلغ ثابت</option>
        </Select>
        <Input type="number" min="0" step="0.01" value={commissionValue} onChange={(event) => setCommissionValue(event.target.value)} />
        <Select value={productType} onChange={(event) => setProductType(event.target.value as "single" | "set")}>
          <option value="single">{t("single")}</option>
          <option value="set">{t("set")}</option>
        </Select>
      </div>
      {productType === "set" ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allowPieceSale} onChange={(event) => setAllowPieceSale(event.target.checked)} />
          {t("allowPieceSale")}
        </label>
      ) : null}
      <p className="text-sm text-muted">عمولة تقديرية على سعر العرض: {formatMoney(example)} ج.م. المنتج يُحفظ غير مفعّل حتى تُرفع صورة.</p>
      <Button type="submit">حفظ المنتج</Button>
    </form>
  );
}
