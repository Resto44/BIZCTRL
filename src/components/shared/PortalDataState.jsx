import React from 'react';
import {useLanguage} from '@/lib/LanguageContext';
import {Button} from '@/components/ui/button';
const COPY={
 en:{error:'Data could not be loaded. Totals and actions are unavailable until the complete data is loaded.',loading:'Loading portal data…',retry:'Retry',missing:'No linked profile was found. Ask your organization owner to check your portal assignment.'},
 fa:{error:'اطلاعات بارگذاری نشد. تا بارگذاری کامل، مجموع‌ها و عملیات در دسترس نیست.',loading:'در حال بارگذاری اطلاعات پورتل…',retry:'تلاش دوباره',missing:'پروفایل مرتبط پیدا نشد. از مالک بخواهید اتصال حساب پورتل را بررسی کند.'},
 ar:{error:'تعذر تحميل البيانات. الإجماليات والإجراءات غير متاحة حتى اكتمال التحميل.',loading:'جارٍ تحميل بيانات البوابة…',retry:'إعادة المحاولة',missing:'لم يتم العثور على ملف مرتبط. اطلب من المالك مراجعة ربط حساب البوابة.'},
};
export default function PortalDataState({loading=false,missing=false,onRetry=undefined}){
 const {lang}=useLanguage();const t=COPY[lang]||COPY.en;
 return <div role={loading?'status':'alert'} className="mx-auto my-6 max-w-2xl rounded-xl border bg-background p-6 text-foreground"><p>{loading?t.loading:missing?t.missing:t.error}</p>{!loading&&onRetry&&<Button className="mt-3" onClick={onRetry}>{t.retry}</Button>}</div>;
}
