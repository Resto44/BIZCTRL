import React from 'react';
import {ArrowDownLeft,ArrowUpRight,BookOpen,CalendarDays,CheckCircle2,Clock3,Receipt} from 'lucide-react';
import {recentWalletActivity,walletPartiesForKind,walletAccountReference} from '@/lib/walletPersonalActivity';

const copy={
 en:{title:'Recent account activity',more:'Personal finance statement',custody:'Custody requests',loan:'Personal finance',business:'Business funds',posted:'Posted',approved:'Approved',pending:'Awaiting owner approval',rejected:'Rejected',reversed:'Reversed',reversalPosted:'Reversal entry posted',received:'Received business funds',returned:'Returned business funds',ownerLent:'Loan disbursement',personRepaid:'Loan repayment to business',personLent:'Loan provided to business',ownerRepaid:'Loan repayment from business',fromAccount:'From account',toAccount:'To account',walletId:'Personal wallet ID',payer:'Payer',payee:'Recipient',missingIdentity:'Account or business identity is unavailable; counterparty cannot be verified.',needsConfirm:'Awaiting account-holder acknowledgment',confirmed:'Acknowledged by account holder',empty:'No account activity for this currency',note:'Business custody is not personal spending balance. Entries from different sources are shown once and never netted.',source:'Source',cash:'Cash',network:'Bank / network'},
 ar:{title:'آخر حركة الحساب',more:'كشف التمويل الشخصي',custody:'طلبات العهدة',loan:'التمويل الشخصي',business:'أموال المنشأة',posted:'مرحل',approved:'معتمد',pending:'بانتظار موافقة المالك',rejected:'مرفوض',reversed:'معكوس',reversalPosted:'قيد عكسي مُرحّل',received:'استلام أموال المنشأة',returned:'إعادة أموال المنشأة',ownerLent:'صرف قرض',personRepaid:'سداد قرض للمنشأة',personLent:'قرض مقدّم للمنشأة',ownerRepaid:'استلام سداد قرض',fromAccount:'من حساب',toAccount:'إلى حساب',walletId:'معرف محفظة الشخص',payer:'المرسل',payee:'المستلم',missingIdentity:'تعذر التحقق من هوية الحساب أو المنشأة؛ لا يمكن تحديد طرفي المعاملة.',needsConfirm:'بانتظار إقرار صاحب الحساب',confirmed:'أقر صاحب الحساب بالمعاملة',empty:'لا توجد حركة بهذه العملة',note:'العهدة ليست رصيد إنفاق شخصي. كل حركة تظهر مرة واحدة فقط، ولا تتم مقاصة الأرصدة.',source:'المصدر',cash:'نقدي',network:'شبكة / بنك'},
 fa:{title:'آخرین گردش حساب',more:'صورت‌حساب قرض شخصی',custody:'درخواست‌های امانت',loan:'معاملات مالی شخصی',business:'پول کسب‌وکار',posted:'ثبت قطعی',approved:'تأییدشده',pending:'منتظر تأیید اونر',rejected:'ردشده',reversed:'برگشت‌شده',reversalPosted:'سند برگشتی ثبت شده',received:'دریافت پول کسب‌وکار',returned:'برگشت پول کسب‌وکار',ownerLent:'پرداخت قرض به حساب والت',personRepaid:'بازپرداخت قرض به بیزنس',personLent:'قرض پرداخت‌شده به بیزنس',ownerRepaid:'دریافت بازپرداخت قرض',fromAccount:'از حساب',toAccount:'به حساب',walletId:'شناسه حساب شخص',payer:'پرداخت‌کننده',payee:'دریافت‌کننده',missingIdentity:'هویت حساب یا نام بیزنس بارگذاری نشده؛ طرفین معامله قابل‌تأیید نیستند.',needsConfirm:'منتظر تأیید صاحب حساب',confirmed:'تأییدشده توسط صاحب حساب',empty:'در این ارز گردش حساب وجود ندارد',note:'امانت، موجودی قابل‌مصرف شخصی نیست. هر معامله فقط یک‌بار نمایش داده می‌شود و مانده‌ها تهاتر نمی‌شوند.',source:'منبع',cash:'نقد',network:'شبکه / بانک'}
};
const nameKeys={
 custody_received:'received',custody_returned:'returned',
 owner_advance_to_sponsor:'ownerLent',sponsor_repay_owner:'personRepaid',
 sponsor_advance_to_owner:'personLent',owner_repay_sponsor:'ownerRepaid',
};
export default function WalletUnifiedActivity({loans=[],custody=[],currency='',lang='en',account=null,onStatement,onRequests}){
 const t=copy[lang]||copy.en;
 const items=recentWalletActivity({loans,custody,currency,limit:10});
 // The posted source row has partner_id; the current user/owner must supply
 // that exact authorized person account and its verified business counterparty.
 const walletId=account?.account_reference||walletAccountReference(account?.id);
 const businessName=String(account?.business||'').trim();
 const partiesFor=row=>walletPartiesForKind(row.kind,{accountReference:walletId,businessName});
 const fmt=v=>new Intl.NumberFormat(lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
 const status=row=>row.status==='reversal_posted'?t.reversalPosted:row.status==='reversed'?t.reversed:row.status==='pending'?t.pending:
   row.status==='rejected'?t.rejected:row.status==='approved'?t.approved:t.posted;
 return <section className="min-w-0 space-y-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
   <div className="flex flex-wrap items-start justify-between gap-2">
     <div className="flex items-center gap-2"><span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><BookOpen className="size-5"/></span><h2 className="text-lg font-black text-slate-950">{t.title}</h2></div>
     <button type="button" onClick={onStatement} className="min-h-11 rounded-xl border border-slate-200 px-3 text-xs font-bold text-blue-700">{t.more}</button>
   </div>
   <p className="text-xs leading-5 text-slate-500">{t.note}</p>
   {!items.length?<p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-600">{t.empty}</p>:
     <div className="space-y-2.5">{items.map(row=>{
      const parties=partiesFor(row);
      // A pending custody request has not moved any funds: never render
      // a green received / red sent posted-payment badge for it.
      const pendingMovement=row.source==='business_custody'&&row.status==='pending';
      const direction=parties?.direction||row.direction;
      return <article key={row.key} className="min-w-0 rounded-2xl border border-slate-200 p-3.5">
       <div className="flex min-w-0 items-start gap-2.5">
         <span className={'grid size-10 shrink-0 place-items-center rounded-full '+(pendingMovement?'bg-violet-50 text-violet-700':direction==='incoming'?'bg-emerald-50 text-emerald-700':'bg-rose-50 text-rose-700')}>
           {direction==='incoming'?<ArrowDownLeft className="size-5"/>:<ArrowUpRight className="size-5"/>}
         </span>
         <div className="min-w-0 flex-1">
           <div className="flex flex-wrap items-start justify-between gap-2">
             <p className="min-w-0 flex-1 break-words text-sm font-extrabold text-slate-900">{t[nameKeys[row.kind]]||row.kind}</p>
             <strong dir="ltr" className={'shrink-0 text-sm font-black tabular-nums '+(pendingMovement?'text-violet-700':direction==='incoming'?'text-emerald-700':'text-rose-700')}>
               {pendingMovement?'':direction==='incoming'?'+':'−'}{fmt(row.amount)} {row.currency}
             </strong>
           </div>
           {parties?
             <div className="mt-2 grid min-w-0 gap-1.5 rounded-xl bg-slate-50 p-2.5 text-xs leading-5 text-slate-700">
               <p className="min-w-0"><span className="font-semibold text-slate-500">{t.payer}: </span><b dir="auto" className={parties.fromType==='wallet'?'break-all font-mono text-[11px] text-blue-800':'break-words font-bold text-slate-950'}>{parties.from}</b></p>
               <p className="min-w-0"><span className="font-semibold text-slate-500">{t.payee}: </span><b dir="auto" className={parties.toType==='wallet'?'break-all font-mono text-[11px] text-blue-800':'break-words font-bold text-slate-950'}>{parties.to}</b></p>
             </div>
           :<p role="alert" className="mt-2 text-xs text-amber-800">{t.missingIdentity}</p>}
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
     </article>})}</div>}
   <div className="grid grid-cols-2 gap-2">
     <button type="button" onClick={onStatement} className="min-h-11 rounded-xl border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700">{t.more}</button>
     <button type="button" onClick={onRequests} className="min-h-11 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">{t.custody}</button>
   </div>

 </section>;
}
