export const navItems = [
  { href: "/", key: "dashboard" },
  { href: "/approvals", key: "approvals" },
  { href: "/products", key: "products" },
  { href: "/stores", key: "stores" },
  { href: "/categories", key: "categories" },
  { href: "/sales", key: "sales" },
  { href: "/deliveries", key: "deliveries" },
  { href: "/commissions", key: "commissions" },
  { href: "/commissions/bulk", key: "bulkCommissions" },
  { href: "/payouts", key: "payouts" },
  { href: "/bonuses", key: "bonuses" },
  { href: "/users", key: "users" },
  { href: "/reports", key: "reports" },
  { href: "/audit", key: "audit" },
  { href: "/settings", key: "settings" },
  { href: "/sales/catalog", key: "catalog" },
  { href: "/sales/cart", key: "cart" },
  { href: "/sales/my-sales", key: "mySales" },
  { href: "/sales/earnings", key: "myEarnings" },
  { href: "/account", key: "account" },
] as const;

export const sectionKeys = new Set(navItems.map((item) => item.href.slice(1)).filter(Boolean));

const salesHrefs = new Set(["/", "/sales/catalog", "/sales/cart", "/sales/my-sales", "/sales/earnings", "/account"]);
const salesOnly = new Set(["/sales/catalog", "/sales/cart", "/sales/my-sales"]);

export function navForRole(role: "admin" | "sales" | null) {
  if (role === "sales") return navItems.filter((item) => salesHrefs.has(item.href));
  return navItems.filter((item) => !salesOnly.has(item.href));
}
