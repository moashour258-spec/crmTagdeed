"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reorderCategoriesAction, saveCategoryAction } from "@/app/(workspace)/catalog/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

export type CategoryRow = {
  id: string;
  name_ar: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
};

export function CategoriesManager({ categories }: { categories: CategoryRow[] }) {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const parents = categories.filter((category) => !category.parent_id);

  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3 rounded-xl border border-border bg-surface p-4 md:grid-cols-[1fr_1fr_auto]"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await saveCategoryAction({ name, parentId, sortOrder: categories.length + 1 });
          if (!result.ok) toast.push({ title: result.error, tone: "danger" });
          else {
            setName("");
            router.refresh();
          }
        }}
      >
        <Input placeholder="اسم الفئة" value={name} onChange={(event) => setName(event.target.value)} required />
        <Select value={parentId} onChange={(event) => setParentId(event.target.value)}>
          <option value="">فئة رئيسية</option>
          {parents.map((category) => <option key={category.id} value={category.id}>{category.name_ar}</option>)}
        </Select>
        <Button type="submit">إضافة</Button>
      </form>
      <div className="grid gap-3">
        {parents.map((parent) => (
          <section key={parent.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="font-semibold">{parent.name_ar}</h2>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const ids = parents.map((item) => item.id);
                  const index = ids.indexOf(parent.id);
                  if (index <= 0) return;
                  [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                  const result = await reorderCategoriesAction(ids);
                  if (!result.ok) toast.push({ title: result.error, tone: "danger" });
                  else router.refresh();
                }}
              >
                تقديم
              </Button>
            </div>
            <ul className="grid gap-1 text-sm text-muted">
              {categories.filter((category) => category.parent_id === parent.id).map((child) => (
                <li key={child.id}>{child.name_ar}{child.is_active ? "" : " · معطّلة"}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
