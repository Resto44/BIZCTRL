// Public product link only: never share the authenticated URL, tenant or tokens.
export const SAAS_SHARE_URL = 'https://mybizctrl.site/?share=erp-v4';
export const SAAS_SHARE_IMAGE = '/share/bizctrl-erp-v4.png';
export const SAAS_SHARE_COPY = {
  en: { title: 'Share BizCTRL', hint: 'Introduce BizCTRL with your own message.', message: 'Manage sales, inventory, expenses and customer credit with BizCTRL — your business ERP in one place.', label: 'Your message', copy: 'Copy link', copied: 'Link copied', failed: 'Copy unavailable. Select and copy the link below.', whatsapp: 'Share on WhatsApp', note: 'Only the public product link is shared. Your business records stay private.' },
  fa: { title: 'اشتراک بیـزکنترول', hint: 'بیـزکنترول را با پیام خودتان معرفی کنید.', message: 'فروش، موجودی، مصارف و قرض مشتریان را با بیـزکنترول مدیریت کنید؛ سیستم ERP کسب‌وکار شما در یک‌جا.', label: 'پیام شما', copy: 'کپی لینک', copied: 'لینک کپی شد', failed: 'کپی خودکار ممکن نشد. لینک زیر را انتخاب و کپی کنید.', whatsapp: 'اشتراک در واتس‌اپ', note: 'فقط لینک عمومی سیستم شریک می‌شود؛ اطلاعات کسب‌وکار شما خصوصی می‌ماند.' },
  ar: { title: 'مشاركة BizCTRL', hint: 'عرّف الآخرين على BizCTRL برسالتك الخاصة.', message: 'أدر المبيعات والمخزون والمصروفات وذمم العملاء مع BizCTRL؛ نظام ERP لأعمالك في مكان واحد.', label: 'رسالتك', copy: 'نسخ الرابط', copied: 'تم نسخ الرابط', failed: 'تعذّر النسخ التلقائي. حدد الرابط أدناه وانسخه.', whatsapp: 'مشاركة عبر واتساب', note: 'تتم مشاركة رابط المنصة العام فقط؛ تبقى بيانات أعمالك خاصة.' },
};
export function whatsappShareHref(message) {
  return `https://wa.me/?text=${encodeURIComponent([message.trim(), SAAS_SHARE_URL].filter(Boolean).join('\n\n'))}`;
}
