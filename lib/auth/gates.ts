export type AccountStatus = "active" | "inactive";
export type AppRole = "admin" | "sales";

export type Gate = {
  status: AccountStatus;
  mustChangePassword: boolean;
  profileCompleted: boolean;
  isSuperAdmin: boolean;
  role: AppRole | null;
};

const publicPaths = new Set(["/login", "/forgot-password", "/reset-password"]);

const adminPaths = [
  "/users",
  "/approvals",
  "/products",
  "/stores",
  "/categories",
  "/sales",
  "/deliveries",
  "/commissions",
  "/reports",
  "/audit",
  "/settings",
];

function isAdminPath(pathname: string) {
  return adminPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function destination(pathname: string, gate: Gate | null) {
  if (pathname.startsWith("/auth/")) return null;
  if (!gate) return publicPaths.has(pathname) ? null : "/login";
  if (gate.status !== "active") return pathname === "/disabled" ? null : "/disabled";
  if (gate.mustChangePassword) return pathname === "/change-password" ? null : "/change-password";
  if (!gate.profileCompleted && !gate.isSuperAdmin) {
    return pathname === "/complete-profile" ? null : "/complete-profile";
  }
  if (pathname === "/disabled" || pathname === "/change-password" || pathname === "/complete-profile") {
    return "/";
  }
  if (pathname === "/login" || pathname === "/forgot-password") return "/";
  if (gate.role === "sales" && isAdminPath(pathname)) return "/";
  return null;
}
