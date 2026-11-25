import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";
import { reportRange } from "@/lib/reports/range";

describe("csv exports", () => {
  it("keeps Arabic text and prefixes formula cells", () => {
    const file = toCsv(["العميل", "المبلغ"], [["تجديد", "=1+1"], ["عادي", 500]]);
    expect(file.startsWith("\uFEFF")).toBe(true);
    expect(file).toContain("تجديد");
    expect(file).toContain("'=1+1");
    expect(csvCell("أ,ب")).toBe('"أ,ب"');
    expect(csvCell("+20")).toBe("'+20");
  });
});

describe("cairo report range", () => {
  const now = new Date("2026-11-25T12:00:00Z");

  it("uses the Cairo month by default", () => {
    expect(reportRange("month", "", "", now)).toEqual({
      from: "2026-11-01T00:00:00+02:00",
      to: "2026-12-01T00:00:00+02:00",
    });
  });

  it("keeps a custom inclusive end date", () => {
    expect(reportRange("custom", "2026-11-01", "2026-11-25", now)).toEqual({
      from: "2026-11-01T00:00:00+02:00",
      to: "2026-11-26T00:00:00+02:00",
    });
  });

  it("clears the range for all dates", () => {
    expect(reportRange("all", "", "", now)).toEqual({ from: null, to: null });
  });
});
