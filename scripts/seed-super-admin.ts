import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createClient } from "@supabase/supabase-js";

const email = process.env.SUPER_ADMIN_EMAIL ?? "moashour258@gmail.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function readPassword() {
  if (process.env.SUPER_ADMIN_PASSWORD) return process.env.SUPER_ADMIN_PASSWORD;
  if (!input.isTTY) {
    throw new Error("Set SUPER_ADMIN_PASSWORD for this run, then remove it.");
  }
  const rl = createInterface({ input, output });
  const password = await rl.question("SUPER_ADMIN_PASSWORD: ");
  rl.close();
  return password;
}

async function main() {
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  const password = await readPassword();
  if (password.length < 14) {
    throw new Error("Super Admin password must be at least 14 characters.");
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const listed = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listed.error) throw listed.error;
  const existing = listed.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());

  let userId = existing?.id;
  if (!userId) {
    const provision = await admin.from("account_provisions").upsert({
      email,
      role: "admin",
      must_change_password: false,
      created_by: null,
    });
    if (provision.error) throw provision.error;

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw created.error ?? new Error("user was not created");
    userId = created.data.user.id;
  }

  const profile = await admin
    .from("profiles")
    .update({
      is_super_admin: true,
      profile_completed: true,
      must_change_password: false,
      full_name: "المدير العام",
    })
    .eq("id", userId);
  if (profile.error) throw profile.error;

  const role = await admin.from("user_roles").upsert({
    user_id: userId,
    role: "admin",
  });
  if (role.error) throw role.error;

  output.write("Super Admin is ready. Remove SUPER_ADMIN_PASSWORD from the environment.\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "seed failed";
  output.write(`${message}\n`);
  process.exitCode = 1;
});
