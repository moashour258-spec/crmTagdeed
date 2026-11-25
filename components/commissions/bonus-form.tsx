"use client";

import { useState, useTransition } from "react";
import { saveBonusAction, toggleBonusAction } from "@/app/(workspace)/bonuses/actions";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";

type Rule = {
  id: string;
  name: string;
  bonusType: string;
  bonusValue: number;
  priceMin: number | null;
  priceMax: number | null;
  active: boolean;
};

export function BonusForm({ rules }: { rules: Rule[] }) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-6">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          start(async () => {
            const result = await saveBonusAction({
              name: String(form.get("name") ?? ""),
              bonusType: String(form.get("bonusType")) === "fixed" ? "fixed" : "percentage",
              bonusValue: Number(form.get("bonusValue")),
              priceMin: String(form.get("priceMin") ?? ""),
              priceMax: String(form.get("priceMax") ?? ""),
            });
            setMessage(result.ok ? "تم حفظ قاعدة البونص" : result.error);
            if (result.ok) formElement.reset();
          });
        }}
      >
        <input name="name" required placeholder="اسم القاعدة" className="h-11 rounded-xl border border-border bg-surface px-3" />
        <select name="bonusType" className="h-11 rounded-xl border border-border bg-surface px-3">
          <option value="fixed">مبلغ ثابت</option>
          <option value="percentage">نسبة مئوية</option>
        </select>
        <input name="bonusValue" type="number" min="0.01" step="0.01" required placeholder="القيمة" className="h-11 rounded-xl border border-border bg-surface px-3" />
        <input name="priceMin" type="number" min="0" step="0.01" placeholder="الحد الأدنى للسعر" className="h-11 rounded-xl border border-border bg-surface px-3" />
        <input name="priceMax" type="number" min="0" step="0.01" placeholder="الحد الأقصى للسعر" className="h-11 rounded-xl border border-border bg-surface px-3 sm:col-span-2" />
        <Button type="submit" disabled={pending}>إضافة</Button>
        {message ? <p className="text-sm text-muted sm:col-span-2">{message}</p> : null}
      </form>
      <p className="text-sm text-muted">كل قاعدة تحتاج حداً سعرياً أو ربطاً بقطعة أو فئة أو مخزن. القواعد النشطة تُجمع معاً، ثم يُطبَّق سقف البونص إن وُجد.</p>
      <div className="grid gap-2">
        {rules.length === 0 ? <p className="text-sm text-muted">لا توجد قواعد بونص.</p> : null}
        {rules.map((rule) => (
          <article key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3">
            <div>
              <h2 className="font-semibold">{rule.name}</h2>
              <p className="text-sm text-muted">
                {rule.bonusType === "percentage" ? `${rule.bonusValue}%` : formatMoney(rule.bonusValue)}
                {" · "}
                {rule.priceMin == null && rule.priceMax == null
                  ? "بدون حدود سعر"
                  : `${rule.priceMin ?? "—"} – ${rule.priceMax ?? "—"}`}
                {rule.active ? "" : " · متوقفة"}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                start(async () => {
                  const result = await toggleBonusAction(rule.id, !rule.active);
                  setMessage(result.ok ? (rule.active ? "تم إيقاف القاعدة" : "تم تفعيل القاعدة") : result.error);
                });
              }}
            >
              {rule.active ? "إيقاف" : "تفعيل"}
            </Button>
          </article>
        ))}
      </div>
    </div>
  );
}
