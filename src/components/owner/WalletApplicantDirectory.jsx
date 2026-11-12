import React,{useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '@/api/supabaseClient';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Copy,Loader2,RefreshCw,Search,Share2,UserPlus} from 'lucide-react';

const ROLE_KEYS=['all','manager','employee','driver','supplier','customer'];
export const WALLET_DIRECTORY_COPY={
 en:{
  title:'Select a person for Wallet invitation',help:'Managers, Employees, Drivers, Suppliers and Customers from this business. Choose a person to generate a private enrollment link immediately.',
  all:'All',manager:'Manager',employee:'Employee',driver:'Driver',supplier:'Supplier',customer:'Customer',
  search:'Search people, email or role',loading:'Loading organization users…',error:'Unable to load users securely. Retry.',
  empty:'No people are registered in this business for the selected role.',missing:'Add a verified-contact email to this person before inviting.',
  inactive:'This person is inactive; reactivate their business record before inviting.',
  linked:'Wallet already connected',select:'Select to create Wallet invitation',generating:'Creating secure link…',
  ready:'Wallet invitation for',hint:'Valid for 7 days. This link is bound to the selected person’s verified email. Renewing only invalidates their previous link.',
  copy:'Copy link',share:'Share invitation',copied:'Private link copied',fallback:'Copy the link from the box below.',
  approval:'The person must sign up or sign in with the same email, verify it, request membership and wait for Owner approval. This invitation does not grant wallet privileges or transfer money.',
  email:'Email',branch:'Branch',retry:'Retry',none:'No email set',
 },
 ar:{
  title:'اختر شخصًا لدعوته إلى المحفظة',help:'مديرو وموظفو وسائقو وموردو وعملاء هذا النشاط. اختر الشخص لإنشاء رابط خاص فوراً.',
  all:'الكل',manager:'مدير',employee:'موظف',driver:'سائق',supplier:'مورد',customer:'عميل',
  search:'ابحث بالاسم أو البريد أو الدور',loading:'جارٍ تحميل مستخدمي المنشأة…',error:'تعذر تحميل المستخدمين بأمان. أعد المحاولة.',
  empty:'لا يوجد أشخاص مسجلون في هذا النشاط للدور المختار.',missing:'أضف البريد الإلكتروني لهذا الشخص قبل إرسال الدعوة.',
  inactive:'هذا الشخص غير نشط. فعّل حسابه التجاري قبل الدعوة.',linked:'المحفظة مرتبطة مسبقاً',
  select:'اختر لإنشاء رابط دعوة المحفظة',generating:'جارٍ إنشاء الرابط الآمن…',ready:'دعوة محفظة خاصة بـ',
  hint:'صالحة ٧ أيام وترتبط بالبريد المؤكد للشخص المختار. التجديد يلغي رابط هذا الشخص فقط.',
  copy:'نسخ الرابط',share:'مشاركة الدعوة',copied:'تم نسخ الرابط',fallback:'انسخ الرابط من الحقل أدناه.',
  approval:'يلزم التسجيل بالبريد نفسه وتأكيده وطلب العضوية وموافقة المالك. لا تمنح الدعوة صلاحيات مالية أو تحرك الأموال.',
  email:'البريد',branch:'الفرع',retry:'إعادة المحاولة',none:'البريد غير موجود',
 },
 fa:{
  title:'انتخاب شخص برای دعوت والت',help:'تمام مدیران، کارمندان، رانندگان، سپلایرها و مشتریان همین بیزنس. با انتخاب شخص، لینک اختصاصی او ساخته می‌شود.',
  all:'همه',manager:'مدیر',employee:'کارمند',driver:'راننده',supplier:'سپلایر',customer:'مشتری',
  search:'جستجوی نام، ایمیل یا نقش',loading:'کاربران همین بیزنس بارگذاری می‌شوند…',error:'فهرست کاربران بار نشد. دوباره تلاش کن.',
  empty:'در این بیزنس برای نقش انتخاب‌شده هنوز کسی ثبت نشده.',missing:'برای دعوت این شخص اول ایمیل درست ثبت کن.',
  inactive:'حساب این شخص غیرفعال است. قبل از دعوت فعالش کن.',linked:'والت قبلاً متصل شده',
  select:'انتخاب و ساخت فوری لینک دعوت والت',generating:'در حال ساخت لینک امن…',ready:'دعوت اختصاصی والت برای',
  hint:'اعتبار ۷ روز. لینک فقط با ایمیل تأییدشدهٔ همین شخص کار می‌کند. تمدید فقط لینک قبلی خودش را باطل می‌کند.',
  copy:'کاپی لینک',share:'اشتراک دعوت',copied:'لینک اختصاصی کاپی شد',fallback:'لینک را از کادر زیر کاپی کن.',
  approval:'شخص باید با همان ایمیل ثبت‌نام یا ورود کند، ایمیل را تأیید کند، درخواست عضویت بدهد و منتظر تأیید Owner بماند. لینک هیچ دسترسی مالی یا انتقال پول ایجاد نمی‌کند.',
  email:'ایمیل',branch:'شعبه',retry:'تلاش دوباره',none:'ایمیل موجود نیست',
 },
};
const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||''));
const validRow=person=>person && ROLE_KEYS.includes(person.source_type) && person.source_type!=='all'
 && typeof person.source_id==='string';
