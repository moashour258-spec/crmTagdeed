export function arabicError(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message ?? "";
  if (message.includes("password_too_short") || message.includes("Password should be at least")) {
    return "كلمة المرور يجب ألا تقل عن 10 أحرف";
  }
  if (message.includes("last_admin")) return "لا يمكن تعطيل آخر مدير نشط";
  if (message.includes("super_admin_immutable")) return "لا يمكن تعديل المدير العام";
  if (message.includes("Invalid login credentials")) return "البريد أو كلمة المرور غير صحيحة";
  if (
    message.includes("Email logins are disabled") ||
    message.includes("email_provider_disabled") ||
    error?.code === "email_provider_disabled"
  ) {
    return "تسجيل الدخول بالبريد غير مفعّل حالياً. تواصل مع المدير.";
  }
  if (
    message.includes("Database error creating new user") ||
    message.includes("unexpected_failure") ||
    error?.code === "unexpected_failure"
  ) {
    return "تعذر إنشاء الحساب. تحقق من البريد وحاول مرة أخرى.";
  }
  if (
    message.includes("products_store_id_fkey") ||
    (message.includes("store_id") && message.includes("foreign key"))
  ) {
    return "اختر مخزنًا صالحًا أو أضف مخزنًا من صفحة المخازن";
  }
  if (message.includes("products_category_id_fkey")) {
    return "اختر فئة صالحة من القائمة";
  }
  if (message.includes("product_needs_image")) return "ارفع صورة واحدة على الأقل قبل التفعيل";
  if (message.includes("product_not_deletable")) return "لا يمكن حذف منتج محجوز أو مباع";
  if (message.includes("product_has_sales")) return "المنتج مرتبط بعمليات بيع، عطّله بدل الحذف";
  if (message.includes("product_not_activatable")) return "لا يمكن تفعيل منتج محجوز أو مباع";
  if (message.includes("unit_unavailable")) return "المنتج غير متاح للبيع حاليًا";
  if (message.includes("customer_required")) return "اسم العميل ورقم هاتفه مطلوبان";
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
  const belowMinimum = message.match(/price_below_minimum:([^0-9]*)/);
  if (belowMinimum) {
    const name = belowMinimum[1].replace(/[0-9.]/g, "").trim();
    return name ? `سعر «${name}» أقل من الحد المسموح` : "السعر أقل من الحد المسموح";
  }
  if (message.includes("unit_unavailable")) return "القطعة غير متاحة الآن";
  if (message.includes("reservation_cap")) return "وصلت للحد الأقصى للحجوزات النشطة";
  if (message.includes("set_partially_sold")) return "لا يمكن بيع الطقم كاملًا بعد بيع قطعة منه";
  if (message.includes("invalid_payment_method")) return "طريقة الدفع غير معروفة";
  if (message.includes("customer_required")) return "اسم العميل ورقم هاتفه مطلوبان";
  if (message.includes("payment_out_of_range")) return "المبلغ يجعل الصافي خارج إجمالي الفاتورة";
  if (message.includes("future_payment_date")) return "تاريخ الدفع لا يمكن أن يكون في المستقبل";
  if (message.includes("refund_required")) return "المدفوع أكبر من الإجمالي الجديد، وسجّل مبلغ الاسترداد";
  if (message.includes("refund_amount_mismatch")) return "مبلغ الاسترداد لا يساوي الزيادة";
  if (message.includes("sale_payments_append_only")) return "إيصالات الدفع لا تُعدّل ولا تُحذف";
  if (message.includes("override_required")) return "الفاتورة لم تُحصّل بالكامل، واكتب سبب الاعتماد";
  if (message.includes("sale_cancelled")) return "لا يمكن اعتماد عمولة فاتورة ملغاة";
  if (message.includes("commission_not_pending")) return "هذه العمولة ليست قيد الاعتماد";
  if (message.includes("nothing_to_pay")) return "لا توجد عمولات معتمدة لهذا الموظف";
  if (message.includes("negative_payout")) return "الاستردادات أكبر من العمولات المعتمدة، ويُرحّل الفرق";
  if (message.includes("no_matches")) return "لا توجد قطع مطابقة لهذا التعديل";
  if (message.includes("already_undone")) return "تم التراجع عن هذه الدفعة من قبل";
  if (message.includes("invalid_commission") || message.includes("invalid_bonus")) return "قيمة العمولة أو البونص غير صحيحة";
  if (message.includes("filters_required")) return "حدد قطعاً أو مرشحاً قبل التطبيق";
  if (message.includes("bonus_scope_required")) return "البونص يحتاج نطاقاً: سعراً أو قطعة أو فئة أو مخزناً";
  if (message.includes("plan_total_mismatch")) return "مجموع الأقساط يجب أن يساوي إجمالي الفاتورة";
  if (message.includes("forbidden") || message.includes("not_active") || error?.code === "42501") {
    return "غير مسموح لك بهذا الإجراء";
  }
  return "حدث خطأ، حاول مرة أخرى";
}
