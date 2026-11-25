import { describe, expect, it } from "vitest";
import { previewCommission } from "@/lib/catalog/commission";
import { previewImport } from "@/lib/catalog/import-preview";
import { detectMedia } from "@/lib/catalog/media-bytes";

describe("catalog", () => {
  it("previews a percentage and a fixed commission", () => {
    expect(previewCommission(10000, "percentage", 5)).toBe(500);
    expect(previewCommission(10000, "fixed", 300)).toBe(300);
    expect(previewCommission(200, "fixed", 300)).toBe(200);
  });

  it("rejects a bad import row and keeps the valid one", () => {
    const result = previewImport(
      [
        { name: "كرسي", category: "كراسي", store: "المخزن", list_price: 1500, commission_type: "percentage", commission_value: 5 },
        { name: "خطأ", category: "غير موجودة", store: "المخزن", list_price: 10 },
      ],
      ["كراسي"],
      ["المخزن"],
    );
    expect(result.valid).toHaveLength(1);
    expect(result.issues).toEqual([{ row: 3, reason: "الفئة غير معروفة" }]);
  });

  it("rejects a renamed text file pretending to be a video", () => {
    const bytes = new TextEncoder().encode("this is not a video file at all");
    expect(detectMedia(bytes, "video/mp4")).toBeNull();
  });

  it("accepts an mp4 header and a jpeg header", () => {
    const mp4 = new Uint8Array(16);
    mp4.set([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70], 0);
    expect(detectMedia(mp4, "video/mp4")?.kind).toBe("video");
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectMedia(jpeg, "image/jpeg")?.kind).toBe("image");
    expect(detectMedia(jpeg, "video/mp4")).toBeNull();
  });
});
