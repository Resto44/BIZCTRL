import React,{useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {Wallet,UserRound,HandCoins,ShieldCheck,ArrowLeftRight,FileText,ChevronDown,Clock3,Landmark,ArrowUpRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {readCashCustodyAndPending} from '@/lib/walletPersonPresentation';
import {walletAccountReference} from '@/lib/walletPersonalActivity';
import WalletUnifiedActivity from './WalletUnifiedActivity';

// A user sees only the account already returned by the membership-scoped RPC.
// Personal loan obligations and business custody must never be netted or described as spendable money.
const text={
 en:{title:'My Wallet',subtitle:'Your named internal account for transactions with your business owner',profile:'My account',identity:'Account holder',reference:'Internal wallet account ID · not a bank account',login:'Verified login',owed:'Business owes you',youOwe:'You owe business',funds:'Business funds in your custody',cash:'Cash held',network:'Bank / network held',pending:'Awaiting approval',actions:'What would you like to do?',loan:'Request an advance / repayment',custody:'Request a custody handover',statement:'Open full statement',detail:'View custody details',policy:'Personal loans are separate from money held for the business. Requests never move money before owner approval.',unavailable:'Business custody could not be loaded. Amounts are hidden.',retry:'Try again',currency:'Currency',active:'Account active',noAccess:'Transaction requests are disabled for your account.'},
 ar:{title:'محفظتي',subtitle:'حسابك الداخلي المسجل باسمك للمعاملات مع مالك المنشأة',profile:'حسابي',identity:'صاحب الحساب',reference:'معرف حساب المحفظة الداخلي · ليس حساباً بنكياً',login:'البريد الموثق',owed:'المستحق لك على المنشأة',youOwe:'المستحق للمنشأة عليك',funds:'أموال المنشأة بعهدتك',cash:'عهدة نقدية',network:'عهدة بنكية / شبكة',pending:'بانتظار الموافقة',actions:'ما الإجراء الذي تريده؟',loan:'طلب سلفة / سداد',custody:'طلب تسليم عهدة',statement:'فتح كشف الحساب الكامل',detail:'عرض تفاصيل العهدة',policy:'السلف الشخصية منفصلة عن أموال المنشأة بعهدتك. الطلب لا يحرك المال قبل اعتماد المالك.',unavailable:'تعذر تحميل أرصدة العهدة، لن تظهر أرقام ناقصة.',retry:'إعادة المحاولة',currency:'العملة',active:'الحساب نشط',noAccess:'لا يمكنك إرسال معاملات من هذا الحساب.'},
 fa:{title:'والت من',subtitle:'حساب داخلی به نام خودتان برای معاملات با اونر کسب‌وکار',profile:'حساب من',identity:'صاحب حساب',reference:'شناسه حساب داخلی والت · حساب بانکی نیست',login:'ورود تأییدشده',owed:'طلب شما از کسب‌وکار',youOwe:'بدهی شما به کسب‌وکار',funds:'پول کسب‌وکار به امانت نزد شما',cash:'امانت نقدی',network:'امانت بانکی / شبکه',pending:'منتظر تأیید',actions:'چه کاری می‌خواهید انجام دهید؟',loan:'درخواست قرض / بازپرداخت',custody:'درخواست تحویل امانت',statement:'بازکردن صورت‌حساب کامل',detail:'دیدن جزئیات امانت',policy:'قرض شخصی از پول امانتی کسب‌وکار جدا است. درخواست تا تأیید اونر پول را انتقال نمی‌دهد.',unavailable:'موجودی امانت بارگذاری نشد؛ رقم ناقص نمایش داده نمی‌شود.',retry:'تلاش دوباره',currency:'ارز',active:'حساب فعال',noAccess:'ارسال معامله برای این حساب غیرفعال است.'}
};
const amount=(value,currency,lang)=>new Intl.NumberFormat(lang==='ar'?'ar-SA':lang==='fa'?'fa-AF':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value))+' '+currency;
export default function WalletPortalERPOverview({partner,statement,lang='en',onLoan,onCustody,onStatement,onAccount}){
 const t=text[lang]||text.en;
 const [currency,setCurrency]=useState(''),[showCustody,setShowCustody]=useState(false);
 const query=useQuery({
  queryKey:['people-custody',partner.id,'portal-summary'],
  queryFn:async()=>{const {data,error}=await supabase.rpc('erp_person_custody',{p_person:partner.id,p_offset:0});if(error)throw error;if(!data||!Array.isArray(data.balances))throw Error('INCOMPLETE_CUSTODY_SNAPSHOT');return data;},
  refetchInterval:15000,staleTime:15000,
 });
 const currencies=useMemo(()=>[...new Set([...(statement?.balances||[]).map(r=>r.currency),...(query.data?.balances||[]).map(r=>r.currency)].filter(Boolean))].sort(),[statement?.balances,query.data]);
 const selected=currencies.includes(currency)?currency:currencies.includes('SAR')?'SAR':currencies[0]||'';
 const loans=(statement?.balances||[]).find(r=>r.currency===selected);
 const custody=readCashCustodyAndPending(query.data,selected);
 const network=query.isError||query.isPending?null:(query.data.balances||[]).filter(r=>r.currency===selected&&r.payment_method==='network').reduce((n,r)=>n+Number(r.held||0),0);
 const held=network!==null&&custody!==null?Number(custody.cash)+network:null;
 const formatted=(v)=>selected&&v!==undefined&&v!==null?amount(v,selected,lang):'—';
 const permitted=partner.can_submit!==false;
 return <section className="min-w-0 space-y-3" dir={lang==='en'?'ltr':'rtl'}>
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div className="min-w-0"><h1 className="text-2xl font-black tracking-tight text-slate-950">{t.title}</h1><p className="mt-0.5 text-sm text-slate-500">{t.subtitle}</p></div>
   <label className="text-xs font-semibold text-slate-500">{t.currency}<select aria-label={t.currency} value={selected} onChange={e=>setCurrency(e.target.value)} className="mt-1 block min-h-11 min-w-24 rounded-xl border border-slate-200 bg-white px-2 font-bold" disabled={!currencies.length}>{currencies.map(c=><option key={c}>{c}</option>)}</select></label>
  </div>
  <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
   <span className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-700"><UserRound className="size-5"/></span>
   <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold text-slate-500">{t.identity}</p><p dir="auto" className="break-words font-extrabold text-slate-950">{partner.name}</p><p className="truncate text-xs text-slate-500">{partner.business} · {partner.account_role||'partner'}</p><p className="text-xs text-emerald-700">{t.active}</p></div>
   <Button type="button" variant="outline" size="sm" className="min-h-10 shrink-0" onClick={onAccount}>{t.profile}</Button>
  </div>
  <section className="min-w-0 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-3.5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-blue-800">{t.reference}</p><span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">{t.active}</span></div>
    <p dir="ltr" className="mt-2 break-all text-start font-mono text-xs font-bold tracking-wide text-slate-900 sm:text-sm">{partner.account_reference||walletAccountReference(partner.id)}</p>
    <p className="mt-2 text-xs text-slate-600">{t.login}: <span dir="ltr" className="inline-block max-w-full break-all font-semibold">{partner.login_email||'—'}</span></p>
  </section>
  <div className="grid grid-cols-2 gap-2.5">
   {[[t.owed,loans?.owner_owes,HandCoins,'text-emerald-700 bg-emerald-50'],[t.youOwe,loans?.partner_owes,ArrowUpRight,'text-amber-700 bg-amber-50']].map(([label,value,Icon,tone])=><article key={label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
    <span className={`grid size-9 place-items-center rounded-xl ${tone}`}><Icon className="size-5"/></span><p className="mt-2 min-h-9 text-xs font-semibold leading-4 text-slate-600">{label}</p><p dir="ltr" className="break-words text-start text-lg font-black tabular-nums text-slate-950">{formatted(value)}</p>
   </article>)}
  </div>
  <div className="min-w-0 rounded-2xl border border-blue-100 bg-blue-50/40 p-3.5">
   <button type="button" aria-expanded={showCustody} onClick={()=>setShowCustody(v=>!v)} className="flex w-full items-center gap-3 text-start">
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700"><Wallet className="size-5"/></span>
    <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-600">{t.funds}</span><strong dir="ltr" className="mt-0.5 block text-start text-lg font-black tabular-nums text-slate-950">{query.isPending?'…':formatted(held)}</strong></span>
    <ChevronDown className={`size-5 shrink-0 text-slate-500 transition-transform ${showCustody?'rotate-180':''}`}/>
   </button>
   <div className="mt-2 flex items-center justify-between border-t border-blue-100 pt-2 text-xs font-semibold text-slate-600"><span className="flex items-center gap-1"><Clock3 className="size-3.5"/>{t.pending}</span><strong>{query.isPending?'…':query.isError?'—':custody?.pending??'—'}</strong></div>
   {query.isError&&<p role="alert" className="mt-2 text-xs text-rose-700">{t.unavailable} <Button type="button" size="sm" variant="outline" onClick={()=>query.refetch()}>{t.retry}</Button></p>}
   {showCustody&&!query.isError&&!query.isPending&&<div className="mt-3 grid grid-cols-2 gap-2 border-t border-blue-100 pt-3">{[[t.cash,custody?.cash],[t.network,network]].map(([label,value])=><div key={label} className="rounded-xl bg-white p-2.5"><p className="text-xs text-slate-500">{label}</p><p dir="ltr" className="mt-1 break-words text-start text-sm font-extrabold">{formatted(value)}</p></div>)}</div>}
  </div>
  <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3.5">
   <h2 className="text-sm font-black text-slate-900">{t.actions}</h2>
   <div className="grid grid-cols-1 gap-2 min-[370px]:grid-cols-2">
    {partner.allow_loans!==false&&<Button type="button" disabled={!permitted} onClick={onLoan} className="min-h-12 h-auto min-w-0 justify-start gap-2 whitespace-normal bg-blue-600 px-3 py-2 text-start text-xs"><HandCoins className="size-4 shrink-0"/>{t.loan}</Button>}
    {partner.allow_custody===true&&<Button type="button" disabled={!permitted} variant="outline" onClick={onCustody} className="min-h-12 h-auto min-w-0 justify-start gap-2 whitespace-normal px-3 py-2 text-start text-xs"><ArrowLeftRight className="size-4 shrink-0"/>{t.custody}</Button>}
   </div>
   {!permitted&&<p className="text-xs text-amber-700">{t.noAccess}</p>}
   <button type="button" onClick={onStatement} className="flex min-h-11 w-full items-center justify-between gap-2 border-t border-slate-100 pt-2 text-start text-sm font-bold text-blue-700"><span className="flex items-center gap-2"><FileText className="size-4"/>{t.statement}</span><ChevronDown className="size-4"/></button>
  </div>
  {!query.isPending&&!query.isError&&<WalletUnifiedActivity loans={statement?.records||[]} custody={query.data?.records||[]} account={partner} currency={selected} lang={lang} onStatement={onStatement} onRequests={onCustody}/>}
  <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-blue-600"/>{t.policy}</p>
 </section>;
}
