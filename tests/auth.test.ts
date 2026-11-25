import { describe, expect, it } from "vitest";
import { destination } from "@/lib/auth/gates";
import { generatePassword, isStrongPassword } from "@/lib/auth/password";
import { phoneSchema, profileSchema } from "@/lib/validators/profile";

const active = {
  status: "active" as const,
  mustChangePassword: false,
  profileCompleted: true,
  isSuperAdmin: false,
  role: "admin" as const,
};

describe("phase 1 gates", () => {
  it("sends a signed-out visitor to login", () => {
    expect(destination("/users", null)).toBe("/login");
    expect(destination("/login", null)).toBeNull();
  });

  it("forces a password change before any other page", () => {
    const gate = { ...active, mustChangePassword: true, profileCompleted: false };
    expect(destination("/", gate)).toBe("/change-password");
    expect(destination("/complete-profile", gate)).toBe("/change-password");
    expect(destination("/change-password", gate)).toBeNull();
  });

  it("sends an inactive account to the disabled page", () => {
    expect(destination("/users", { ...active, status: "inactive" })).toBe("/disabled");
    expect(destination("/disabled", { ...active, status: "inactive" })).toBeNull();
  });

  it("requires a profile, then opens the home for that role", () => {
    const sales = { ...active, role: "sales" as const, profileCompleted: false };
    expect(destination("/", sales)).toBe("/complete-profile");
    expect(destination("/users", { ...sales, profileCompleted: true })).toBe("/");
    expect(destination("/sales", { ...sales, profileCompleted: true })).toBe("/");
    expect(destination("/sales/catalog", { ...sales, profileCompleted: true })).toBeNull();
    expect(destination("/sales/cart", { ...sales, profileCompleted: true })).toBeNull();
    expect(destination("/sales/earnings", { ...sales, profileCompleted: true })).toBeNull();
    expect(destination("/bonuses", { ...sales, profileCompleted: true })).toBe("/");
    expect(destination("/payouts", { ...sales, profileCompleted: true })).toBe("/");
    expect(destination("/commissions/bulk", { ...sales, profileCompleted: true })).toBe("/");
    expect(destination("/account", { ...sales, profileCompleted: true })).toBeNull();
  });

  it("lets the super admin in without blocking on private data", () => {
    const gate = { ...active, isSuperAdmin: true, profileCompleted: false };
    expect(destination("/", gate)).toBeNull();
  });

  it("generates a 16 character password without ambiguous characters", () => {
    const password = generatePassword();
    expect(password).toHaveLength(16);
    expect(password).not.toMatch(/[0O1lI]/);
    expect(isStrongPassword(password)).toBe(true);
    expect(isStrongPassword("short")).toBe(false);
  });

  it("accepts an Egyptian mobile number and a valid profile", () => {
    expect(phoneSchema.safeParse("01012345678").success).toBe(true);
    expect(phoneSchema.safeParse("12345").success).toBe(false);
    expect(
      profileSchema.safeParse({
        fullName: "مندوب مبيعات",
        phone: "01012345678",
        address: "المعادي، القاهرة",
        nationalId: "29001010100011",
      }).success,
    ).toBe(true);
  });
});
