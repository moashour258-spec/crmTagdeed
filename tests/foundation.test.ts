import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { formatMoney } from "../lib/format";
import {
  decryptNationalId,
  encryptNationalId,
  hashNationalId,
  maskNationalId,
  validateNationalId,
} from "../lib/crypto/national-id";

function walk(dir: string, acc: string[] = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const path = join(dir, entry);
    const info = statSync(path);
    if (info.isDirectory()) walk(path, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(path);
  }
  return acc;
}

describe("foundation", () => {
  it("formats money with Latin digits", () => {
    expect(formatMoney(10000)).toBe("10,000.00");
  });

  it("validates an Egyptian national id", () => {
    expect(validateNationalId("29001010100011")).toBe(true);
    expect(validateNationalId("19001010100011")).toBe(false);
    expect(validateNationalId("21313010100011")).toBe(false);
    expect(validateNationalId("29001019900011")).toBe(false);
    expect(maskNationalId("29001010100011")).toBe("29**********11");
  });

  it("encrypts the national id so it can be decrypted", () => {
    const key = randomBytes(32).toString("base64");
    const hashKey = randomBytes(32).toString("base64");
    const payload = encryptNationalId("29001010100011", key);
    expect(payload.split(".").length).toBe(3);
    expect(decryptNationalId(payload, key)).toBe("29001010100011");
    expect(hashNationalId("29001010100011", hashKey)).toHaveLength(64);
  });

  it("keeps the service-role client inside the admin module", () => {
    const files = walk(".").filter(
      (file) => !file.endsWith("lib/supabase/admin.ts") && !file.endsWith("scripts/seed-super-admin.ts"),
    );
    const offenders = files.filter((file) =>
      /from ["']@\/lib\/supabase\/admin["']/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
