import React from 'react';
import {ArrowDownLeft,ArrowUpRight,BookOpen,CalendarDays,CheckCircle2,Clock3,Receipt,ShieldCheck} from 'lucide-react';
import {recentWalletActivity} from '@/lib/walletPersonalActivity';

const copy={
 en:{title:'Account activity',more:'Full statement',custody:'Custody requests',loan:'Personal finance',business:'Business funds',posted:'Posted',approved:'Approved',pending:'Awaiting owner approval',rejected:'Rejected',reversed:'Reversed',received:'Received business funds',returned:'Returned business funds',ownerLent:'Business lent to person',personRepaid:'Person repaid business',personLent:'Person lent to business',ownerRepaid:'Business repaid person',needsConfirm:'Awaiting your receipt confirmation',confirmed:'Receipt confirmed',empty:'No account activity for this currency',note:'Business custody is not personal spending balance. Entries from different sources are shown once and never netted.',source:'Source',cash:'Cash',network:'Bank / network'},
 ar:{title:'حركة الحساب',more:'كشف الحساب الكامل',custody:'طلبات العهدة',loan:'التمويل الشخصي',business:'أموال المنشأة',posted:'مرحل',approved:'معتمد',pending:'بانتظار موافقة المالك',rejected:'مرفوض',reversed:'معكوس',received:'استلام أموال المنشأة',returned:'إعادة أموال المنشأة',ownerLent:'أقرضت المنشأة الشخص',personRepaid:'سدد الشخص للمنشأة',personLent:'أقرض الشخص المنشأة',ownerRepaid:'سددت المنشأة للشخص',needsConfirm:'بانتظار تأكيد الاستلام',confirmed:'تأكيد الاستلام',empty:'لا توجد حركة بهذه العملة',note:'العهدة ليست رصيد إنفاق شخصي. كل حركة تظهر مرة واحدة فقط، ولا تتم مقاصة الأرصدة.',source:'المصدر',cash:'نقدي',network:'شبكة / بنك'},
 fa:{title:'گردش حساب',more:'صورت‌حساب کامل',custody:'درخواست‌های امانت',loan:'معاملات مالی شخصی',business:'پول کسب‌وکار',posted:'ثبت قطعی',approved:'تأییدشده',pending:'منتظر تأیید اونر',rejected:'ردشده',reversed:'برگشت‌شده',received:'دریافت پول کسب‌وکار',returned:'برگشت پول کسب‌وکار',ownerLent:'کسب‌وکار به شخص قرض داد',personRepaid:'شخص به کسب‌وکار بازپرداخت کرد',personLent:'شخص به کسب‌وکار قرض داد',ownerRepaid:'کسب‌وکار به شخص بازپرداخت کرد',needsConfirm:'منتظر تأیید دریافت شما',confirmed:'دریافت تأییدشده',empty:'در این ارز گردش حساب وجود ندارد',note:'امانت، موجودی قابل‌مصرف شخصی نیست. هر معامله فقط یک‌بار نمایش داده می‌شود و مانده‌ها تهاتر نمی‌شوند.',source:'منبع',cash:'نقد',network:'شبکه / بانک'}
};
const nameKeys={
 custody_received:'received',custody_returned:'returned',
 owner_advance_to_sponsor:'ownerLent',sponsor_repay_owner:'personRepaid',
 sponsor_advance_to_owner:'personLent',owner_repay_sponsor:'ownerRepaid',
};
export default function WalletUnifiedActivity({loans=[],custody=[],currency='',lang='en',onStatement,onRequests}){
 const t=copy[lang]||copy.en;
 const items=recentWalletActivity({loans,custody,currency,limit:10});
 const fmt=v=>new Intl.NumberFormat(lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
 const status=row=>row.status==='reversed'?t.reversed:row.status==='pending'?t.pending:
   row.status==='rejected'?t.rejected:row.status==='approved'?t.approved:t.posted;
 return <section className="min-w-0 space-y-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
   <div className="flex flex-wrap items-start justify-between gap-2">
     <div className="flex items-center gap-2"><span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><BookOpen className="size-5"/></span><h2 className="text-lg font-black text-slate-950">{t.title}</h2></div>
     <button type="button" onClick={onStatement} className="min-h-11 rounded-xl border border-slate-200 px-3 text-xs font-bold text-blue-700">{t.more}</button>
   </div>
   <p className="text-xs leading-5 text-slate-500">{t.note}</p>
   {!items.length?<p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-600">{t.empty}</p>:
     <div className="space-y-2.5">{items.map(row=><article key={row.key} className="min-w-0 rounded-2xl border border-slate-200 p-3.5">
       <div className="flex min-w-0 items-start gap-2.5">
         <span className={'grid size-10 shrink-0 place-items-center rounded-full '+(row.direction==='incoming'?'bg-emerald-50 text-emerald-700':'bg-rose-50 text-rose-700')}>
           {row.direction==='incoming'?<ArrowDownLeft className="size-5"/>:<ArrowUpRight className="size-5"/>}
         </span>
         <div className="min-w-0 flex-1">
           <div className="flex flex-wrap items-start justify-between gap-2">
             <p className="min-w-0 flex-1 break-words text-sm font-extrabold text-slate-900">{t[nameKeys[row.kind]]||row.kind}</p>
             <strong dir="ltr" className={'shrink-0 text-sm font-black tabular-nums '+(row.direction==='incoming'?'text-emerald-700':'text-rose-700')}>
               {row.direction==='incoming'?'+':'−'}{fmt(row.amount)} {row.currency}
             </strong>
           </div>
           <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
             <span className="flex items-center gap-1"><CalendarDays className="size-3.5"/>{row.date}</span>
             <span className="flex items-center gap-1"><Receipt className="size-3.5"/>{row.source==='business_custody'?t.business:t.loan}</span>
             <span>{t[row.method]||row.method||'—'}</span>
           </div>
           <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-600">
             {row.status==='pending'?<Clock3 className="size-3.5 text-violet-600"/>:
               <CheckCircle2 className="size-3.5 text-emerald-700"/>}{status(row)}
             {row.confirmation==='awaiting_recipient'&&<span className="font-normal text-amber-700">· {t.needsConfirm}</span>}
             {row.confirmation==='confirmed'&&<span className="font-normal text-emerald-700">· {t.confirmed}</span>}
           </p>
           {row.reference&&<p dir="auto" className="mt-2 break-words text-xs text-slate-500">{row.reference}</p>}
           {row.notes&&<p dir="auto" className="mt-1 break-words text-xs text-slate-500">{row.notes}</p>}
         </div>
       </div>
     </article>)}</div>}
   <div className="grid grid-cols-2 gap-2">
     <button type="button" onClick={onStatement} className="min-h-11 rounded-xl border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700">{t.more}</button>
     <button type="button" onClick={onRequests} className="min-h-11 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">{t.custody}</button>
   </div>
   <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 size-4 shrink-0"/>{t.note}</p>
 </section>;
}
