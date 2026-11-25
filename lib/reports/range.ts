export type ReportRange = { from: string | null; to: string | null };

function cairoDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function nextDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  const stamp = new Date(Date.UTC(year, month - 1, date));
  stamp.setUTCDate(stamp.getUTCDate() + 1);
  const nextYear = stamp.getUTCFullYear();
  const nextMonth = String(stamp.getUTCMonth() + 1).padStart(2, "0");
  const nextDate = String(stamp.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDate}`;
}

function bound(day: string) {
  return `${day}T00:00:00+02:00`;
}

export function reportRange(preset: string, from: string, to: string, now = new Date()): ReportRange {
  if (preset === "all") return { from: null, to: null };
  if (preset === "custom") {
    return {
      from: from ? bound(from) : null,
      to: to ? bound(nextDay(to)) : null,
    };
  }
  const today = cairoDay(now);
  if (preset === "today") return { from: bound(today), to: bound(nextDay(today)) };
  if (preset === "year") {
    const year = today.slice(0, 4);
    return { from: bound(`${year}-01-01`), to: bound(`${Number(year) + 1}-01-01`) };
  }
  const [year, month] = today.split("-");
  const nextMonth = month === "12" ? `${Number(year) + 1}-01-01` : `${year}-${String(Number(month) + 1).padStart(2, "0")}-01`;
  return { from: bound(`${year}-${month}-01`), to: bound(nextMonth) };
}
