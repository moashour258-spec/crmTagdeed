import "server-only";
import { decryptNationalId, encryptNationalId, hashNationalId, maskNationalId } from "@/lib/crypto/national-id";
import { arabicError } from "@/lib/auth/errors";
import { generatePassword, isStrongPassword } from "@/lib/auth/password";
import { getServerEnv, hasServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { profileSchema, userDraftSchema } from "@/lib/validators/profile";

export type ActionResult =
  | { ok: true; temporaryPassword?: string; nationalId?: string }
  | { ok: false; error: string };

const notReady: ActionResult = {
  ok: false,
  error: "مشروع سوبربيز للتطوير غير مربوط بعد. أضف مفاتيح البيئة ثم أعد التشغيل.",
};

async function actorClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, userId: data.user?.id ?? null };
}

export async function provisionUser(input: unknown): Promise<ActionResult> {
  if (!hasServerEnv()) return notReady;
  const parsed = userDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "برجاء مراجعة البيانات المدخلة" };
  const draft = parsed.data;
  const password = draft.method === "random_password" ? generatePassword() : draft.password;
  if (draft.method !== "invitation" && !isStrongPassword(password ?? "")) {
    return { ok: false, error: "كلمة المرور يجب ألا تقل عن 10 أحرف" };
  }

  const { supabase, userId } = await actorClient();
  if (!userId) return { ok: false, error: "غير مسموح لك بهذا الإجراء" };
  const allowed = await supabase.rpc("assert_can_provision", { p_role: draft.role });
  if (allowed.error) return { ok: false, error: arabicError(allowed.error) };

  const admin = createAdminClient();
  const existing = await admin
    .from("account_provisions")
    .select("consumed_at")
    .eq("email", draft.email)
    .maybeSingle();
  if (existing.data?.consumed_at) return { ok: false, error: "هذا البريد مسجّل بالفعل" };
  const provision = existing.data
    ? await admin
        .from("account_provisions")
        .update({
          role: draft.role,
          must_change_password: draft.method !== "invitation",
          created_by: userId,
        })
        .eq("email", draft.email)
    : await admin.from("account_provisions").insert({
        email: draft.email,
        role: draft.role,
        must_change_password: draft.method !== "invitation",
        created_by: userId,
      });
  if (provision.error) return { ok: false, error: arabicError(provision.error) };

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const created =
    draft.method === "invitation"
      ? await admin.auth.admin.inviteUserByEmail(draft.email, {
          redirectTo: `${site}/reset-password`,
          data: { full_name: draft.fullName },
        })
      : await admin.auth.admin.createUser({
          email: draft.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: draft.fullName },
        });

  if (created.error || !created.data.user) {
    await admin.from("account_provisions").delete().eq("email", draft.email).is("consumed_at", null);
    return { ok: false, error: arabicError(created.error) };
  }

  const named = await supabase.rpc("update_user_name", {
    user_id: created.data.user.id,
    full_name: draft.fullName,
  });
  const audited = await supabase.rpc("provision_user_audit", {
    user_id: created.data.user.id,
    method: draft.method,
  });
  if (named.error || audited.error) {
    return { ok: false, error: arabicError(named.error ?? audited.error) };
  }
  return draft.method === "invitation" ? { ok: true } : { ok: true, temporaryPassword: password };
}

export async function renameUser(userId: string, fullName: string): Promise<ActionResult> {
  if (!hasServerEnv()) return notReady;
  const { supabase } = await actorClient();
  const { error } = await supabase.rpc("update_user_name", { user_id: userId, full_name: fullName });
  return error ? { ok: false, error: arabicError(error) } : { ok: true };
}

export async function changeUserRole(userId: string, role: "admin" | "sales"): Promise<ActionResult> {
  if (!hasServerEnv()) return notReady;
  const { supabase } = await actorClient();
  const { error } = await supabase.rpc("set_user_role", { user_id: userId, role });
  return error ? { ok: false, error: arabicError(error) } : { ok: true };
}

export async function changeUserStatus(userId: string, status: "active" | "inactive"): Promise<ActionResult> {
  if (!hasServerEnv()) return notReady;
  const { supabase } = await actorClient();
  const { error } = await supabase.rpc("set_user_status", { user_id: userId, status });
  if (error) return { ok: false, error: arabicError(error) };
  if (status === "inactive") {
    const admin = createAdminClient();
    await admin.auth.admin.signOut(userId, "global");
  }
  return { ok: true };
}

export async function resetUserPassword(
  userId: string,
  method: "reset_link" | "random_temporary" | "custom_temporary",
  email: string,
  customPassword?: string,
): Promise<ActionResult> {
  if (!hasServerEnv()) return notReady;
  const password = method === "random_temporary" ? generatePassword() : customPassword;
  if (method !== "reset_link" && !isStrongPassword(password ?? "")) {
    return { ok: false, error: "كلمة المرور يجب ألا تقل عن 10 أحرف" };
  }
  const admin = createAdminClient();
  if (method === "reset_link") {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo: `${site}/reset-password` });
    if (error) return { ok: false, error: arabicError(error) };
  } else {
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return { ok: false, error: arabicError(error) };
  }
  const { supabase } = await actorClient();
  const { error } = await supabase.rpc("audit_password_action", { user_id: userId, action: method });
  if (error) return { ok: false, error: arabicError(error) };
  await admin.auth.admin.signOut(userId, "global");
  return method === "reset_link" ? { ok: true } : { ok: true, temporaryPassword: password };
}

export async function revealUserNationalId(userId: string): Promise<ActionResult> {
  if (!hasServerEnv()) return notReady;
  const { supabase } = await actorClient();
  const { data, error } = await supabase.rpc("reveal_national_id", { user_id: userId });
  if (error || typeof data !== "string") return { ok: false, error: arabicError(error) };
  const env = getServerEnv();
  return { ok: true, nationalId: decryptNationalId(data, env.NATIONAL_ID_ENCRYPTION_KEY) };
}

export async function saveOwnProfile(input: unknown): Promise<ActionResult> {
  if (!hasServerEnv()) return notReady;
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "برجاء مراجعة البيانات المدخلة" };
  const env = getServerEnv();
  const { supabase } = await actorClient();
  const { error } = await supabase.rpc("complete_own_profile", {
    p_full_name: parsed.data.fullName,
    p_phone: parsed.data.phone,
    p_address: parsed.data.address,
    p_national_id_encrypted: encryptNationalId(parsed.data.nationalId, env.NATIONAL_ID_ENCRYPTION_KEY),
    p_national_id_hash: hashNationalId(parsed.data.nationalId, env.NATIONAL_ID_HASH_KEY),
    p_national_id_masked: maskNationalId(parsed.data.nationalId),
  });
  return error ? { ok: false, error: arabicError(error) } : { ok: true };
}

export async function finishForcedPasswordChange(): Promise<ActionResult> {
  if (!hasPublicEnvSafe()) return notReady;
  const { supabase } = await actorClient();
  const { error } = await supabase.rpc("complete_password_change");
  if (error) return { ok: false, error: arabicError(error) };
  await supabase.auth.signOut({ scope: "others" });
  return { ok: true };
}

export async function markNoticeRead(id: string): Promise<ActionResult> {
  if (!hasPublicEnvSafe()) return notReady;
  const { supabase } = await actorClient();
  const { error } = await supabase.rpc("mark_notification_read", { notification_id: id });
  return error ? { ok: false, error: arabicError(error) } : { ok: true };
}

function hasPublicEnvSafe() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
