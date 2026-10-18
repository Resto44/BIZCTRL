// Display preferences never grant permissions or alter financial balances.
const messages = {
 copyLink: ['Copy link','نسخ الرابط','کاپی لینک'],
 shareLink: ['Share','مشاركة','اشتراک‌گذاری'],
 copied: ['Link copied.','تم نسخ الرابط.','لینک کاپی شد.'],
 copyManually: ['Automatic copying is unavailable. The full link is selected; press and hold it and choose Copy.','تعذر النسخ التلقائي. تم تحديد الرابط كاملًا؛ اضغط مطولًا واختر نسخ.','کاپی خودکار ممکن نشد. تمام لینک انتخاب شده؛ روی آن نگه دار و کاپی را انتخاب کن.'],
 title: ['Partner Treasury','خزينة الشركاء','خزانه شریک‌ها'],
 portal: ['Partner dashboard','لوحة الشريك','داشبورد شریک'],
 partners: ['Partners','الشركاء','شریک‌ها'],
 legacy: ['Unassigned legacy records','السجلات السابقة غير المعينة','سوابق قبلی بدون شریک'],
 custody: ['Branch custody settlements','تسويات أمانات الفروع','تسویه پول شعبه‌ها'],
 help: ['Separate accounts for each business partner. Advances and repayments are not sales, expenses, or equity.','حساب مستقل لكل شريك. السلف والسداد ليست مبيعات أو مصروفات أو رأس مال.','حساب هر شریک جداست. قرض و بازپرداخت، فروشات، مصارف یا سرمایه نیست.'],
 name: ['Partner name','اسم الشريك','نام شریک'], email: ['Email','البريد الإلكتروني','ایمیل'],
 add: ['Create partner account','إنشاء حساب شريك','ایجاد حساب شریک'],
 save: ['Save','حفظ','ذخیره'], edit: ['Edit','تعديل','ویرایش'], cancel: ['Cancel','إلغاء','لغو'],
 invite: ['Create / renew activation link','إنشاء / تجديد رابط التفعيل','ایجاد / تمدید لینک فعال‌سازی'],
 inviteHelp: ['Copy this private link for your partner. It expires in 7 days; renewing invalidates the previous link.','انسخ الرابط الخاص للشريك. ينتهي خلال 7 أيام ويلغي التجديد الرابط السابق.','این لینک خصوصی را برای شریک کاپی کنید. اعتبار آن ۷ روز است؛ تمدید، لینک قبلی را باطل می‌کند.'],
 active: ['Active','نشط','فعال'], inactive: ['Inactive','غير نشط','غیرفعال'],
 linked: ['Login activated','تم تفعيل الدخول','ورود فعال شده'], pending: ['Awaiting activation','بانتظار التفعيل','در انتظار فعال‌سازی'],
 empty: ['Create a partner to begin. Existing records remain in the legacy ledger.','أنشئ شريكًا للبدء. تبقى السجلات السابقة في الدفتر القديم.','برای شروع شریک ایجاد کنید. سوابق قبلی در دفتر جدا باقی می‌ماند.'],
 failed: ['Unable to complete the request. Retry.','تعذر إكمال الطلب. أعد المحاولة.','درخواست انجام نشد. دوباره تلاش کنید.'],
 limit: ['User limit reached. Review your subscription.','تم بلوغ حد المستخدمين. راجع الاشتراك.','ظرفیت کاربران تکمیل است. اشتراک را بررسی کنید.'],
 duplicate: ['This email already has a partner account in this business.','يوجد حساب شريك بهذا البريد في المنشأة.','این ایمیل در این کسب‌وکار حساب شریک دارد.'],
 invalidInvite: ['The invitation is expired, disabled, or does not match your verified email. Ask the owner for a new link.','الدعوة منتهية أو معطلة أو لا تطابق بريدك المؤكد. اطلب رابطًا جديدًا من المالك.','دعوت منقضی یا غیرفعال است، یا با ایمیل تأییدشده شما مطابقت ندارد. از اونر لینک جدید بگیرید.'],
 denied: ['This partner account is unavailable or access has been disabled.','الحساب غير متاح أو تم إيقاف الوصول.','این حساب شریک در دسترس نیست یا دسترسی غیرفعال شده است.'],
 loading: ['Loading…','جارٍ التحميل…','در حال بارگذاری…'], refresh: ['Refresh','تحديث','تازه‌سازی'],
 signIn: ['Sign in','تسجيل الدخول','ورود'], signUp: ['Create login','إنشاء دخول','ایجاد ورود'], signOut: ['Sign out','تسجيل الخروج','خروج'],
 password: ['Password (at least 10 characters)','كلمة المرور (10 أحرف على الأقل)','رمز عبور (حداقل ۱۰ حرف)'],
 verify: ['Verify your email, then return to this page and sign in to activate your partner account.','أكد بريدك ثم عد لهذه الصفحة وسجل الدخول لتفعيل حساب الشريك.','ایمیل خود را تأیید کنید؛ سپس به همین صفحه برگردید و برای فعال‌سازی حساب شریک وارد شوید.'],
 accept: ['Activate invited account','تفعيل الحساب المدعو','فعال‌سازی حساب دعوت‌شده'],
 accountHelp: ['Use the email assigned by your owner. New logins require an activation link.','استخدم البريد المحدد من المالك. الدخول الجديد يتطلب رابط تفعيل.','از ایمیلی استفاده کنید که اونر تعیین کرده است. ورود جدید به لینک فعال‌سازی نیاز دارد.'],
 noAccounts: ['No active partner account is linked to this login. Ask the business owner for an invitation.','لا يوجد حساب شريك نشط مرتبط بهذا الدخول. اطلب دعوة من المالك.','هیچ حساب شریک فعال به این ورود وصل نیست. از اونر دعوت بگیرید.'],
 ownerOwes: ['Owner owes partner','المستحق للشريك على المالك','بدهی اونر به شریک'],
 partnerOwes: ['Partner owes owner','المستحق للمالك على الشريك','بدهی شریک به اونر'],
 sponsor_advance_to_owner: ['Partner advanced to owner','سلفة الشريك للمالك','شریک به اونر قرض داد'],
 owner_repay_sponsor: ['Owner repaid partner','سداد المالك للشريك','اونر به شریک بازپرداخت کرد'],
 owner_advance_to_sponsor: ['Owner advanced to partner','سلفة المالك للشريك','اونر به شریک قرض داد'],
 sponsor_repay_owner: ['Partner repaid owner','سداد الشريك للمالك','شریک به اونر بازپرداخت کرد'],
 cash: ['Cash','نقدي','کاش / نقدی'], network: ['Network / bank','شبكة / بنك','شبکه / بانک'],
 confirm: ['I confirm this transaction','أؤكد صحة هذه المعاملة','این معامله را تأیید می‌کنم'],
 confirmed: ['Confirmed by partner','مؤكد من الشريك','تأییدشده توسط شریک'],
 confirmationHelp: ['Confirm only transfers you recognize. Confirmation does not create another Treasury movement. Contact the owner if a record is incorrect.','أكد التحويلات التي تعرفها فقط. التأكيد لا ينشئ حركة خزينة جديدة. تواصل مع المالك عند وجود خطأ.','فقط انتقال‌هایی را تأیید کنید که می‌شناسید. تأیید، حرکت خزانه جدید ایجاد نمی‌کند. اگر سند اشتباه است با اونر تماس بگیرید.'],
 records: ['Transactions','المعاملات','معاملات'], noRecords: ['No posted transactions.','لا توجد معاملات مرحلة.','معامله قطعی ثبت نشده است.'],
 previous: ['Previous','السابق','قبلی'], next: ['Next','التالي','بعدی'],
 customize: ['Customize dashboard','تخصيص اللوحة','تنظیم داشبورد'],
 customTitle: ['Your dashboard title','عنوان لوحتك','عنوان داشبورد شما'],
 showBalances: ['Show balance cards','إظهار بطاقات الرصيد','نمایش کارت‌های مانده'],
 compact: ['Compact records','سجلات مضغوطة','نمایش فشرده اسناد'],
 preferencesHelp: ['Display choices are saved for this login on this device.','تُحفظ خيارات العرض لهذا الدخول على هذا الجهاز.','تنظیمات نمایش برای این ورود در همین دستگاه ذخیره می‌شود.'],
 allTime: ['Balances include all posted transactions, separately by currency.','الأرصدة تشمل جميع القيود المرحلة لكل عملة على حدة.','مانده‌ها شامل تمام معاملات قطعی، جداگانه برای هر ارز است.'],
};
export const partnerText = (lang='en') => Object.fromEntries(Object.entries(messages).map(([k,v])=>[k,v[lang==='ar'?1:lang==='fa'?2:0]]));
export function partnerError(error,t) {
 const message=String(error?.message||'');
 if(message.includes('SUBSCRIPTION_LIMIT'))return t.limit;
 if(message.includes('INVITATION')||message.includes('IDENTITY_MISMATCH'))return t.invalidInvite;
 if(message.includes('ACCESS_DENIED')||message.includes('OWNER_ONLY'))return t.denied;
 if(error?.code==='23505')return t.duplicate;
 return t.failed;
}
export function partnerRows(rows,partnerId) { return rows.filter(row=>(row.partner_id||null)===(partnerId||null)); }
export function readPartnerPreferences(userId,tenant='portal') {
 try { const p=JSON.parse(localStorage.getItem(`partner-view:${userId}:${tenant}`)||'{}');
 return {title:typeof p.title==='string'?p.title.slice(0,80):'',compact:p.compact===true,showBalances:p.showBalances!==false};
 } catch {return {title:'',compact:false,showBalances:true};}
}
