"use server";

import { finishForcedPasswordChange, markNoticeRead, saveOwnProfile } from "@/lib/auth/admin-users";

export async function completeProfileAction(input: unknown) {
  return saveOwnProfile(input);
}

export async function finishPasswordAction() {
  return finishForcedPasswordChange();
}

export async function markNoticeAction(id: string) {
  return markNoticeRead(id);
}
