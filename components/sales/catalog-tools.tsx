"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cancelReservationAction, requestPriceAction, reserveAction } from "@/app/(workspace)/sales/actions";
import { Button } from "@/components/ui/button";

const basketKey = "tajdeed-basket";

export type BasketLine = {
  publicCode: string;
  name: string;
  listPrice: number;
  suffix?: string;
};

export function readBasket(): BasketLine[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(basketKey) ?? "[]") as BasketLine[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeBasket(lines: BasketLine[]) {
  window.localStorage.setItem(basketKey, JSON.stringify(lines));
}

export function RefreshCatalog() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 30000);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}

export function AddToBasket({ line }: { line: BasketLine }) {
  const [saved, setSaved] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        const current = readBasket().filter((item) => item.publicCode !== line.publicCode || item.suffix !== line.suffix);
        writeBasket([...current, line]);
        setSaved(true);
      }}
    >
      {saved ? "أضيفت للسلة" : "أضف للسلة"}
    </Button>
  );
}

export function ReserveButton({ publicCode, reservationId }: { publicCode: string; reservationId: string | null }) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2">
      {reservationId ? (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            start(async () => {
              const result = await cancelReservationAction(reservationId);
              setMessage(result.ok ? "تم إلغاء الحجز" : result.error);
            });
          }}
        >
          إلغاء الحجز
        </Button>
      ) : (
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            start(async () => {
              const result = await reserveAction(publicCode);
              setMessage(result.ok ? "تم الحجز لمدة 48 ساعة" : result.error);
            });
          }}
        >
          احجز
        </Button>
      )}
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}

export function PriceRequestForm({ reservationId }: { reservationId: string }) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await requestPriceAction(reservationId, Number(form.get("price")), String(form.get("note") ?? ""));
          setMessage(result.ok ? "أُرسل طلب السعر للمدير" : result.error);
        });
      }}
    >
      <input name="price" type="number" min="1" step="1" required placeholder="السعر المطلوب" className="h-11 rounded-xl border border-border bg-surface px-3" />
      <input name="note" placeholder="سبب الطلب" className="h-11 rounded-xl border border-border bg-surface px-3" />
      <Button type="submit" variant="secondary" disabled={pending}>اطلب موافقة سعر</Button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </form>
  );
}
