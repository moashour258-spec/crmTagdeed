"use server";

import {
  changeUserRole,
  changeUserStatus,
  provisionUser,
  renameUser,
  resetUserPassword,
  revealUserNationalId,
} from "@/lib/auth/admin-users";

export async function provisionUserAction(input: unknown) {
  return provisionUser(input);
}

export async function renameUserAction(userId: string, fullName: string) {
  return renameUser(userId, fullName);
}

export async function changeRoleAction(userId: string, role: "admin" | "sales") {
  return changeUserRole(userId, role);
}

export async function changeStatusAction(userId: string, status: "active" | "inactive") {
  return changeUserStatus(userId, status);
}

export async function resetPasswordAction(
  userId: string,
  method: "reset_link" | "random_temporary" | "custom_temporary",
  email: string,
  customPassword?: string,
) {
  return resetUserPassword(userId, method, email, customPassword);
}

export async function revealNationalIdAction(userId: string) {
  return revealUserNationalId(userId);
}
