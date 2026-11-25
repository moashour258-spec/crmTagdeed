"use client";

import { useState, useTransition } from "react";
import { updateSettingAction } from "@/app/(workspace)/settings/actions";
import { Button } from "@/components/ui/button";

const labels: Record<string, string> = {
  reservation_hours: "مدة الحجز بالساعات",
  max_active_reservations: "الحد الأقصى للحجوزات النشطة",
  default_commission_type: "نوع العمولة الافتراضية",
  default_commission_value: "قيمة العمولة الافتراضية",
  bonus_cap_amount: "سقف مبلغ البونص",
  bonus_cap_percent_of_price: "سقف البونص كنسبة من السعر",
  company_name: "اسم الشركة",
  company_address: "عنوان الشركة",
  company_phone: "هاتف الشركة",
  company_footer: "نص ختام الإيصال",
  receipt_prefix: "بادئة الإيصال",
  invoice_prefix: "بادئة الفاتورة",
  payment_methods: "طرق الدفع",
};

export function SettingRow({
  settingKey,
  value,
  restricted,
}: {
  settingKey: string;
  value: string;
  restricted: boolean;
}) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-2 rounded-xl border border-border bg-surface p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await updateSettingAction(settingKey, String(form.get("value") ?? ""));
          setMessage(result.ok ? "تم الحفظ" : result.error);
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={settingKey} className="font-semibold">{labels[settingKey] ?? settingKey}</label>
        {restricted ? <span className="text-xs text-muted">للمدير العام فقط</span> : null}
      </div>
      <input id={settingKey} name="value" defaultValue={value} className="h-11 rounded-xl border border-border bg-surface px-3" />
      <Button type="submit" variant="secondary" disabled={pending}>حفظ</Button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </form>
  );
}
