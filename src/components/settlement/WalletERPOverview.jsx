import React,{useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {readSponsorOwnerRows,sponsorOwnerSummary} from '@/lib/sponsorOwnerBilateral';
import {ownerWalletSnapshot} from '@/lib/walletERPViewModel';
import {walletAccountReference} from '@/lib/walletPersonalActivity';
import {WalletCards,Users,ArrowDownLeft,ArrowUpRight,Clock3,Plus,BookOpen,ArrowLeftRight,ShieldCheck,ChevronRight,UserRound,Landmark,Activity,Search,FileClock} from 'lucide-react';
import {Button} from '@/components/ui/button';

/** Read-only owner landing. Never combine personal principal with custody (business property).
 * All amounts remain in their original currency and originate in verified ledger reads.
 */
const messages={
 en:{heading:'Accounts & Wallet',sub:'Named accounts, owner-reviewed custody transfers, personal finance and account activity.',custody:'Business funds held by people',owed:'Business owes people',receivable:'People owe business',pending:'Pending custody approvals',people:'People accounts',add:'Add account',all:'All',partners:'Partners',staff:'Staff',active:'Active',inactive:'Inactive',ledger:'View ledger',record:'Personal advance / repayment',edit:'Edit',login:'Login active',unlinked:'Login pending',details:'Account details',controls:'Owner controls',loans:'Personal loans ledger',requests:'Review requests',members:'Membership approvals',legacy:'Unassigned legacy records',activity:'Recent personal advances',separate:'Personal loans and custody are separate ledgers. No cross-currency totals or automatic netting.',empty:'No transactions for this currency.',select:'Select currency',custodyUnavailable:'Custody totals could not be loaded. Do not treat missing data as zero.',ledgerUnavailable:'Ledger totals could not be loaded. Do not treat missing data as zero.',retry:'Retry',search:'Search accounts',account:'Account',notMoney:'Requests'},
 ar:{heading:'الحسابات والمحفظة',sub:'حسابات الأشخاص المسماة، وتسوية العهد وتحويلاتها ومراجعة التمويل الشخصي في مكان واحد.',custody:'أموال المنشأة بعهدة الأشخاص',owed:'المستحق للأشخاص على المنشأة',receivable:'المستحق للمنشأة على الأشخاص',pending:'طلبات العهدة المعلقة',people:'حسابات الأشخاص',add:'إضافة حساب',all:'الكل',partners:'الشركاء',staff:'الموظفون',active:'نشط',inactive:'غير نشط',ledger:'عرض دفتر الحساب',record:'سلفة / سداد شخصي',edit:'تعديل',login:'دخول مفعل',unlinked:'بانتظار التفعيل',details:'تفاصيل الحساب',controls:'إدارة المالك',loans:'دفتر السلف الشخصية',requests:'مراجعة الطلبات',members:'طلبات الانضمام',legacy:'السجلات القديمة غير المعينة',activity:'آخر السلف الشخصية',separate:'السلف والعهد دفتران منفصلان. لا تُجمع العملات ولا تُقاص الديون تلقائياً.',empty:'لا توجد حركات بهذه العملة.',select:'اختر العملة',custodyUnavailable:'تعذر تحميل أرصدة العهد. لا يُعتبر الرصيد المفقود صفراً.',ledgerUnavailable:'تعذر تحميل دفتر السلف. لا يُعتبر الرصيد المفقود صفراً.',retry:'إعادة المحاولة',search:'بحث عن حساب',account:'الحساب',notMoney:'طلبات'},
 fa:{heading:'حساب‌ها و والت',sub:'حساب‌های شخصی مشخص، انتقال امانت، تأیید اونر و گردش حساب در یک مرکز.',custody:'پول کسب‌وکار نزد اشخاص',owed:'طلب اشخاص از کسب‌وکار',receivable:'طلب کسب‌وکار از اشخاص',pending:'درخواست‌های امانت منتظر تأیید',people:'حساب‌های اشخاص',add:'افزودن حساب',all:'همه',partners:'شریک‌ها',staff:'کارمندان',active:'فعال',inactive:'غیرفعال',ledger:'دفتر حساب',record:'قرض / بازپرداخت شخصی',edit:'ویرایش',login:'ورود فعال',unlinked:'در انتظار فعال‌سازی',details:'جزئیات حساب',controls:'کنترول اونر',loans:'دفتر قرض شخصی',requests:'بررسی درخواست‌ها',members:'قبول عضویت‌ها',legacy:'سوابق قبلی بدون حساب',activity:'آخرین معاملات قرض',separate:'قرض شخصی و پول امانتی دو دفتر جدا هستند. ارزهای مختلف جمع و طلب‌ها خودکار تهاتر نمی‌شوند.',empty:'در این ارز معامله‌ای نیست.',select:'انتخاب ارز',custodyUnavailable:'مانده امانت بارگذاری نشد؛ داده ناقص را صفر حساب نکنید.',ledgerUnavailable:'دفتر قرض بارگذاری نشد؛ داده ناقص را صفر حساب نکنید.',retry:'تلاش دوباره',search:'جستجوی حساب',account:'حساب',notMoney:'درخواست'}
};
const bill=(v,c,lang)=>new Intl.NumberFormat(lang==='ar'?'ar-SA':lang==='fa'?'fa-AF':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0))+' '+c;
function Stat({icon:Icon,label,value,sub,tone='blue',loading=false}){
 const colors={blue:'bg-blue-50 text-blue-700',green:'bg-emerald-50 text-emerald-700',amber:'bg-amber-50 text-amber-700',violet:'bg-violet-50 text-violet-700'};
 return <article className="min-w-0 rounded-[20px] border border-slate-200 bg-white p-3.5 shadow-sm sm:p-5">
  <div className="flex items-center gap-2.5"><span className={`grid size-10 shrink-0 place-items-center rounded-2xl ${colors[tone]}`}><Icon className="size-5"/></span><p className="min-w-0 text-xs font-bold leading-5 text-slate-600 sm:text-sm">{label}</p></div>
  <p dir="ltr" className="mt-2 break-words text-start text-lg font-black tabular-nums text-slate-950 sm:text-2xl">{loading?'…':value}</p>
  {sub&&<p className="mt-1 text-[11px] leading-5 text-slate-500">{sub}</p>}
 </article>;
}
export default function WalletERPOverview({restaurantId,partners=[],partner,onSelect,onAdd,onEdit,onLedger,onRecord,onRequests,onMembers,lang='en',displayCurrency='SAR'}){
 const m=messages[lang]||messages.en;
 const [currency,setCurrency]=useState('');
 const [filter,setFilter]=useState('all');
 const [search,setSearch]=useState('');
 const ledger=useQuery({queryKey:['sponsor-owner-bilateral',restaurantId],enabled:!!restaurantId,queryFn:()=>readSponsorOwnerRows(supabase,restaurantId),refetchInterval:15000,staleTime:15000});
 const custody=useQuery({queryKey:['people-custody-totals',restaurantId],enabled:!!restaurantId,queryFn:async()=>{const {data,error}=await supabase.rpc('erp_people_custody_totals',{p_restaurant_id:restaurantId});if(error)throw error;return data||[];},refetchInterval:15000,staleTime:15000});
 const currencies=useMemo(()=>[...new Set([displayCurrency,...(ledger.data||[]).map(r=>r.currency),...(custody.data||[]).map(r=>r.currency)].filter(Boolean))].sort(),[displayCurrency,ledger.data,custody.data]);
 const chosen=currencies.includes(currency)?currency:currencies.includes(displayCurrency)?displayCurrency:currencies[0]||'SAR';
 const summary=useMemo(()=>ownerWalletSnapshot({transactions:ledger.data||[],custodyBalances:custody.data||[],people:partners,currency:chosen}),[ledger.data,custody.data,partners,chosen]);
 const people=partners.filter(p=>(filter==='all'||(filter==='partners'?p.account_role==='partner':filter==='staff'?p.account_role!=='partner':filter==='active'?p.is_active:!p.is_active))&&([p.name,p.email].join(' ').toLowerCase().includes(search.trim().toLowerCase())));
 const [expanded,setExpanded]=useState('');
 return <section className="min-w-0 space-y-3.5" dir={lang==='en'?'ltr':'rtl'}>
  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><div className="min-w-0"><h2 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{m.heading}</h2><p className="mt-0.5 text-xs text-slate-500">{m.people} · {partners.length}</p></div>
   <label className="text-xs font-semibold text-slate-500">{m.select}<select aria-label={m.select} value={chosen} onChange={e=>setCurrency(e.target.value)} className="mt-1 block min-h-11 min-w-24 rounded-xl border border-slate-200 bg-white px-2 font-black text-slate-800">{currencies.map(c=><option key={c}>{c}</option>)}</select></label>
  </div>
  {(ledger.isError||custody.isError)&&<div role="alert" className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{ledger.isError&&<p>{m.ledgerUnavailable}</p>}{custody.isError&&<p>{m.custodyUnavailable}</p>}<Button size="sm" variant="outline" onClick={()=>{ledger.refetch();custody.refetch();}}>{m.retry}</Button></div>}
  <div className="grid grid-cols-2 gap-2.5" aria-label={m.heading}>
   <Stat icon={WalletCards} label={m.custody} value={custody.isError?'—':bill(summary.custodyHeld,chosen,lang)} tone="blue" loading={custody.isPending}/>
   <button type="button" onClick={onRequests} className="min-w-0 rounded-[20px] border border-violet-200 bg-violet-50/70 p-3.5 text-start shadow-sm">
    <span className="grid size-10 place-items-center rounded-xl bg-violet-100 text-violet-700"><Clock3 className="size-5"/></span>
    <p className="mt-2 text-xs font-bold leading-5 text-violet-900">{m.pending}</p><p className="mt-1 text-lg font-black tabular-nums text-violet-950">{custody.isPending?'…':custody.isError?'—':summary.pendingCustodyCount}</p>
   </button>
   <Stat icon={ArrowUpRight} label={m.owed} value={ledger.isError?'—':bill(summary.businessOwesPeople,chosen,lang)} tone="amber" loading={ledger.isPending}/>
   <Stat icon={ArrowDownLeft} label={m.receivable} value={ledger.isError?'—':bill(summary.peopleOweBusiness,chosen,lang)} tone="green" loading={ledger.isPending}/>
  </div>
  <p className="text-xs leading-5 text-slate-500">{m.separate}</p>
  <div className="space-y-3 rounded-[24px] border border-slate-200 bg-white p-3.5 shadow-sm sm:p-5">
   <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-black text-slate-950">{m.people}</h3><Button size="sm" onClick={onAdd} className="min-h-11 shrink-0 gap-1.5 bg-blue-600"><Plus className="size-4"/>{m.add}</Button></div>
   <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-[1fr_auto]">
    <label className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search className="size-4 shrink-0 text-slate-400"/><input aria-label={m.search} placeholder={m.search} value={search} onChange={e=>setSearch(e.target.value)} className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"/></label>
    <select aria-label={m.all} value={filter} onChange={e=>setFilter(e.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold min-[420px]:w-32">{['all','partners','staff','active','inactive'].map(k=><option key={k} value={k}>{m[k]}</option>)}</select>
   </div>
   {!people.length?<p className="py-6 text-center text-sm text-slate-500">{m.empty}</p>:<div className="divide-y divide-slate-100">{people.map(p=>{
    const open=expanded===p.id;const values=sponsorOwnerSummary((ledger.data||[]).filter(r=>r.partner_id===p.id),chosen);
    return <article key={p.id} className="py-2.5">
     <button type="button" aria-expanded={open} onClick={()=>setExpanded(open?'':p.id)} className="flex min-h-14 w-full min-w-0 items-center gap-2.5 text-start">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600"><UserRound className="size-5"/></span>
      <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-950">{p.name}</strong><span className="mt-0.5 block truncate text-xs text-slate-500">{p.account_role==='partner'?m.partners:['supplier','customer'].includes(p.account_role)?p.account_role:m.staff} · <span className={p.is_active?'text-emerald-700':'text-slate-500'}>{p.is_active?m.active:m.inactive}</span> · {p.user_id?m.login:m.unlinked}</span></span>
      <ChevronRight className={`size-4 shrink-0 text-slate-400 transition-transform ${open?'rotate-90':''}`}/>
     </button>
     {open&&<div className="space-y-3 rounded-xl bg-slate-50 p-3">
       <p dir="ltr" className="break-all text-xs text-slate-500">{p.email}</p>
       <p dir="ltr" className="break-all font-mono text-[11px] text-blue-700">{walletAccountReference(p.id)}</p>
       <div className="grid grid-cols-2 gap-2 text-xs"><div className="min-w-0 rounded-lg bg-white p-2"><p className="text-slate-500">{m.owed}</p><strong dir="ltr" className="mt-1 block break-words text-start text-sm">{ledger.isPending?'…':ledger.isError?'—':bill(values.ownerOwes,chosen,lang)}</strong></div><div className="min-w-0 rounded-lg bg-white p-2"><p className="text-slate-500">{m.receivable}</p><strong dir="ltr" className="mt-1 block break-words text-start text-sm">{ledger.isPending?'…':ledger.isError?'—':bill(values.sponsorOwes,chosen,lang)}</strong></div></div>
       <div className="grid grid-cols-2 gap-2"><Button type="button" size="sm" variant="outline" className="min-h-11 min-w-0 text-xs" onClick={()=>{onSelect(p.id);onEdit(p);}}>{m.edit}</Button><Button type="button" size="sm" className="min-h-11 min-w-0 bg-blue-600 text-xs" onClick={()=>{onSelect(p.id);onLedger();}}>{m.ledger}</Button></div>
       {p.is_active&&p.allow_loans!==false&&<button type="button" onClick={()=>{onSelect(p.id);onRecord();}} className="block w-full py-1 text-center text-xs font-bold text-blue-700">{m.record}</button>}
      </div>}
    </article>})}</div>}
  </div>
  <details className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500"><summary className="cursor-pointer font-semibold">{m.separate}</summary><p className="mt-2">{m.sub}</p></details>
 </section>;
}
