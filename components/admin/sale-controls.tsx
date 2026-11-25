"use client";

import { useState, useTransition } from "react";
import {
  cancelItemAction,
  cancelSaleAction,
  recordPaymentAction,
  savePlanAction,
  setDeliveryAction,
} from "@/app/(workspace)/sales/payment-actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

const methods = ["كاش", "تحويل", "تقسيط"];

export function PaymentForm({ saleId }: { saleId: string }) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await recordPaymentAction({
            saleId,
            kind: String(form.get("kind")) === "refund" ? "refund" : "payment",
            amount: Number(form.get("amount")),
            paidAt: String(form.get("paidAt")),
            method: String(form.get("method")),
            note: String(form.get("note") ?? ""),
            reason: String(form.get("reason") ?? ""),
          });
          setMessage(result.ok ? "تم تسجيل الحركة" : result.error);
        });
      }}
    >
      <select name="kind" className="h-11 rounded-xl border border-border bg-surface px-3">
        <option value="payment">دفعة</option>
        <option value="refund">استرداد</option>
      </select>
      <input name="amount" type="number" min="1" step="0.01" required placeholder="المبلغ" className="h-11 rounded-xl border border-border bg-surface px-3" />
      <input name="paidAt" type="date" required className="h-11 rounded-xl border border-border bg-surface px-3" />
      <select name="method" className="h-11 rounded-xl border border-border bg-surface px-3">
        {methods.map((method) => <option key={method}>{method}</option>)}
      </select>
      <input name="note" placeholder="ملاحظة" className="h-11 rounded-xl border border-border bg-surface px-3" />
      <input name="reason" placeholder="سبب الاسترداد" className="h-11 rounded-xl border border-border bg-surface px-3" />
      <Button type="submit" disabled={pending}>تسجيل</Button>
      {message ? <p className="text-sm text-muted sm:col-span-2">{message}</p> : null}
    </form>
  );
}

export function DeliveryForm({
  saleId,
  status,
  date,
  address,
  notes,
}: {
  saleId: string;
  status: string;
  date: string;
  address: string;
  notes: string;
}) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-2 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await setDeliveryAction({
            saleId,
            status: String(form.get("status")) as "pending" | "scheduled" | "delivered" | "pickup",
            date: String(form.get("date") ?? ""),
            address: String(form.get("address") ?? ""),
            notes: String(form.get("notes") ?? ""),
          });
          setMessage(result.ok ? "تم تحديث التسليم" : result.error);
        });
      }}
    >
      <select name="status" defaultValue={status} className="h-11 rounded-xl border border-border bg-surface px-3">
        <option value="pending">في الانتظار</option>
        <option value="scheduled">مجدول</option>
        <option value="delivered">تم التسليم</option>
        <option value="pickup">استلام من المعرض</option>
      </select>
      <input name="date" type="date" defaultValue={date} className="h-11 rounded-xl border border-border bg-surface px-3" />
      <input name="address" defaultValue={address} placeholder="عنوان التسليم" className="h-11 rounded-xl border border-border bg-surface px-3 sm:col-span-2" />
      <input name="notes" defaultValue={notes} placeholder="ملاحظات التسليم" className="h-11 rounded-xl border border-border bg-surface px-3 sm:col-span-2" />
      <Button type="submit" variant="secondary" disabled={pending}>حفظ التسليم</Button>
      {message ? <p className="text-sm text-muted sm:col-span-2">{message}</p> : null}
    </form>
  );
}

export function PlanForm({ saleId, hasPlan }: { saleId: string; hasPlan: boolean }) {
  const [rows, setRows] = useState([{ seq: 0, dueDate: "", amount: "" }]);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const reason = String(new FormData(event.currentTarget).get("reason") ?? "");
        start(async () => {
          const result = await savePlanAction(
            saleId,
            rows.map((row) => ({ seq: row.seq, dueDate: row.dueDate, amount: Number(row.amount) })),
            hasPlan ? reason : "",
          );
          setMessage(result.ok ? "تم حفظ خطة الأقساط" : result.error);
        });
      }}
    >
      {rows.map((row, index) => (
        <div key={row.seq} className="grid gap-2 sm:grid-cols-2">
          <input
            type="date"
            required
            value={row.dueDate}
            onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, dueDate: event.target.value } : item))}
            className="h-11 rounded-xl border border-border bg-surface px-3"
          />
          <input
            type="number"
            min="1"
            step="0.01"
            required
            placeholder="المبلغ"
            value={row.amount}
            onChange={(event) => setRows(rows.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))}
            className="h-11 rounded-xl border border-border bg-surface px-3"
          />
        </div>
      ))}
      <Button type="button" variant="ghost" onClick={() => setRows([...rows, { seq: rows.length, dueDate: "", amount: "" }])}>قسط آخر</Button>
      {hasPlan ? <input name="reason" required placeholder="سبب إعادة الجدولة" className="h-11 rounded-xl border border-border bg-surface px-3" /> : null}
      <Button type="submit" variant="secondary" disabled={pending}>{hasPlan ? "إعادة جدولة" : "حفظ الخطة"}</Button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </form>
  );
}

export function CancelControls({ saleId, itemId, label }: { saleId: string; itemId?: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const formId = `cancel-${itemId ?? saleId}`;
  return (
    <>
      <Button type="button" variant="danger" onClick={() => setOpen(true)}>{label}</Button>
      <Dialog
        open={open}
        title={label}
        onClose={() => setOpen(false)}
        footer={<Button type="submit" form={formId} variant="danger" disabled={pending}>تأكيد الإلغاء</Button>}
      >
        <form
          id={formId}
          className="grid gap-2 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const reason = String(form.get("reason") ?? "");
            const restore = String(form.get("restore")) === "inactive" ? "inactive" : "available";
            const refundRaw = String(form.get("refund") ?? "");
            const refundAmount = refundRaw ? Number(refundRaw) : null;
            start(async () => {
              const result = itemId
                ? await cancelItemAction({ saleId, itemId, reason, restore, refundAmount })
                : await cancelSaleAction({ saleId, reason, restore, refundAmount });
              setMessage(result.ok ? "تم الإلغاء" : result.error);
              if (result.ok) setOpen(false);
            });
          }}
        >
          <input name="reason" required placeholder="سبب الإلغاء" className="h-11 rounded-xl border border-border bg-surface px-3" />
          <select name="restore" className="h-11 rounded-xl border border-border bg-surface px-3">
            <option value="available">إعادة القطعة للمتاح</option>
            <option value="inactive">القطعة تالفة وتصبح غير نشطة</option>
          </select>
          <input name="refund" type="number" min="0" step="0.01" placeholder="مبلغ الاسترداد إن زاد المدفوع" className="h-11 rounded-xl border border-border bg-surface px-3" />
          {message ? <p className="text-sm text-muted">{message}</p> : null}
        </form>
      </Dialog>
    </>
  );
}
