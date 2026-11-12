import React,{useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {supabase} from '@/api/supabaseClient';
import {useLanguage} from '@/lib/LanguageContext';
import {peopleText} from '@/lib/peopleAccounts';
import PeopleMemberships from '@/components/settlement/PeopleMemberships';
import WalletApplicantDirectory from './WalletApplicantDirectory';
import {Copy,ExternalLink,Link2,Loader2,Share2,ShieldCheck,Wallet,XCircle} from 'lucide-react';

const COPY={
 en:{
  title:'Wallet user invitation',subtitle:'One organization-wide enrollment link for wallet applicants.',
  create:'Create wallet invitation link',renew:'Renew link (invalidates previous)',disable:'Disable link',
  copy:'Copy link',share:'Share now',copied:'Wallet link copied',error:'Could not prepare wallet link. Please retry.',
  ready:'Secure wallet registration link',expiry:'7-day expiry · renewing invalidates the previous link',
  info:'Wallet is separate from Manager, Employee, Supplier and Driver ERP roles. This invitation does not activate an account or grant access to money. The person must sign up or sign in, verify their email, request membership, and receive Owner approval with limited wallet permissions.',
  scope:'Invitations apply to the selected organization. Owner assigns branch and wallet rights during approval.',
  pending:'Review wallet membership requests and permissions',open:'Open Wallet Banking Center',
  shareMessage:'Request access to a personal BizCTRL wallet account for',
  disabled:'Wallet registration link disabled. Previously shared join links are no longer usable.',
  clipboard:'Automatic copy is unavailable. Select and copy the visible link.',
 },
 fa:{
  title:'دعوت کاربر والت',subtitle:'یک لینک ثبت‌نام سازمانی برای تمام متقاضیان والت.',
  create:'ساخت لینک دعوت والت',renew:'ساخت لینک تازه (باطل‌شدن قبلی)',disable:'غیرفعال‌کردن لینک',
  copy:'کاپی لینک',share:'اشتراک‌گذاری',copied:'لینک والت کاپی شد',error:'ساخت لینک والت ناموفق بود. دوباره کوشش کنید.',
  ready:'لینک امن ثبت‌نام والت',expiry:'اعتبار ۷ روز · ساخت لینک تازه قبلی را باطل می‌کند',
  info:'والت از نقش‌های Manager، Employee، Supplier و Driver جدا است. لینک به‌تنهایی حساب یا دسترسی به پول فعال نمی‌کند. شخص باید وارد شود، ایمیل خود را تأیید کند، درخواست عضویت بدهد و بعد از تأیید Owner صلاحیت محدود بگیرد.',
  scope:'لینک مربوط سازمان انتخاب‌شده است. شعبه و صلاحیت‌های والت هنگام تأیید توسط Owner تعیین می‌شوند.',
  pending:'بررسی درخواست‌های والت و صلاحیت‌ها',open:'بازکردن Wallet Banking Center',
  shareMessage:'درخواست عضویت در حساب والت BizCTRL برای سازمان',
  disabled:'لینک ثبت‌نام والت غیرفعال شد. لینک‌های مشترک قبلی دیگر کار نمی‌کنند.',
  clipboard:'کاپی خودکار ممکن نیست؛ لینک را انتخاب و دستی کاپی کنید.',
 },
 ar:{
  title:'دعوة مستخدم المحفظة',subtitle:'رابط تسجيل واحد للمنشأة يمكن مشاركته مع جميع طالبي المحفظة.',
  create:'إنشاء رابط دعوة المحفظة',renew:'تجديد الرابط (إلغاء السابق)',disable:'تعطيل الرابط',
  copy:'نسخ الرابط',share:'مشاركة الآن',copied:'تم نسخ رابط المحفظة',error:'تعذر إعداد رابط المحفظة. أعد المحاولة.',
  ready:'رابط تسجيل المحفظة الآمن',expiry:'صالح لمدة ٧ أيام · التجديد يبطل الرابط السابق',
  info:'المحفظة منفصلة عن أدوار المدير والموظف والمورد والسائق. الدعوة وحدها لا تفعّل الحساب ولا تمنح حق التعامل بالأموال. يجب تسجيل الدخول وتأكيد البريد وطلب العضوية ثم موافقة المالك مع صلاحيات محددة.',
  scope:'الرابط يخص المنشأة المختارة. يحدد المالك الفرع وصلاحيات المحفظة عند الموافقة.',
  pending:'مراجعة طلبات المحفظة والصلاحيات',open:'فتح مركز المحفظة البنكية',
  shareMessage:'اطلب الوصول إلى حساب محفظة BizCTRL الخاص بمنشأة',
  disabled:'تم تعطيل رابط التسجيل. الروابط المشتركة سابقًا لم تعد صالحة.',
  clipboard:'تعذر النسخ تلقائيًا. حدد الرابط الظاهر وانسخه يدويًا.',
 },
};

export default function WalletJoinInvitation({restaurantId,organizationName,branches=[]}){
  const {lang}=useLanguage();
  const t=COPY[lang]||COPY.en;
  const [link,setLink]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const lock=useRef(false);
  const linkInput=useRef(null);
  const isReady=Boolean(restaurantId);
  const issue=async(enabled)=>{
    if(!isReady||lock.current)return;
    lock.current=true;
    setBusy(true);setError('');setNotice('');
    try{
      // This existing Owner-only RPC rotates one tenant-scoped 7-day token.
      // It never grants a wallet, staff role, or transaction permissions.
      const {data,error:rpcError}=await supabase.rpc('erp_people_enrollment_link',{
        p_restaurant_id:restaurantId,p_enabled:enabled,
      });
      if(rpcError)throw rpcError;
      if(enabled&&(!data||!/^[a-f0-9]{64}$/.test(data)))throw new Error('Wallet token missing');
      setLink(enabled?window.location.origin+'/wallet-portal#join='+encodeURIComponent(data):'');
      setNotice(enabled?'':t.disabled);
    }catch(e){setError(e?.message||t.error);}
    finally{lock.current=false;setBusy(false);}
  };
  const copy=async()=>{
    if(!link)return;
    try{await navigator.clipboard.writeText(link);setNotice(t.copied);}
    catch{linkInput.current?.focus();linkInput.current?.select();setNotice(t.clipboard);}
  };
  const share=async()=>{
    if(!link)return;
    if(typeof navigator.share==='function'){
      try{await navigator.share({title:t.title,text:t.shareMessage+' '+(organizationName||''),url:link});return;}
      catch(e){if(e?.name==='AbortError')return;}
    }
    await copy();
  };
  return <section data-testid="wallet-invitation-panel" className="space-y-4 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-900/60 dark:bg-cyan-950/20">
    <div className="flex items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cyan-700 text-white"><Wallet className="size-5"/></span>
      <div className="min-w-0"><h3 className="text-base font-black text-slate-950 dark:text-white">{t.title}</h3><p className="text-xs text-slate-600 dark:text-slate-300">{t.subtitle}</p></div>
    </div>
    <p className="rounded-xl border border-cyan-200 bg-white p-3 text-xs leading-5 text-slate-700 dark:border-cyan-900 dark:bg-slate-900 dark:text-slate-200"><ShieldCheck className="me-2 inline size-4 align-middle text-cyan-700"/>{t.info}</p>
    <p className="text-xs text-slate-600 dark:text-slate-300">{t.scope}</p>
    <WalletApplicantDirectory restaurantId={restaurantId} organizationName={organizationName} branches={branches} lang={lang}/>
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={()=>issue(true)} disabled={busy||!isReady} className="min-h-11 min-w-0 rounded-xl bg-blue-600 text-white hover:bg-blue-700">
        {busy?<Loader2 className="me-2 size-4 animate-spin"/>:<Link2 className="me-2 size-4"/>}{link?t.renew:t.create}
      </Button>
      <Button type="button" variant="outline" onClick={()=>issue(false)} disabled={busy||!isReady} className="min-h-11 rounded-xl">
        <XCircle className="me-2 size-4"/>{t.disable}
      </Button>
    </div>
    {link&&<div data-testid="wallet-invitation-link" className="space-y-2 rounded-2xl border border-emerald-200 bg-white p-3 dark:border-emerald-900 dark:bg-slate-900">
      <p className="font-black text-emerald-800 dark:text-emerald-200">{t.ready}</p>
      <p className="text-xs text-slate-600 dark:text-slate-300">{t.expiry}</p>
      <Input ref={linkInput} readOnly dir="ltr" aria-label={t.ready} value={link} onFocus={e=>e.target.select()} className="min-w-0 w-full text-xs" />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11" onClick={copy}><Copy className="me-2 size-4"/>{t.copy}</Button>
        <Button type="button" className="min-h-11 bg-emerald-600 hover:bg-emerald-700" onClick={share}><Share2 className="me-2 size-4"/>{t.share}</Button>
      </div>
    </div>}
    {notice&&<p role="status" className="text-sm font-semibold text-emerald-700 dark:text-emerald-200">{notice}</p>}
    {error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
    <details className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950" data-testid="wallet-approval-requests">
      <summary className="cursor-pointer text-sm font-black text-slate-950 dark:text-white">{t.pending}</summary>
      <div className="mt-3">
        <PeopleMemberships tenant={restaurantId} t={peopleText(lang)} branches={branches} hideLinkControls />
      </div>
    </details>
    <Link to="/wallet-banking" className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-blue-700 underline underline-offset-2 dark:text-blue-300"><ExternalLink className="size-4"/>{t.open}</Link>
  </section>;
}
