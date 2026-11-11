import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCopy, Link2, Mail, RefreshCw, Search, ShieldCheck, UserRound, XCircle } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { customerPortalRpc } from '@/lib/customerPortal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const COPY = {
 en: {
  title:'Customer access approvals',help:'Approve an existing customer for their own portal. This is not an ERP staff role.',
  search:'Search customer name, email or phone',find:'Search',list:'Select an existing customer',count:'matching customers',
  all:'All',pending:'Pending activation',activated:'Activated',other:'Other',none:'No customers matched this scope. Add a customer in Customer Management first.',
  select:'Select customer',email:'Customer email for invitation',approve:'Approve & invite customer',renew:'Renew invitation',revoke:'Revoke portal access',confirm:'Confirm revoke',cancel:'Cancel',
  pendingHelp:'Approval creates a single-use 7-day link. The customer must sign in with the same verified email and activate it. The invite alone does not grant access.',
  activeHelp:'Access is active. Revoking removes customer portal access without deleting invoices, payments or the customer record.',
  expired:'Expired',revoked:'Revoked',not_invited:'Not invited',copy:'Copy link',share:'Share link',copied:'Link copied.',
  emailAccepted:'Email service accepted the invitation; inbox delivery is not confirmed.',emailFailed:'Email sending failed. You can copy or share the valid link.',
  retryEmail:'Retry email',success:'Customer invitation created. The previous pending link (if any) is replaced.',
  revokedSuccess:'Customer portal access revoked. No financial records were changed.',failed:'Request failed. Check your owner access, email and customer scope.',
  loadError:'Could not load customer access statuses. Retry.',refresh:'Refresh customers',missingEmail:'Enter a valid customer email first.',
  showLimited:'Only the first 100 matching customers are shown. Search to locate others.',branch:'Branch',businessWide:'All branches',chooseBranch:'Choose a branch above to manage customer access.',
  instruction:'Owner approval is separate from email verification. An invitation does not immediately activate a portal.',
  awaiting:'Pending activation',active:'Activated'
 },
 ar: {
  title:'اعتمادات دخول العملاء',help:'اعتمد عميلاً موجوداً لبوابته الخاصة، وليس كموظف في نظام ERP.',
  search:'ابحث باسم العميل أو البريد أو الهاتف',find:'بحث',list:'اختر عميلاً مسجلاً',count:'عميل مطابق',
  all:'الكل',pending:'بانتظار التفعيل',activated:'مفعّل',other:'أخرى',none:'لا يوجد عملاء مطابقون. أضف العميل أولاً من إدارة العملاء.',
  select:'اختر العميل',email:'البريد الإلكتروني للدعوة',approve:'اعتماد العميل وإرسال الدعوة',renew:'تجديد الدعوة',revoke:'إلغاء دخول العميل',confirm:'تأكيد الإلغاء',cancel:'إلغاء',
  pendingHelp:'ينشئ الاعتماد رابطاً يستخدم مرة واحدة وصالحاً ٧ أيام. يجب على العميل تأكيد البريد ثم تسجيل الدخول وتفعيل الرابط.',
  activeHelp:'الوصول مفعّل. الإلغاء يوقف دخول بوابة العميل ولا يحذف الفواتير أو المدفوعات.',
  expired:'منتهية',revoked:'ملغاة',not_invited:'لم يُدعَ',copy:'نسخ الرابط',share:'مشاركة الرابط',copied:'تم نسخ الرابط.',
  emailAccepted:'قبل مزوّد البريد إرسال الدعوة، لكن وصولها إلى الصندوق غير مؤكّد.',emailFailed:'فشل إرسال البريد. يمكنك نسخ الرابط أو مشاركته.',
  retryEmail:'إعادة إرسال البريد',success:'تم إنشاء دعوة العميل. الرابط المعلّق السابق، إن وجد، لم يعد صالحاً.',
  revokedSuccess:'أُلغي دخول العميل دون تغيير أي سجل مالي.',failed:'فشل الطلب. تحقق من صلاحية المالك والبريد ونطاق العميل.',
  loadError:'تعذر تحميل حالة العملاء. أعد المحاولة.',refresh:'تحديث العملاء',missingEmail:'أدخل بريداً صحيحاً أولاً.',
  showLimited:'يظهر أول ١٠٠ عميل مطابق فقط. استخدم البحث للعثور على البقية.',branch:'الفرع',businessWide:'جميع الفروع',chooseBranch:'اختر الفرع أولاً لإدارة وصول العملاء.',
  instruction:'اعتماد المالك منفصل عن تأكيد البريد. الدعوة لا تفعّل الحساب مباشرة.',
  awaiting:'بانتظار التفعيل',active:'مفعّل'
 },
 fa: {
  title:'تأیید دسترسی مشتری',help:'مشتری موجود را برای پورتل خودش تأیید کنید؛ این نقش کارمندی ERP نیست.',
  search:'جستجوی نام مشتری، ایمیل یا شماره',find:'جستجو',list:'مشتری موجود را انتخاب کنید',count:'مشتری یافت‌شده',
  all:'همه',pending:'در انتظار فعال‌سازی',activated:'فعال',other:'سایر',none:'مشتری پیدا نشد. اول در مدیریت مشتریان ثبت کنید.',
  select:'انتخاب مشتری',email:'ایمیل دعوت مشتری',approve:'تأیید و دعوت مشتری',renew:'تجدید دعوت‌نامه',revoke:'لغو دسترسی مشتری',confirm:'تأیید لغو',cancel:'انصراف',
  pendingHelp:'پس از تأیید اونر لینک یک‌بارمصرف با اعتبار ۷ روز ساخته می‌شود. مشتری باید با همان ایمیل تأییدشده وارد شده و لینک را فعال کند.',
  activeHelp:'دسترسی فعال است. لغو دسترسی فاکتورها، پرداخت‌ها و ریکوردهای مشتری را حذف نمی‌کند.',
  expired:'منقضی',revoked:'لغوشده',not_invited:'دعوت نشده',copy:'کاپی لینک',share:'اشتراک لینک',copied:'لینک کاپی شد.',
  emailAccepted:'سرویس ایمیل ارسال را پذیرفت؛ رسیدن به Inbox هنوز تأیید نیست.',emailFailed:'ارسال ایمیل ناموفق بود. لینک معتبر را کاپی یا شریک کنید.',
  retryEmail:'ارسال دوبارهٔ ایمیل',success:'دعوت‌نامهٔ مشتری ساخته شد. لینک قبلیِ در انتظار باطل شد.',
  revokedSuccess:'دسترسی پورتل مشتری لغو شد؛ اطلاعات مالی تغییر نکرد.',failed:'درخواست ناموفق بود. صلاحیت اونر، ایمیل و شعبه را بررسی کنید.',
  loadError:'بارگذاری وضعیت مشتریان ناموفق بود. دوباره امتحان کنید.',refresh:'تازه‌سازی مشتریان',missingEmail:'اول یک ایمیل درست وارد کنید.',
  showLimited:'فقط ۱۰۰ مشتری اول نشان داده شده‌اند. برای بقیه جستجو کنید.',branch:'شعبه',businessWide:'همهٔ شعبه‌ها',chooseBranch:'اول شعبه را از بالا انتخاب کنید.',
  instruction:'تأیید اونر و تأیید ایمیل دو مرحلهٔ جدا است. دعوت‌نامه فوراً حساب را فعال نمی‌کند.',
  awaiting:'در انتظار فعال‌سازی',active:'فعال'
 }
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const filters=['all','pending','activated','other'];
const statusFor = (t,status) => ({
 activated:t.active,pending:t.awaiting,expired:t.expired,
 revoked:t.revoked,not_invited:t.not_invited
})[status] || t.not_invited;

