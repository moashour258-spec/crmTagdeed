const money = new Intl.NumberFormat("ar-EG", {
  numberingSystem: "latn",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateTime = new Intl.DateTimeFormat("ar-EG", {
  numberingSystem: "latn",
  timeZone: "Africa/Cairo",
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatMoney(value: number) {
  return money.format(value);
}

export function formatDateTime(value: Date) {
  return dateTime.format(value);
}

const day = new Intl.DateTimeFormat("ar-EG", {
  numberingSystem: "latn",
  timeZone: "Africa/Cairo",
  dateStyle: "medium",
});

export function formatDate(value: Date) {
  return day.format(value);
}
