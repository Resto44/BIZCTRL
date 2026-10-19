import React,{useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {WalletCards,UserRound,HandCoins,Landmark,Clock3,ShieldCheck,ArrowLeftRight,FileText,LogIn,ArrowUpRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {readCashCustodyAndPending} from '@/lib/walletPersonPresentation';

const phrases={
 en:{title:'My Wallet',subtitle:'Your personal advances, business custody and requests',login:'Login activated',noLogin:'Account active — login pending',currency:'Currency',owed:'Business owes you',youOwe:'You owe business',cash:'Cash custody held',network:'Bank custody held',pending:'Pending custody requests',loan:'Request personal advance',custody:'Request custody transfer',statement:'View statement',account:'My account',separate:'Personal debts are not business cash. These figures are separate; requests do not change balances until approved.',error:'Balances cannot be loaded. Amounts are hidden to avoid misleading totals.',retry:'Retry',disable:'This account has no permission to submit requests.'},
 ar:{title:'محفظتي',subtitle:'سلفك الشخصية والعهد والطلبات',login:'الدخول مفعل',noLogin:'الحساب نشط والدخول بانتظار التفعيل',currency:'العملة',owed:'المستحق لك على المنشأة',youOwe:'المستحق للمنشأة عليك',cash:'عهدة نقدية لديك',network:'عهدة بنكية لديك',pending:'طلبات العهدة المعلقة',loan:'طلب سلفة شخصية',custody:'طلب تحويل عهدة',statement:'عرض كشف الحساب',account:'حسابي',separate:'الديون الشخصية ليست نقد المنشأة. الأرصدة منفصلة والطلبات لا تُرحّل قبل الموافقة.',error:'تعذر قراءة جميع الأرصدة، لن نعرض قيماً ناقصة.',retry:'إعادة المحاولة',disable:'ليس مسموحاً لهذا الحساب بإرسال طلبات.'},
 fa:{title:'والت من',subtitle:'قرض‌های شخصی، پول امانتی و درخواست‌های خودتان',login:'ورود فعال',noLogin:'حساب فعال؛ ورود در انتظار تأیید',currency:'ارز',owed:'طلب شما از کسب‌وکار',youOwe:'بدهی شما به کسب‌وکار',cash:'امانت نقدی نزد شما',network:'امانت بانکی نزد شما',pending:'درخواست‌های امانت منتظر تأیید',loan:'درخواست قرض شخصی',custody:'درخواست انتقال امانت',statement:'دیدن صورت‌حساب',account:'حساب من',separate:'قرض شخصی پول نقد کسب‌وکار نیست. مانده‌ها جدا هستند و درخواست تا تأیید، پول را جابه‌جا نمی‌کند.',error:'خواندن مانده‌ها ناموفق شد؛ رقم ناقص نمایش داده نمی‌شود.',retry:'تلاش دوباره',disable:'این حساب اجازه ارسال درخواست ندارد.'}
};
function format(value,currency,lang){return new Intl.NumberFormat(lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0))+' '+currency;}
export default function WalletPortalERPOverview({partner,statement,lang='en',onLoan,onCustody,onStatement,onAccount}){
 const t=phrases[lang]||phrases.en;
 const [currency,setCurrency]=useState('');
 const custody=useQuery({queryKey:['people-custody',partner.id,'portal-summary'],queryFn:async()=>{const {data,error}=await supabase.rpc('erp_person_custody',{p_person:partner.id,p_offset:0});if(error)throw error;if(!data||!Array.isArray(data.balances))throw Error('INVALID_CUSTODY');return data;},refetchInterval:15000,staleTime:15000});
 const choices=useMemo(()=>[...new Set([...(statement?.balances||[]).map(r=>r.currency),...(custody.data?.balances||[]).map(r=>r.currency)].filter(Boolean))].sort(),[statement?.balances,custody.data?.balances]);
 const selected=choices.includes(currency)?currency:choices.includes('SAR')?'SAR':choices[0]||'SAR';
 const loans=(statement?.balances||[]).find(r=>r.currency===selected);
 const balance=readCashCustodyAndPending(custody.data,selected);
 const network=(custody.data?.balances||[]).filter(r=>r.currency===selected&&r.payment_method==='network').reduce((n,r)=>n+Number(r.held||0),0);
 const cards=[
  {label:t.owed,value:loans?.owner_owes,icon:HandCoins,cls:'bg-blue-50 text-blue-700',pending:!statement},
  {label:t.youOwe,value:loans?.partner_owes,icon:ArrowUpRight,cls:'bg-orange-50 text-orange-700',pending:!statement},
  {label:t.cash,value:balance?.cash,icon:WalletCards,cls:'bg-emerald-50 text-emerald-700',pending:custody.isPending},
  {label:t.network,value:network,icon:Landmark,cls:'bg-violet-50 text-violet-700',pending:custody.isPending},
 ];
 return <section dir={lang==='en'?'ltr':'rtl'} className="min-w-0 space-y-3">
  <div className="flex items-end justify-between gap-3"><div className="min-w-0"><h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{t.title}</h1><p className="mt-1 text-sm text-slate-500">{t.subtitle}</p></div>
   <label className="text-xs font-semibold text-slate-600">{t.currency}<select className="mt-1 block min-h-11 w-24 rounded-xl border bg-white px-2 font-bold" value={selected} onChange={e=>setCurrency(e.target.value)}>{choices.length?choices.map(c=><option key={c}>{c}</option>):<option>SAR</option>}</select></label></div>
  <div className="flex min-w-0 items-center gap-3 rounded-[24px] border border-blue-100 bg-gradient-to-r from-blue-50 to-white p-4 shadow-sm">
   <span className="grid size-14 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-600"><UserRound className="size-7"/></span>
   <div className="min-w-0 flex-1"><p className="truncate text-lg font-black text-slate-950">{partner.name}</p><p className="text-sm font-semibold text-slate-500">{partner.account_role||'partner'} · {partner.business}</p><p className="mt-1 text-xs text-emerald-700">{partner.user_id?t.login:t.noLogin}</p></div>
   <Button variant="outline" size="sm" className="min-h-11 shrink-0" onClick={onAccount}>{t.account}</Button>
  </div>
  {custody.isError&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{t.error}<Button variant="outline" size="sm" className="ms-2" onClick={()=>custody.refetch()}>{t.retry}</Button></div>}
  <div className="grid grid-cols-2 gap-2.5">{cards.map(({label,value,icon:Icon,cls,pending})=><article key={label} className="min-w-0 rounded-[20px] border border-slate-200 bg-white p-3.5 shadow-sm"><span className={`grid size-10 place-items-center rounded-xl ${cls}`}><Icon className="size-5"/></span><p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{label}</p><strong dir="ltr" className="mt-2 block break-words text-start text-lg font-black tabular-nums text-slate-950">{pending?'…':value===undefined?'—':format(value,selected,lang)}</strong></article>)}</div>
  <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900"><span className="flex items-center gap-2"><Clock3 className="size-4"/>{t.pending}</span><span>{custody.isPending?'…':custody.isError?'—':balance?.pending??0}</span></div>
  <div className="grid grid-cols-2 gap-2">{[[t.loan,HandCoins,onLoan,partner.allow_loans!==false],[t.custody,ArrowLeftRight,onCustody,partner.allow_custody===true],[t.statement,FileText,onStatement,true],[t.account,LogIn,onAccount,true]].map(([title,Icon,action,allowed])=><Button key={title} variant="outline" disabled={!allowed||(title!==t.statement&&title!==t.account&&partner.can_submit===false)} onClick={action} className="min-h-16 h-auto min-w-0 justify-start gap-2 whitespace-normal rounded-xl bg-white px-3 py-2 text-start text-xs font-bold text-blue-700"><Icon className="size-5 shrink-0"/><span>{title}</span></Button>)}</div>
  {partner.can_submit===false&&<p className="text-xs text-amber-700">{t.disable}</p>}
  <p className="flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-900"><ShieldCheck className="mt-0.5 size-4 shrink-0"/>{t.separate}</p>
 </section>;
}
