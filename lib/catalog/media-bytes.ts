const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const videoTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export type MediaKind = "image" | "video";

export function detectMedia(bytes: Uint8Array, mime: string): { kind: MediaKind; mime: string } | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && imageTypes.has(mime)) {
    return { kind: "image", mime: "image/jpeg" };
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && mime === "image/png") {
    return { kind: "image", mime: "image/png" };
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50 &&
    mime === "image/webp"
  ) {
    return { kind: "image", mime: "image/webp" };
  }
  const brand = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (brand === "ftyp" && (mime === "video/mp4" || mime === "video/quicktime")) {
    return { kind: "video", mime };
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 && mime === "video/webm") {
    return { kind: "video", mime: "video/webm" };
  }
  return null;
}

export function mediaLimitError(kind: MediaKind, size: number, imageCount: number, videoCount: number) {
  if (kind === "image" && imageCount >= 10) return "الحد الأقصى 10 صور للمنتج";
  if (kind === "video" && videoCount >= 3) return "الحد الأقصى 3 فيديوهات للمنتج";
  if (kind === "image" && size > 5 * 1024 * 1024) return "حجم الصورة أكبر من 5 ميجا";
  if (kind === "video" && size > 50 * 1024 * 1024) return "حجم الفيديو أكبر من 50 ميجا";
  if (!imageTypes.has(kind === "image" ? "image/jpeg" : "") && kind === "video" && !videoTypes.size) return null;
  return null;
}
