import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const roots = ["app", "components", "lib", "scripts"];
const keyAllowed = new Set([
  "lib/env.ts",
  "lib/supabase/admin.ts",
  "scripts/seed-super-admin.ts",
]);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}

describe("service role boundary", () => {
  it("keeps the service role key out of the browser and the page code", () => {
    const hits = roots.flatMap(files).filter((file) => {
      const text = readFileSync(file, "utf8");
      return text.includes("SUPABASE_SERVICE_ROLE_KEY") || text.includes(".getSession(");
    });
    expect(hits.sort()).toEqual([...keyAllowed].sort());
  });
});
