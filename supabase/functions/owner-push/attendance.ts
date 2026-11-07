const labels: Record<string, Record<string,string>> = {
 en:{check_in:'Employee checked in',check_out:'Employee checked out',absent:'Employee marked absent',present:'Attendance corrected to present',missing_check_in:'No check-in recorded — review needed',test:'Attendance push test'},
 ar:{check_in:'تم تسجيل دخول الموظف',check_out:'تم تسجيل خروج الموظف',absent:'تم تسجيل غياب الموظف',present:'تم تصحيح الحضور إلى حاضر',missing_check_in:'لم يُسجل الدخول — يلزم التحقق',test:'اختبار إشعار الحضور'},
 fa:{check_in:'ورود کارمند ثبت شد',check_out:'خروج کارمند ثبت شد',absent:'غیابت کارمند ثبت شد',present:'حاضری به حاضر اصلاح شد',missing_check_in:'ورود ثبت نشده — نیاز به بررسی',test:'آزمایش پوش حاضری'},
};
export function renderAttendanceNotification(event: any, business: any, branch: any, language: string) {
 if(event.entity!=='attendance_alert')return null;
 const words=labels[language]||labels.en;
 const label=words[event.context?.attendance_kind]||words.missing_check_in;
 let time='';const timestamp=event.context?.occurred_at||event.created_at;
 if(timestamp&&Number.isFinite(Date.parse(timestamp)))time=new Intl.DateTimeFormat(language in labels?language:'en',{timeZone:'Asia/Riyadh',dateStyle:'short',timeStyle:'short'}).format(new Date(timestamp));
 return {title:`${business?.name||'BizCTRL'} · ${label}`.slice(0,100),body:[event.context?.employee_name||event.reference,branch?.name,time].filter(Boolean).join('\n').slice(0,350)};
}