export function eligibleWalletCandidate(person){
 return validRow(person) && validEmail(person.email) && !person.wallet_linked
 && (person.source_type!=='manager'?person.status!=='inactive':person.status==='approved');
}
export default function WalletApplicantDirectory({restaurantId,organizationName,branches=[],lang='en'}){
 const t=WALLET_DIRECTORY_COPY[lang]||WALLET_DIRECTORY_COPY.en;
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false);
 const [filter,setFilter]=useState('all'),[search,setSearch]=useState('');
 const [selected,setSelected]=useState(null),[personalLink,setPersonalLink]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const lock=useRef(false);
 const inputRef=useRef(null);
 const load=async()=>{
  if(!restaurantId){setRows([]);setLoading(false);return;}
  setLoading(true);setFailed(false);
  try{
   const {data,error:rpcError}=await supabase.rpc('erp_wallet_candidate_directory',{p_restaurant_id:restaurantId});
   if(rpcError||!Array.isArray(data))throw rpcError||Error('DIRECTORY_UNAVAILABLE');
   setRows(data.filter(validRow));
  }catch{setRows([]);setFailed(true);}
  finally{setLoading(false);}
 };
 useEffect(()=>{setRows([]);setSelected(null);setPersonalLink('');setError('');setNotice('');load();},[restaurantId]);
 const visible=useMemo(()=>{
  const q=search.trim().toLocaleLowerCase();
  return rows.filter(person=>(filter==='all'||person.source_type===filter)
    && (!q||[person.full_name,person.email,person.source_type,
       branches.find(b=>String(b.id)===String(person.branch_id))?.name].some(v=>String(v||'').toLocaleLowerCase().includes(q))));
 },[rows,filter,search,branches]);
 const counts=useMemo(()=>ROLE_KEYS.reduce((acc,role)=>({...acc,[role]:role==='all'?rows.length:rows.filter(r=>r.source_type===role).length}),{}),[rows]);
 const invite=async person=>{
  if(lock.current||!restaurantId||!eligibleWalletCandidate(person))return;
  lock.current=true;setBusy(true);setSelected(person);setPersonalLink('');setError('');setNotice('');
  try{
   // Owner-only RPC resolves the canonical, current tenant+person email. The
   // browser does not supply an email or any permission grants.
   const {data,error:rpcError}=await supabase.rpc('erp_people_personal_enrollment_link',{
    p_restaurant_id:restaurantId,p_source_type:person.source_type,p_source_id:person.source_id,
   });
   if(rpcError)throw rpcError;
   if(typeof data!=='string'||!/^[a-f0-9]{64}$/.test(data))throw Error('WALLET_INVITATION_INVALID');
   setPersonalLink(window.location.origin+'/wallet-portal#personal='+encodeURIComponent(data));
  }catch(e){setError(e?.message||t.error);}
  finally{lock.current=false;setBusy(false);}
 };
 const copy=async()=>{
  if(!personalLink)return;
  try{await navigator.clipboard.writeText(personalLink);setNotice(t.copied);}
  catch{inputRef.current?.focus();inputRef.current?.select();setNotice(t.fallback);}
 };
 const share=async()=>{
  if(!personalLink)return;
  if(typeof navigator.share==='function'){
   try{await navigator.share({title:t.title,text:(selected?.full_name||'')+' · '+(organizationName||''),url:personalLink});return;}
   catch(e){if(e?.name==='AbortError')return;}
  }
  await copy();
 };
 return <section data-testid="wallet-applicant-directory" className="space-y-3 rounded-2xl border border-cyan-200 bg-white/90 p-3 dark:border-cyan-950 dark:bg-slate-950/90">
  <div>
   <h3 className="text-sm font-black text-slate-950 dark:text-white">{t.title} · {loading||failed?'…':counts.all}</h3>
   <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{t.help}</p>
  </div>
  <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.title}>
   {ROLE_KEYS.map(role=><button type="button" key={role} aria-pressed={filter===role} onClick={()=>setFilter(role)}
    className={'min-h-9 rounded-xl border px-2.5 py-1.5 text-xs font-bold '+(filter===role?'border-cyan-600 bg-cyan-100 text-cyan-900':'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}>
    {t[role]} · {loading||failed?'…':counts[role]}</button>)}
  </div>
  <label className="relative block">
   <Search className="absolute start-3 top-3 h-4 w-4 text-slate-400"/>
   <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t.search} aria-label={t.search}
    className="min-h-11 ps-9"/>
  </label>
  {loading?<p role="status" className="py-3 text-xs text-slate-600">{t.loading}</p>:
   failed?<div role="alert" className="space-y-2 text-sm text-red-700">{t.error}
    <Button size="sm" variant="outline" onClick={load}><RefreshCw className="me-1 h-4 w-4"/>{t.retry}</Button>
   </div>:
   <div data-testid="wallet-applicant-rows" className="max-h-[400px] space-y-2 overflow-y-auto">
    {!visible.length&&<p className="rounded-xl border border-dashed p-4 text-xs text-slate-500">{t.empty}</p>}
    {visible.map(person=>{
     const enabled=eligibleWalletCandidate(person)&&!busy;
     const reason=person.wallet_linked?t.linked:!validEmail(person.email)?t.missing:!eligibleWalletCandidate(person)?t.inactive:'';
     const branch=branches.find(b=>String(b.id)===String(person.branch_id));
     return <button type="button" key={person.source_type+':'+person.source_id} disabled={!enabled}
       data-testid="wallet-applicant-select" data-role={person.source_type} onClick={()=>invite(person)}
       className="flex min-h-16 w-full min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-start transition hover:border-cyan-500 hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-800 dark:hover:bg-slate-900">
      <span className="min-w-0 flex-1">
       <span className="flex min-w-0 flex-wrap gap-2 text-sm font-bold text-slate-900 dark:text-white">
        <span className="min-w-0 break-words">{person.full_name||person.email||'—'}</span>
        <span className="rounded-lg bg-slate-100 px-2 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-100">{t[person.source_type]}</span>
       </span>
       <span dir="ltr" className="mt-1 block min-w-0 break-all text-xs text-slate-600 dark:text-slate-300">{person.email||t.none}</span>
       {branch&&<span className="mt-1 block text-[11px] text-slate-500">{t.branch}: {branch.name}</span>}
       {reason&&<span className="mt-1 block text-[11px] font-medium text-amber-800 dark:text-amber-300">{reason}</span>}
      </span>
      {enabled&&<UserPlus aria-label={t.select} className="h-5 w-5 shrink-0 text-cyan-700"/>}
     </button>;
    })}
   </div>}
  {busy&&<p role="status" className="flex items-center gap-2 text-sm text-cyan-900 dark:text-cyan-200"><Loader2 className="h-4 w-4 animate-spin"/>{t.generating}</p>}
  {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
  {personalLink&&selected&&<div data-testid="wallet-personal-invitation-link" className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-950 dark:bg-emerald-950/30">
   <h4 className="text-sm font-black text-emerald-900 dark:text-emerald-100">{t.ready} {selected.full_name}</h4>
   <p dir="ltr" className="break-all text-xs text-emerald-700 dark:text-emerald-200">{selected.email}</p>
   <p className="text-xs leading-5 text-emerald-800 dark:text-emerald-100">{t.hint}</p>
   <Input ref={inputRef} readOnly dir="ltr" value={personalLink} aria-label={t.ready} className="min-w-0 text-xs" onFocus={e=>e.target.select()}/>
   <div className="flex flex-wrap gap-2">
    <Button type="button" variant="outline" className="min-h-11" onClick={copy}><Copy className="me-2 h-4 w-4"/>{t.copy}</Button>
    <Button type="button" className="min-h-11 bg-emerald-700 hover:bg-emerald-800" onClick={share}><Share2 className="me-2 h-4 w-4"/>{t.share}</Button>
   </div>
   {notice&&<p role="status" className="text-xs font-semibold text-emerald-900">{notice}</p>}
   <p className="text-xs leading-5 text-slate-700 dark:text-slate-200">{t.approval}</p>
  </div>}
 </section>;
}
