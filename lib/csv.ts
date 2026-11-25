const formulaPrefix = /^[=+\-@\t\r]/;

export function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  const safe = formulaPrefix.test(text) ? `'${text}` : text;
  if (/[",\n\r]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`;
  return safe;
}

export function toCsv(headers: string[], rows: unknown[][]) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  return `\uFEFF${lines.join("\r\n")}`;
}
