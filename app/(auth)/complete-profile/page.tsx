"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { completeProfileAction } from "@/app/(auth)/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export default function CompleteProfilePage() {
  const t = useTranslations("profile");
  const auth = useTranslations("auth");
  const toast = useToast();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <AuthCard title={auth("completeProfileTitle")}>
      <form
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          const result = await completeProfileAction({ fullName, phone, address, nationalId });
          setPending(false);
          if (!result.ok) {
            toast.push({ title: result.error, tone: "danger" });
            return;
          }
          router.push("/");
          router.refresh();
        }}
      >
        <label className="grid gap-1 text-sm font-medium">
          {t("fullName")}
          <Input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t("phone")}
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" required />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t("address")}
          <Input value={address} onChange={(event) => setAddress(event.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          {t("nationalId")}
          <Input value={nationalId} onChange={(event) => setNationalId(event.target.value)} inputMode="numeric" required />
        </label>
        <Button type="submit" disabled={pending}>حفظ</Button>
      </form>
    </AuthCard>
  );
}
