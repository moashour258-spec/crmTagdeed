export const navItems = [
  { href: "/", key: "dashboard" },
  { href: "/approvals", key: "approvals" },
  { href: "/products", key: "products" },
  { href: "/stores", key: "stores" },
  { href: "/categories", key: "categories" },
  { href: "/sales", key: "sales" },
  { href: "/deliveries", key: "deliveries" },
  { href: "/commissions", key: "commissions" },
  { href: "/users", key: "users" },
  { href: "/reports", key: "reports" },
  { href: "/audit", key: "audit" },
  { href: "/settings", key: "settings" },
  { href: "/account", key: "account" },
] as const;

export const sectionKeys = new Set(navItems.map((item) => item.href.slice(1)).filter(Boolean));
