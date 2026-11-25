"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { moveStoreProductsAction, saveStoreAction, setStoreActiveAction } from "@/app/(workspace)/catalog/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

export type StoreRow = {
  id: string;
  name: string;
  store_code: string;
  address: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  stock: number;
};

export function StoresManager({ stores }: { stores: StoreRow[] }) {
  const t = useTranslations("store");
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [moveFrom, setMoveFrom] = useState(stores[0]?.id ?? "");
  const [moveTo, setMoveTo] = useState(stores[1]?.id ?? "");

  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3 rounded-xl border border-border bg-surface p-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await saveStoreAction({ name, storeCode: code, address, phone, notes });
          if (!result.ok) {
            toast.push({ title: result.error, tone: "danger" });
            return;
          }
          setName("");
          setCode("");
          router.refresh();
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder={t("name")} value={name} onChange={(event) => setName(event.target.value)} required />
          <Input placeholder={t("code")} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} required />
          <Input placeholder="العنوان" value={address} onChange={(event) => setAddress(event.target.value)} />
          <Input placeholder="الهاتف" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </div>
        <Input placeholder="ملاحظات" value={notes} onChange={(event) => setNotes(event.target.value)} />
        <Button type="submit">إضافة مخزن</Button>
      </form>
      <div className="grid gap-3">
        {stores.map((store) => (
          <article key={store.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{store.name}</h2>
                <p className="text-sm text-muted">{store.store_code} · {store.is_active ? "نشط" : "معطّل"} · {store.stock} منتج متاح أو محجوز</p>
              </div>
              <Button
                variant={store.is_active ? "danger" : "secondary"}
                onClick={async () => {
                  const result = await setStoreActiveAction(store.id, !store.is_active);
                  if (!result.ok) toast.push({ title: result.error, tone: "danger" });
                  else router.refresh();
                }}
              >
                {store.is_active ? "تعطيل" : "تفعيل"}
              </Button>
            </div>
          </article>
        ))}
      </div>
      <form
        className="grid gap-3 rounded-xl border border-border bg-surface p-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await moveStoreProductsAction(moveFrom, moveTo);
          if (!result.ok) toast.push({ title: result.error, tone: "danger" });
          else {
            toast.push({ title: "تم نقل المنتجات المتاحة والمحجوزة. الكود لم يتغير.", tone: "success" });
            router.refresh();
          }
        }}
      >
        <h2 className="font-semibold">{t("moveProducts")}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Select value={moveFrom} onChange={(event) => setMoveFrom(event.target.value)}>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </Select>
          <Select value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>
            {stores.filter((store) => store.is_active).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </Select>
        </div>
        <Button type="submit" variant="secondary">{t("moveProducts")}</Button>
      </form>
    </div>
  );
}
