"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmUploadAction, duplicateProductAction, prepareUploadAction } from "@/app/(workspace)/catalog/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";

export function ProductTools({ productId }: { productId: string }) {
  const toast = useToast();
  const router = useRouter();
  const [progress, setProgress] = useState<number | null>(null);

  return (
    <section className="grid gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            const result = await duplicateProductAction(productId);
            if (!result.ok || !result.id) {
              toast.push({ title: result.ok ? "تعذر التكرار" : result.error, tone: "danger" });
              return;
            }
            router.push(`/products/${result.id}`);
          }}
        >
          تكرار المنتج
        </Button>
      </div>
      <label className="grid gap-2 text-sm">
        رفع صورة أو فيديو
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const prepared = await prepareUploadAction(productId, file.type, file.size);
            if (!prepared.ok) {
              toast.push({ title: prepared.error, tone: "danger" });
              return;
            }
            setProgress(10);
            const supabase = createClient();
            const uploaded = await supabase.storage.from(prepared.bucket).uploadToSignedUrl(prepared.path, prepared.token, file);
            if (uploaded.error) {
              setProgress(null);
              toast.push({ title: "فشل الرفع، حاول مرة أخرى", tone: "danger" });
              return;
            }
            setProgress(80);
            const confirmed = await confirmUploadAction({
              productId,
              bucket: prepared.bucket,
              path: prepared.path,
              mime: file.type,
              size: file.size,
              duration: null,
              posterPath: null,
            });
            setProgress(null);
            if (!confirmed.ok) toast.push({ title: confirmed.error, tone: "danger" });
            else router.refresh();
          }}
        />
      </label>
      {progress != null ? <p className="text-sm text-muted">جاري الرفع... {progress}%</p> : null}
      <p className="text-sm text-muted">الفيديو حتى 50 ميجا بصيغة MP4 أو WebM أو MOV. على الآيفون سجّل بإعداد Most Compatible.</p>
    </section>
  );
}
