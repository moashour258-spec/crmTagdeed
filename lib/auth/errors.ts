export function arabicError(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message ?? "";
  if (message.includes("password_too_short") || message.includes("Password should be at least")) {
    return "كلمة المرور يجب ألا تقل عن 10 أحرف";
  }
  if (message.includes("last_admin")) return "لا يمكن تعطيل آخر مدير نشط";
  if (message.includes("super_admin_immutable")) return "لا يمكن تعديل المدير العام";
  if (message.includes("Invalid login credentials")) return "البريد أو كلمة المرور غير صحيحة";
  if (message.includes("already registered") || message.includes("already been registered")) {
    return "هذا البريد مسجّل بالفعل";
  }
  if (message.includes("signup_not_provisioned")) return "هذا البريد غير مدعو";
  if (message.includes("invalid_phone")) return "رقم الهاتف غير صحيح";
  if (message.includes("invalid_national_id")) return "الرقم القومي غير صحيح";
  if (message.includes("invalid_name") || message.includes("invalid_address")) {
    return "برجاء مراجعة البيانات المدخلة";
  }
  if (message.includes("not_found")) return "السجل غير موجود";
  if (message.includes("forbidden") || message.includes("not_active") || error?.code === "42501") {
    return "غير مسموح لك بهذا الإجراء";
  }
  return "حدث خطأ، حاول مرة أخرى";
}
