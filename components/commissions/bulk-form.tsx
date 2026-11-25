"use client";

import { useState, useTransition } from "react";
import { bulkCommissionAction, undoBulkAction } from "@/app/(workspace)/commissions/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type Option = { id: string; label: string };
type Batch = { id: string; summary: string; undone: boolean };

export function BulkForm({
  stores,
  categories,
  batches,
}: {
  stores: Option[];
  categories: Option[];
  batches: Batch[];
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<{
    search: string;
    priceMin: string;
    priceMax: string;
    storeId: string;
    categoryId: string;
    status: string;
    ids: string;
    newType: "percentage" | "fixed";
    newValue: number;
    note: string;
  } | null>(null);

  return (
    <div className="grid gap-6">
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setDraft({
            search: String(form.get("search") ?? ""),
            priceMin: String(form.get("priceMin") ?? ""),
            priceMax: String(form.get("priceMax") ?? ""),
            storeId: String(form.get("storeId") ?? ""),
            categoryId: String(form.get("categoryId") ?? ""),
            status: String(form.get("status") ?? ""),
            ids: String(form.get("ids") ?? ""),
            newType: String(form.get("newType")) === "fixed" ? "fixed" : "percentage",
            newValue: Number(form.get("newValue")),
            note: String(form.get("note") ?? ""),
          });
          setOpen(true);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="search" placeholder="بحث بالاسم" className="h-11 rounded-xl border border-border bg-surface px-3" />
          <input name="ids" placeholder="معرّفات محددة، مفصولة بفاصلة" className="h-11 rounded-xl border border-border bg-surface px-3" />
          <input name="priceMin" type="number" min="0" step="0.01" placeholder="السعر من" className="h-11 rounded-xl border border-border bg-surface px-3" />
          <input name="priceMax" type="number" min="0" step="0.01" placeholder="السعر إلى" className="h-11 rounded-xl border border-border bg-surface px-3" />
          <select name="storeId" className="h-11 rounded-xl border border-border bg-surface px-3">
            <option value="">كل المخازن</option>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.label}</option>)}
          </select>
          <select name="categoryId" className="h-11 rounded-xl border border-border bg-surface px-3">
            <option value="">كل الفئات</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
          </select>
          <select name="status" className="h-11 rounded-xl border border-border bg-surface px-3">
            <option value="">كل الحالات</option>
            <option value="available">متاح</option>
            <option value="reserved">محجوز</option>
            <option value="sold">مباع</option>
            <option value="partially_sold">مباع جزئياً</option>
            <option value="inactive">غير نشط</option>
          </select>
          <select name="newType" className="h-11 rounded-xl border border-border bg-surface px-3">
            <option value="percentage">نسبة مئوية</option>
            <option value="fixed">مبلغ ثابت</option>
          </select>
          <input name="newValue" type="number" min="0" step="0.01" required placeholder="القيمة الجديدة" className="h-11 rounded-xl border border-border bg-surface px-3" />
          <input name="note" placeholder="ملاحظة تُحفظ مع الدفعة" className="h-11 rounded-xl border border-border bg-surface px-3" />
        </div>
        <Button type="submit">مراجعة التطبيق</Button>
        {message ? <p className="text-sm text-muted">{message}</p> : null}
      </form>
      <Dialog
        open={open}
        title="تطبيق العمولة"
        onClose={() => setOpen(false)}
        footer={
          <Button
            type="button"
            disabled={pending || !draft}
            onClick={() => {
              if (!draft) return;
              start(async () => {
                const result = await bulkCommissionAction(draft);
                setMessage(result.ok ? "تم تطبيق العمولة على القطع المطابقة" : result.error);
                setOpen(false);
              });
            }}
          >
            تطبيق
          </Button>
        }
      >
        <p className="text-sm">التعديل يكتب القيمة على القطع الحالية فقط. فواتير سابقة تحتفظ بلقطة عمولتها، والتراجع يعيد الصفوف التي لم تُغيّر بعدها.</p>
      </Dialog>
      <section className="grid gap-2">
        <h2 className="font-semibold">دفعات سابقة</h2>
        {batches.length === 0 ? <p className="text-sm text-muted">لا توجد دفعات.</p> : null}
        {batches.map((batch) => (
          <div key={batch.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3">
            <p className="text-sm">{batch.summary}</p>
            {batch.undone ? <span className="text-sm text-muted">تم التراجع</span> : (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  start(async () => {
                    const result = await undoBulkAction(batch.id);
                    setMessage(result.ok ? "تم التراجع عما لم يتغير" : result.error);
                  });
                }}
              >
                تراجع
              </Button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
