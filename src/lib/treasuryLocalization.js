export const treasuryMessages = {
  "Branch Settlement Overview": {
    "en": "Branch Settlement Overview",
    "fa": "نمای کلی تسویهٔ شعبه‌ها",
    "ar": "نظرة عامة على تسويات الفروع"
  },
  "+ Record Transfer": {
    "en": "+ Record Transfer",
    "fa": "+ ثبت انتقال",
    "ar": "+ تسجيل تحويل"
  },
  "Total Held by Owner": {
    "en": "Total Held by Owner",
    "fa": "مجموع موجودی نزد مالک",
    "ar": "إجمالي الرصيد لدى المالك"
  },
  "Across all branches": {
    "en": "Across all branches",
    "fa": "در تمام شعبه‌ها",
    "ar": "عبر جميع الفروع"
  },
  "Active Branches": {
    "en": "Active Branches",
    "fa": "شعبه‌های فعال",
    "ar": "الفروع النشطة"
  },
  "With settlement history": {
    "en": "With settlement history",
    "fa": "دارای سابقهٔ تسویه",
    "ar": "لديها سجل تسويات"
  },
  "Remaining w/ Owner": {
    "en": "Remaining w/ Owner",
    "fa": "باقی‌مانده نزد مالک",
    "ar": "المتبقي لدى المالك"
  },
  "Sent to Owner": {
    "en": "Sent to Owner",
    "fa": "ارسال‌شده به مالک",
    "ar": "المُرسل إلى المالك"
  },
  "Owner Spent": {
    "en": "Owner Spent",
    "fa": "مصارف و مبالغ برگشتی مالک",
    "ar": "مصروفات المالك والمبالغ المعادة"
  },
  "Balance": {
    "en": "Balance",
    "fa": "مانده",
    "ar": "الرصيد"
  },
  "Settlement History": {
    "en": "Settlement History",
    "fa": "سابقهٔ تسویه",
    "ar": "سجل التسويات"
  },
  "Sent →": {
    "en": "Sent →",
    "fa": "ارسال‌شده",
    "ar": "مُرسل"
  },
  "← Returned": {
    "en": "← Returned",
    "fa": "برگشت‌شده",
    "ar": "مُعاد"
  },
  "Owner Expense": {
    "en": "Owner Expense",
    "fa": "مصارف مالک",
    "ar": "مصروفات المالك"
  },
  "Owner Expenses": {
    "en": "Owner Expenses",
    "fa": "مصارف مالک",
    "ar": "مصروفات المالك"
  },
  "Remaining": {
    "en": "Remaining",
    "fa": "باقی‌مانده",
    "ar": "المتبقي"
  },
  "Branch Settlement Comparison": {
    "en": "Branch Settlement Comparison",
    "fa": "مقایسهٔ تسویهٔ شعبه‌ها",
    "ar": "مقارنة تسويات الفروع"
  },
  "Monthly Settlement Statements": {
    "en": "Monthly Settlement Statements",
    "fa": "صورت‌حساب ماهانهٔ تسویه",
    "ar": "كشوف التسوية الشهرية"
  },
  "No settlement activity for this month": {
    "en": "No settlement activity for this month",
    "fa": "در این ماه تسویه‌ای ثبت نشده است",
    "ar": "لا توجد تسويات لهذا الشهر"
  },
  "Opening Balance": {
    "en": "Opening Balance",
    "fa": "ماندهٔ آغاز دوره",
    "ar": "الرصيد الافتتاحي"
  },
  "+ Sent to Owner": {
    "en": "+ Sent to Owner",
    "fa": "+ ارسال‌شده به مالک",
    "ar": "+ المُرسل إلى المالك"
  },
  "– Owner Spending": {
    "en": "– Owner Spending",
    "fa": "– مصارف و برگشت از مالک",
    "ar": "– مصروفات المالك والمبالغ المعادة"
  },
  "Closing Balance": {
    "en": "Closing Balance",
    "fa": "ماندهٔ پایان دوره",
    "ar": "الرصيد الختامي"
  },
  "Owner spending and returns exceed the amount received.": {
    "en": "Owner spending and returns exceed the amount received.",
    "fa": "مصارف و مبالغ برگشتی مالک از مبلغ دریافتی بیشتر است.",
    "ar": "مصروفات المالك والمبالغ المعادة تتجاوز المبلغ المستلم."
  },
  "Each branch’s balance held by the owner is an operating balance, not additional profit.": {
    "en": "Each branch’s balance held by the owner is an operating balance, not additional profit.",
    "fa": "ماندهٔ هر شعبه نزد مالک موجودی عملیاتی است، نه سود جدید.",
    "ar": "رصيد كل فرع لدى المالك رصيد تشغيلي، وليس ربحاً إضافياً."
  }
};
export function treasuryText(source, language) {
  return treasuryMessages[source]?.[language] || treasuryMessages[source]?.en || source;
}
