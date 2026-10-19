import React,{useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {readSponsorOwnerRows,sponsorOwnerSummary} from '@/lib/sponsorOwnerBilateral';
import {ownerWalletSnapshot} from '@/lib/walletERPViewModel';
import {WalletCards,Users,ArrowDownLeft,ArrowUpRight,Clock3,Plus,BookOpen,ArrowLeftRight,ShieldCheck,ChevronRight,UserRound,Landmark,Activity,Search,FileClock} from 'lucide-react';
import {Button} from '@/components/ui/button';

/** Read-only owner landing. Never combine personal principal with custody (business property).
 * All amounts remain in their original currency and originate in verified ledger reads.
 */
const messages={
 en:{heading:'Accounts & Wallet',sub:'People, personal loans, business custody and approvals — one secure workspace.',custody:'Business funds held by people',owed:'Business owes people',receivable:'People owe business',pending:'Pending custody approvals',people:'People accounts',add:'Add account',all:'All',partners:'Partners',staff:'Staff',active:'Active',inactive:'Inactive',ledger:'View ledger',record:'Record transaction',edit:'Edit',login:'Login active',unlinked:'Login pending',details:'Account details',controls:'Owner controls',loans:'Personal loans ledger',requests:'Review requests',members:'Membership approvals',legacy:'Unassigned legacy records',activity:'Recent personal advances',separate:'Personal loans and custody are separate ledgers. No cross-currency totals or automatic netting.',empty:'No transactions for this currency.',select:'Select currency',custodyUnavailable:'Custody totals could not be loaded. Do not treat missing data as zero.',ledgerUnavailable:'Ledger totals could not be loaded. Do not treat missing data as zero.',retry:'Retry',search:'Search accounts',account:'Account',notMoney:'Requests'},
 ar:{heading:'الحسابات والمحفظة',sub:'إدارة حسابات الأشخاص والسلف والعهد والموافقات من لوحة واحدة.',custody:'أموال المنشأة بعهدة الأشخاص',owed:'المستحق للأشخاص على المنشأة',receivable:'المستحق للمنشأة على الأشخاص',pending:'طلبات العهدة المعلقة',people:'حسابات الأشخاص',add:'إضافة حساب',all:'الكل',partners:'الشركاء',staff:'الموظفون',active:'نشط',inactive:'غير نشط',ledger:'عرض دفتر الحساب',record:'تسجيل معاملة',edit:'تعديل',login:'دخول مفعل',unlinked:'بانتظار التفعيل',details:'تفاصيل الحساب',controls:'إدارة المالك',loans:'دفتر السلف الشخصية',requests:'مراجعة الطلبات',members:'طلبات الانضمام',legacy:'السجلات القديمة غير المعينة',activity:'آخر السلف الشخصية',separate:'السلف والعهد دفتران منفصلان. لا تُجمع العملات ولا تُقاص الديون تلقائياً.',empty:'لا توجد حركات بهذه العملة.',select:'اختر العملة',custodyUnavailable:'تعذر تحميل أرصدة العهد. لا يُعتبر الرصيد المفقود صفراً.',ledgerUnavailable:'تعذر تحميل دفتر السلف. لا يُعتبر الرصيد المفقود صفراً.',retry:'إعادة المحاولة',search:'بحث عن حساب',account:'الحساب',notMoney:'طلبات'},
 fa:{heading:'حساب‌ها و والت',sub:'کنترول حساب اشخاص، قرض‌ها، پول امانتی و درخواست‌ها در یک صفحه.',custody:'پول کسب‌وکار نزد اشخاص',owed:'طلب اشخاص از کسب‌وکار',receivable:'طلب کسب‌وکار از اشخاص',pending:'درخواست‌های امانت منتظر تأیید',people:'حساب‌های اشخاص',add:'افزودن حساب',all:'همه',partners:'شریک‌ها',staff:'کارمندان',active:'فعال',inactive:'غیرفعال',ledger:'دفتر حساب',record:'ثبت معامله',edit:'ویرایش',login:'ورود فعال',unlinked:'در انتظار فعال‌سازی',details:'جزئیات حساب',controls:'کنترول اونر',loans:'دفتر قرض شخصی',requests:'بررسی درخواست‌ها',members:'قبول عضویت‌ها',legacy:'سوابق قبلی بدون حساب',activity:'آخرین معاملات قرض',separate:'قرض شخصی و پول امانتی دو دفتر جدا هستند. ارزهای مختلف جمع و طلب‌ها خودکار تهاتر نمی‌شوند.',empty:'در این ارز معامله‌ای نیست.',select:'انتخاب ارز',custodyUnavailable:'مانده امانت بارگذاری نشد؛ داده ناقص را صفر حساب نکنید.',ledgerUnavailable:'دفتر قرض بارگذاری نشد؛ داده ناقص را صفر حساب نکنید.',retry:'تلاش دوباره',search:'جستجوی حساب',account:'حساب',notMoney:'درخواست'}
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
 const history=summary.recentLoans;
 return <section className="min-w-0 space-y-4" dir={lang==='en'?'ltr':'rtl'}>
  <div className="flex min-w-0 flex-wrap items-end justify-between gap-3"><div className="min-w-0"><h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{m.heading}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{m.sub}</p></div>
   <label className="text-xs font-semibold text-slate-500">{m.select}<select aria-label={m.select} value={chosen} onChange={e=>setCurrency(e.target.value)} className="mt-1 block min-h-11 min-w-28 rounded-xl border border-slate-200 bg-white px-3 font-black text-slate-800">{currencies.map(c=><option key={c}>{c}</option>)}</select></label></div>
  {(ledger.isError||custody.isError)&&<div role="alert" className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
   {ledger.isError&&<p>{m.ledgerUnavailable}</p>}{custody.isError&&<p>{m.custodyUnavailable}</p>}
   <Button size="sm" variant="outline" onClick={()=>{ledger.refetch();custody.refetch();}}>{m.retry}</Button></div>}
  <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
   <Stat icon={WalletCards} label={m.custody} value={custody.isError?'—':bill(summary.custodyHeld,chosen,lang)} tone="blue" loading={custody.isPending}/>
   <Stat icon={ArrowUpRight} label={m.owed} value={ledger.isError?'—':bill(summary.businessOwesPeople,chosen,lang)} tone="amber" loading={ledger.isPending}/>
   <Stat icon={ArrowDownLeft} label={m.receivable} value={ledger.isError?'—':bill(summary.peopleOweBusiness,chosen,lang)} tone="green" loading={ledger.isPending}/>
   <Stat icon={Clock3} label={m.pending} value={custody.isError?'—':summary.pendingCustodyCount} sub={m.notMoney} tone="violet" loading={custody.isPending}/>
  </div>
  <p className="flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-900"><ShieldCheck className="mt-0.5 size-4 shrink-0"/>{m.separate}</p>
  <div className="min-w-0 space-y-3 rounded-[24px] border border-slate-200 bg-white p-3.5 shadow-sm sm:p-5">
   <div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-lg font-black text-slate-950"><Users className="size-5 text-blue-600"/>{m.people}</h3><Button size="sm" onClick={onAdd} className="min-h-10 shrink-0 gap-1.5 bg-blue-600"><Plus className="size-4"/>{m.add}</Button></div>
   <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3"><Search className="size-4 text-slate-400"/><input aria-label={m.search} placeholder={m.search} value={search} onChange={e=>setSearch(e.target.value)} className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"/></label>
   <div className="flex gap-2 overflow-x-auto pb-1">{['all','partners','staff','active','inactive'].map(k=><button key={k} type="button" aria-pressed={filter===k} onClick={()=>setFilter(k)} className={`min-h-10 shrink-0 rounded-xl border px-3 text-xs font-bold ${filter===k?'border-blue-500 bg-blue-50 text-blue-700':'border-slate-200 text-slate-500'}`}>{m[k]} ({partners.filter(p=>k==='all'||(k==='partners'?p.account_role==='partner':k==='staff'?p.account_role!=='partner':k==='active'?p.is_active:!p.is_active)).length})</button>)}</div>
   {!people.length?<p className="py-6 text-center text-sm text-slate-500">{m.empty}</p>:<div className="space-y-2.5">{people.map(p=>{
    const amounts=sponsorOwnerSummary((ledger.data||[]).filter(r=>r.partner_id===p.id),chosen);
    const selected=p.id===partner?.id;
    return <article key={p.id} className={`min-w-0 space-y-3 rounded-2xl border p-3 sm:p-4 ${selected?'border-blue-300 bg-blue-50/30':'border-slate-200'}`}>
     <button type="button" onClick={()=>{onSelect(p.id);onLedger();}} className="flex w-full min-w-0 items-start gap-2.5 text-start">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-600"><UserRound className="size-5"/></span>
      <span className="min-w-0 flex-1"><strong className="block break-words text-sm text-slate-950">{p.name}</strong><span className="mt-1 block break-all text-xs text-slate-500">{p.email}</span><span className="mt-1 block text-xs text-slate-600">{p.account_role==='partner'?m.partners:m.staff} · <span className={p.is_active?'text-emerald-700':'text-slate-500'}>{p.is_active?m.active:m.inactive}</span> · {p.user_id?m.login:m.unlinked}</span></span>
      <span dir="ltr" className="max-w-[38%] shrink-0 text-end text-[11px] font-bold leading-5 text-blue-700">{ledger.isPending?'…':ledger.isError?'—':bill(amounts.sponsorOwes,chosen,lang)}<span className="block text-[10px] font-normal text-slate-500">{m.receivable}</span></span><ChevronRight className="size-4 shrink-0 text-slate-400"/>
     </button>
     <div className="grid grid-cols-3 gap-2"><Button variant="outline" size="sm" className="min-h-10 min-w-0 px-1 text-xs" onClick={()=>{onSelect(p.id);onEdit(p);}}>{m.edit}</Button><Button variant="outline" size="sm" className="min-h-10 min-w-0 px-1 text-xs" onClick={()=>{onSelect(p.id);onLedger();}}>{m.ledger}</Button><Button size="sm" className="min-h-10 min-w-0 bg-blue-600 px-1 text-xs" disabled={!p.is_active||p.allow_loans===false} onClick={()=>{onSelect(p.id);onRecord();}}>{m.record}</Button></div>
    </article>})}</div>}
  </div>
  <section className="space-y-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
   <h3 className="flex items-center gap-2 text-base font-black"><Landmark className="size-5 text-blue-600"/>{m.controls}</h3>
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[[m.add,Users,onAdd],[m.loans,BookOpen,onLedger],[m.requests,ArrowLeftRight,onRequests],[m.members,ShieldCheck,onMembers]].map(([label,Icon,fn])=><button key={label} type="button" onClick={fn} className="flex min-h-20 items-center gap-2 rounded-xl bg-slate-50 p-3 text-start text-xs font-bold text-slate-800 hover:bg-blue-50"><Icon className="size-6 shrink-0 text-blue-600"/><span>{label}</span></button>)}</div>
  </section>
  <section className="space-y-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm"><h3 className="flex items-center gap-2 text-base font-black"><Activity className="size-5 text-blue-600"/>{m.activity}</h3>
   {ledger.isError?<p className="text-sm text-rose-700">{m.ledgerUnavailable}</p>:ledger.isPending?<p>{m.loading||'…'}</p>:!history.length?<p className="py-3 text-sm text-slate-500">{m.empty}</p>:history.map(r=><div key={r.id} className="flex items-center gap-2 border-t border-slate-100 py-2.5"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600"><FileClock className="size-4"/></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{partners.find(p=>p.id===r.partner_id)?.name||m.account}</p><p className="text-[11px] text-slate-500">{r.effective_date} · {r.kind}</p></div><strong dir="ltr" className="shrink-0 text-xs tabular-nums">{bill(r.amount,r.currency,lang)}</strong></div>)}
  </section>
 </section>;
}