export default function CustomerApprovalInvitations({restaurantId,branchId,organizationName}) {
 const {lang}=useLanguage(), t=COPY[lang]||COPY.en;
 const [search,setSearch]=useState(''),[applied,setApplied]=useState(''),[filter,setFilter]=useState('all');
 const [selectedId,setSelectedId]=useState(''),[email,setEmail]=useState('');
 const [link,setLink]=useState(''),[token,setToken]=useState('');
 const [message,setMessage]=useState(''),[emailState,setEmailState]=useState('');
 const [revokeConfirm,setRevokeConfirm]=useState(false);
 const [busy,setBusy]=useState(false),[sending,setSending]=useState(false);
 const enabled=Boolean(restaurantId&&branchId);
 const directory=useQuery({
  queryKey:['customer-approval-directory',restaurantId,branchId,applied],
  enabled,
  queryFn:()=>customerPortalRpc('erp_customer_portal_owner_directory',{
   p_restaurant_id:restaurantId,p_branch_id:branchId,p_search:applied,p_limit:100
  }),
  refetchOnWindowFocus:true,staleTime:15000,retry:1
 });
 const customers=useMemo(()=>Array.isArray(directory.data?.customers)?directory.data.customers:[],[directory.data]);
 const selected=customers.find(c=>c.id===selectedId)||null;
 const visible=customers.filter(c=>filter==='all'||(filter==='other'? !['pending','activated'].includes(c.status):c.status===filter));
 const selectCustomer = c => {
  setSelectedId(c.id);setEmail(c.invited_email||c.email||'');
  setLink('');setToken('');setMessage('');setEmailState('');setRevokeConfirm(false);
 };
 useEffect(()=>{setSelectedId('');setEmail('');setLink('');setToken('');setMessage('');setRevokeConfirm(false);},[restaurantId,branchId]);

 const sendEmail=async(customerId,inviteToken)=>{
  setSending(true);setEmailState('');
  try{
   const {data,error}=await supabase.functions.invoke('customer-portal-invitation-email',{
    body:{customer_id:customerId,token:inviteToken}
   });
   if(error||!data?.provider_accepted)throw error||Error('EMAIL_NOT_ACCEPTED');
   setEmailState('accepted');
  }catch{setEmailState('failed');}
  finally{setSending(false);}
 };
 const issue=async()=>{
  if(!selected||busy||sending||selected.status==='activated')return;
  const address=email.trim().toLowerCase();
  if(!EMAIL.test(address)){setMessage(t.missingEmail);return;}
  setBusy(true);setMessage('');setLink('');setToken('');setEmailState('');setRevokeConfirm(false);
  try{
   const result=await customerPortalRpc('erp_customer_portal_invite',{
    p_customer_id:selected.id,p_email:address,p_revoke:false
   });
   if(!/^[a-f0-9]{64}$/i.test(result?.token||''))throw Error('INVITATION_TOKEN_MISSING');
   const url=window.location.origin+'/customer-portal#invite='+encodeURIComponent(result.token);
   setLink(url);setToken(result.token);setMessage(t.success);
   await sendEmail(selected.id,result.token);
   await directory.refetch();
  }catch{setMessage(t.failed);}
  finally{setBusy(false);}
 };
 const revoke=async()=>{
  if(!selected||!revokeConfirm||busy)return;
  setBusy(true);setMessage('');
  try{
   await customerPortalRpc('erp_customer_portal_invite',{
    p_customer_id:selected.id,p_email:email.trim(),p_revoke:true
   });
   setLink('');setToken('');setEmailState('');setRevokeConfirm(false);
   setMessage(t.revokedSuccess);
   await directory.refetch();
  }catch{setMessage(t.failed);}
  finally{setBusy(false);}
 };
 const copy=async()=>{
  if(!link)return;
  try{await navigator.clipboard.writeText(link);setMessage(t.copied);}
  catch{setMessage(t.failed);}
 };
 const share=async()=>{
  if(!link)return;
  if(typeof navigator.share==='function'){
   try{await navigator.share({title:'BizControl Customer Portal',text:organizationName||'BizControl',url:link});return;}
   catch(e){if(e?.name==='AbortError')return;}
  }
  await copy();
 };
 const safeStatus=selected?.status||'not_invited';
 const existingAccess=safeStatus==='activated';
 const canRevoke=['pending','activated'].includes(safeStatus);
 return <section data-i18n-skip="true" dir={lang==='en'?'ltr':'rtl'} className="min-w-0 space-y-4" aria-label={t.title}>
  <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4 text-sm dark:border-teal-900 dark:bg-teal-950/20">
   <h3 className="flex items-center gap-2 font-black"><ShieldCheck className="size-5 text-teal-700"/>{t.title}</h3>
   <p className="mt-2 leading-relaxed text-slate-600 dark:text-slate-300">{t.help} {t.instruction}</p>
  </div>
  <div className="flex min-w-0 flex-wrap gap-2">
   <Input aria-label={t.search} className="min-w-0 flex-1 basis-44" placeholder={t.search} value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setApplied(search.trim());setSelectedId('');setLink('');}}} maxLength={120}/>
   <Button type="button" variant="outline" disabled={!enabled} onClick={()=>{setApplied(search.trim());setSelectedId('');setLink('');}}><Search className="me-1 size-4"/>{t.find}</Button>
   <Button type="button" variant="outline" aria-label={t.refresh} disabled={directory.isFetching||!enabled} onClick={()=>directory.refetch()}><RefreshCw className="size-4"/></Button>
  </div>
  <div className="space-y-2 rounded-2xl border bg-white p-3 dark:bg-slate-950">
   <p className="text-sm font-bold">{t.list} · {directory.data?.total??'—'} {t.count}</p>
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    {filters.map(key=><Button type="button" key={key} size="sm" className="min-w-0 whitespace-normal" variant={filter===key?'default':'outline'} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{t[key]}</Button>)}
   </div>
   {!enabled?<p role="status" className="p-3 text-sm">{t.chooseBranch}</p>:directory.isPending?<p role="status" className="p-3 text-sm">{'…'}</p>:
    directory.isError?<div role="alert" className="text-sm text-red-700">{t.loadError}<Button type="button" variant="outline" onClick={()=>directory.refetch()}>{t.refresh}</Button></div>:
    <div className="max-h-72 space-y-2 overflow-y-auto">
     {visible.length===0&&<p className="text-sm text-slate-500">{t.none}</p>}
     {visible.map(c=><button key={c.id} type="button" aria-pressed={selected?.id===c.id} disabled={busy||sending} onClick={()=>selectCustomer(c)}
      className={'flex w-full min-w-0 flex-col gap-1 rounded-xl border p-3 text-start transition hover:bg-teal-50 '+(selected?.id===c.id?'border-teal-600 bg-teal-50 dark:bg-teal-950/40':'border-slate-200')}>
      <span className="flex w-full min-w-0 flex-wrap items-center justify-between gap-1">
       <span className="min-w-0 break-words font-bold">{c.name}</span>
       <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{statusFor(t,c.status)}</span>
      </span>
      <span dir="ltr" className="max-w-full break-all text-xs text-slate-500">{c.invited_email||c.email||'—'}</span>
      <span className="text-xs text-slate-500">{t.branch}: {c.branch_name||t.businessWide}</span>
     </button>)}
    </div>}
   {(directory.data?.total||0)>customers.length&&<p className="text-xs text-amber-800">{t.showLimited}</p>}
  </div>
  {selected&&<div className="min-w-0 space-y-3 rounded-2xl border border-teal-200 bg-white p-4 dark:bg-slate-950">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <h4 className="min-w-0 break-words font-black">{selected.name}</h4>
    <span className="text-xs font-bold text-teal-700">{statusFor(t,safeStatus)}</span>
   </div>
   <label className="block text-sm font-semibold">{t.email}
    <Input type="email" autoComplete="email" value={email} maxLength={254}
     className="mt-1 w-full min-w-0" disabled={busy||sending||existingAccess}
     onChange={e=>{setEmail(e.target.value);setLink('');setToken('');setMessage('');}}/>
   </label>
   <p className="text-xs leading-5 text-slate-600">{existingAccess?t.activeHelp:t.pendingHelp}</p>
   <div className="flex flex-wrap gap-2">
    {!existingAccess&&<Button type="button" disabled={busy||sending||!EMAIL.test(email.trim())} onClick={issue}>
     <Mail className="me-1 size-4"/>{safeStatus==='pending'||safeStatus==='expired'?t.renew:t.approve}
    </Button>}
    {canRevoke&&(!revokeConfirm
     ?<Button type="button" variant="outline" disabled={busy||sending} onClick={()=>setRevokeConfirm(true)}>
       <XCircle className="me-1 size-4"/>{t.revoke}</Button>
     :<><Button type="button" variant="destructive" disabled={busy||sending} onClick={revoke}>{t.confirm}</Button>
       <Button type="button" variant="outline" onClick={()=>setRevokeConfirm(false)}>{t.cancel}</Button></>)}
   </div>
   {link&&<div className="space-y-2 rounded-xl border bg-slate-50 p-3">
    <div className="flex items-center gap-2 text-xs font-bold"><Link2 className="size-4"/>{t.pending}</div>
    <Input value={link} readOnly dir="ltr" aria-label="Customer invitation link" className="w-full min-w-0" onFocus={e=>e.target.select()}/>
    <div className="flex flex-wrap gap-2">
     <Button type="button" variant="outline" onClick={copy}><ClipboardCopy className="me-1 size-4"/>{t.copy}</Button>
     <Button type="button" variant="outline" onClick={share}>{t.share}</Button>
     {emailState==='failed'&&<Button type="button" variant="outline" disabled={sending||busy} onClick={()=>sendEmail(selected.id,token)}>{t.retryEmail}</Button>}
    </div>
    {emailState==='accepted'&&<p role="status" className="text-xs text-teal-800">{t.emailAccepted}</p>}
    {emailState==='failed'&&<p role="alert" className="text-xs text-red-700">{t.emailFailed}</p>}
   </div>}
   {message&&<p role="status" className="break-words text-sm">{message}</p>}
  </div>}
 </section>;
}
