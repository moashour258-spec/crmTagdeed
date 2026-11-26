"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { confirmUploadAction, duplicateProductAction, prepareUploadAction } from "@/app/(workspace)/catalog/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { mediaLimitError, type MediaKind } from "@/lib/catalog/media-bytes";
import { createClient } from "@/lib/supabase/client";

type MediaRow = {
  id: string;
  kind: MediaKind;
  storage_path: string;
  is_primary: boolean;
  sort_order: number;
  url?: string | null;
};

export function ProductTools({
  productId,
  media,
  onDeleteMedia,
}: {
  productId: string;
  media: MediaRow[];
  onDeleteMedia?: (mediaId: string) => Promise<void> | void;
}) {
  const t = useTranslations("product");
  const toast = useToast();
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const counts = useMemo(
    () => ({
      images: media.filter((item) => item.kind === "image").length,
      videos: media.filter((item) => item.kind === "video").length,
    }),
    [media],
  );

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    let imageCount = counts.images;
    let videoCount = counts.videos;

    for (const file of list) {
      const kind: MediaKind = file.type.startsWith("video/") ? "video" : "image";
      const limit = mediaLimitError(kind, file.size, imageCount, videoCount);
      if (limit) {
        toast.push({ title: limit, tone: "danger" });
        continue;
      }
      setProgress(`${t("uploading")} ${file.name}`);
      const prepared = await prepareUploadAction(productId, file.type, file.size);
      if (!prepared.ok) {
        toast.push({ title: prepared.error, tone: "danger" });
        continue;
      }
      const supabase = createClient();
      const uploaded = await supabase.storage
        .from(prepared.bucket)
        .uploadToSignedUrl(prepared.path, prepared.token, file);
      if (uploaded.error) {
        toast.push({ title: t("uploadFailed"), tone: "danger" });
        continue;
      }
      const confirmed = await confirmUploadAction({
        productId,
        bucket: prepared.bucket,
        path: prepared.path,
        mime: file.type,
        size: file.size,
        duration: null,
        posterPath: null,
      });
      if (!confirmed.ok) {
        toast.push({ title: confirmed.error, tone: "danger" });
        continue;
      }
      if (kind === "image") imageCount += 1;
      else videoCount += 1;
      toast.push({
        title:
          "activated" in confirmed && confirmed.activated
            ? `تم رفع ${file.name} وتفعيل المنتج للبيع`
            : `تم رفع ${file.name}`,
        tone: "success",
      });
    }
    setProgress(null);
    router.refresh();
  }

  return (
    <section className="grid gap-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{t("uploadMedia")}</h3>
          <p className="text-sm text-muted">
            {counts.images} {t("imagesCount")} · {counts.videos} {t("videosCount")}
          </p>
        </div>
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
          {t("duplicate")}
        </Button>
      </div>

      <label
        className={`grid cursor-pointer gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? "border-primary bg-primary/10" : "border-border bg-surface-2/40"
        }`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void uploadFiles(event.dataTransfer.files);
        }}
      >
        <span className="text-sm font-medium">{t("dropHere")}</span>
        <span className="text-xs text-muted">{t("videoHelp")}</span>
        <input
          type="file"
          className="sr-only"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
          onChange={(event) => {
            const files = event.target.files;
            if (files) void uploadFiles(files);
            event.target.value = "";
          }}
        />
      </label>

      {progress ? <p className="text-sm text-muted">{progress}</p> : null}

      {media.length === 0 ? (
        <p className="text-sm text-danger">{t("missingImages")}. التفعيل يحتاج صورة واحدة على الأقل.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-xl border border-border bg-surface-2">
              {item.url ? (
                item.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt="" className="aspect-video w-full object-cover" />
                ) : (
                  <video src={item.url} controls className="aspect-video w-full bg-black" />
                )
              ) : (
                <div className="flex aspect-video items-center justify-center text-sm text-muted">
                  {item.kind === "image" ? t("images") : t("video")}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                <span>{item.kind === "image" ? t("images") : t("video")}</span>
                <span className="flex items-center gap-2">
                  {item.is_primary ? <span className="text-primary">{t("primaryImage")}</span> : null}
                  {onDeleteMedia ? (
                    <button
                      type="button"
                      className="text-danger"
                      onClick={() => {
                        if (!window.confirm("حذف هذا الملف؟")) return;
                        void onDeleteMedia(item.id);
                      }}
                    >
                      حذف
                    </button>
                  ) : null}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
