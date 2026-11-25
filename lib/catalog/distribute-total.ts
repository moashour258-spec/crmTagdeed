export type Share = { key: string; listPrice: number };

// Whole pounds. The leftover pound goes to the highest list price so the lines sum to the agreed total.
export function distributeTotal(items: Share[], total: number) {
  const target = Math.round(total);
  const listSum = items.reduce((sum, item) => sum + item.listPrice, 0);
  if (items.length === 0 || listSum <= 0 || !Number.isFinite(target) || target <= 0) {
    throw new Error("invalid_total");
  }
  const shares = items.map((item) => ({
    key: item.key,
    price: Math.floor((target * item.listPrice) / listSum),
  }));
  const remainder = target - shares.reduce((sum, item) => sum + item.price, 0);
  const highest = items.reduce((best, item) => (item.listPrice > best.listPrice ? item : best));
  const winner = shares.find((item) => item.key === highest.key);
  if (winner) winner.price += remainder;
  return shares;
}
