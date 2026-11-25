"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { completeSaleAction, previewSaleAction } from "@/app/(workspace)/sales/actions";
import { readBasket, writeBasket, type BasketLine } from "@/components/sales/catalog-tools";
import { Button } from "@/components/ui/button";
import { distributeTotal } from "@/lib/catalog/distribute-total";
import { formatMoney } from "@/lib/format";

const methods = ["كاش", "تحويل", "تقسيط"];

export function CartDesk() {
  const [lines, setLines] = useState<BasketLine[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [agreed, setAgreed] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    const stored = readBasket();
    setLines(stored);
    setPrices(Object.fromEntries(stored.map((line) => [lineKey(line), String(line.listPrice)])));
  }, []);

  const ready = useMemo(
    () =>
      lines.map((line) => ({
        publicCode: line.publicCode,
        suffix: line.suffix,
        price: Number(prices[lineKey(line)]),
      })),
    [lines, prices],
  );

  function persist(next: BasketLine[]) {
    setLines(next);
    writeBasket(next);
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await completeSaleAction({
            lines: ready,
            customerName: String(form.get("name") ?? ""),
            customerPhone: String(form.get("phone") ?? ""),
            customerAddress: String(form.get("address") ?? ""),
            notes: String(form.get("notes") ?? ""),
            paymentMethod: String(form.get("method") ?? ""),
          });
          if (result.ok) {
            persist([]);
            setMessage("تم تسجيل البيع");
            setPreview("");
          } else {
            setMessage(result.error);
          }
        });
      }}
    >
      {lines.length === 0 ? <p className="text-sm text-muted">السلة فارغة. أضف قطعة من المنتجات المتاحة.</p> : null}
      <div className="grid gap-3">
        {lines.map((line) => {
          const key = lineKey(line);
          return (
            <div key={key} className="grid gap-2 rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{line.name}</h2>
                  <p className="text-sm text-muted">{line.publicCode}{line.suffix ? `-${line.suffix}` : ""} · سعر القائمة {formatMoney(line.listPrice)}</p>
                </div>
                <Button type="button" variant="ghost" onClick={() => persist(lines.filter((item) => lineKey(item) !== key))}>حذف</Button>
              </div>
              <input
                inputMode="decimal"
                value={prices[key] ?? ""}
                onChange={(event) => setPrices({ ...prices, [key]: event.target.value })}
                className="h-11 rounded-xl border border-border bg-surface px-3"
                aria-label={`سعر ${line.name}`}
              />
            </div>
          );
        })}
      </div>
      {lines.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm">
            الإجمالي المتفق عليه
            <input value={agreed} onChange={(event) => setAgreed(event.target.value)} inputMode="decimal" className="h-11 rounded-xl border border-border bg-surface px-3" />
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              try {
                const shares = distributeTotal(
                  lines.map((line) => ({ key: lineKey(line), listPrice: line.listPrice })),
                  Number(agreed),
                );
                setPrices(Object.fromEntries(shares.map((share) => [share.key, String(share.price)])));
                setMessage("وُزّع الإجمالي على القطع بالجنيه");
              } catch {
                setMessage("أدخل إجمالاً صحيحًا أكبر من صفر");
              }
            }}
          >
            وزّع الإجمالي
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              start(async () => {
                const result = await previewSaleAction(ready);
                if (!result.ok) {
                  setPreview("");
                  setMessage(result.error);
                  return;
                }
                const rows = Array.isArray(result.preview) ? result.preview : [];
                const earning = rows.reduce((sum, row) => sum + Number((row as { earning?: number }).earning ?? 0), 0);
                setPreview(`العمولة المتوقعة ${formatMoney(earning)}`);
                setMessage("");
              });
            }}
          >
            معاينة العمولة
          </Button>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" required placeholder="اسم العميل" className="h-11 rounded-xl border border-border bg-surface px-3" />
        <input name="phone" required placeholder="هاتف العميل" className="h-11 rounded-xl border border-border bg-surface px-3" />
        <input name="address" placeholder="العنوان" className="h-11 rounded-xl border border-border bg-surface px-3 sm:col-span-2" />
        <input name="notes" placeholder="ملاحظات" className="h-11 rounded-xl border border-border bg-surface px-3 sm:col-span-2" />
        <select name="method" className="h-11 rounded-xl border border-border bg-surface px-3" defaultValue="كاش">
          {methods.map((method) => <option key={method}>{method}</option>)}
        </select>
      </div>
      {preview ? <p className="text-sm">{preview}</p> : null}
      {message ? <p className="text-sm text-muted">{message}</p> : null}
      <Button type="submit" disabled={pending || lines.length === 0}>تسجيل البيع</Button>
    </form>
  );
}

function lineKey(line: BasketLine) {
  return `${line.publicCode}:${line.suffix ?? ""}`;
}
