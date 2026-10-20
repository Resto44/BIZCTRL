import React,{useMemo,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {ArrowDownLeft,ArrowRight,ArrowUpRight,Building2,CheckCircle2,Clock3,Copy,FileText,Landmark,RefreshCw,Send,ShieldCheck,Users,Wallet,XCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';

const L={
 en:{
  title:'Wallet Banking Center',arabic:'مركز المحفظة البنكية',sub:'Internal business wallet for verified people and owner-approved transfers',
  account:'Wallet Account ID',linked:'Linked Business',active:'Active',currency:'Currency',
  balance:'Available Wallet Balance',pending:'Pending Transfers',received:'Transfers In',sent:'Transfers Out',
  actions:'Quick Actions',transfer:'Transfer',receive:'Receive',statement:'Statement',beneficiaries:'Beneficiaries',
  treasury:'Linked to Owner Treasury',treasurySub:'Owner-approved internal transfers are posted with a linked Treasury movement.',
  recent:'Recent Transactions',all:'View all',payer:'Payer',payee:'Recipient',
  posted:'Posted',rejected:'Rejected',pendingStatus:'Pending Owner Review',note:'Note',today:'Date',
  transferTitle:'Return wallet funds to business',receiveTitle:'Request funds from business',
  transferHelp:'Available balance only. This records a request; no bank payment happens.',
  receiveHelp:'Ask the owner to allocate business Treasury funds into your internal wallet.',
  submit:'Submit for owner approval',amount:'Amount',message:'Reason / reference',cancel:'Cancel',
  reviews:'Transfer Approvals',approve:'Approve & Post',reject:'Reject',approvalNote:'Approval / rejection reason (minimum 8 characters)',
  source:'Owner Treasury account',none:'No activity in this currency',noWallet:'No approved wallet account selected.',
  noSource:'No eligible, same-currency Treasury account exists.',insufficient:'Please confirm available Treasury balance before approving.',
  select:'Select account',accounts:'Wallet accounts',ownerInfo:'Select a person to review their wallet and pending transactions.',
  bankNotice:'This is an internal ERP ledger, not a bank account or external payment system. Old loans and custody stay archived, never added to spendable funds.',
  processing:'Processing…',refresh:'Refresh',error:'Unable to load verified wallet records. No balance is assumed.',success:'The request was submitted.',reviewed:'Owner review completed.',currencySafe:'Each currency is accounted for separately.',copy:'Copy internal wallet ID',empty:'No personal wallets yet. Add/approve a person in membership management.',
  waiting:'Awaiting verification',reason:'Explain the transfer',activeAccount:'Selected wallet account',postedOnce:'Each approval creates one linked Treasury transaction and two balancing wallet entries.',
 },
 ar:{
  title:'مركز المحفظة البنكية',arabic:'Wallet Banking Center',sub:'محفظة داخلية للأشخاص المعتمدين وتحويلات تحت موافقة المالك',
  account:'رقم حساب المحفظة',linked:'المنشأة المرتبطة',active:'نشط',currency:'العملة',
  balance:'الرصيد المتاح بالمحفظة',pending:'التحويلات قيد المعالجة',received:'التحويلات الواردة',sent:'التحويلات الصادرة',
  actions:'إجراءات سريعة',transfer:'تحويل',receive:'استلام',statement:'كشف الحساب',beneficiaries:'المستفيدون',
  treasury:'مرتبطة بخزينة المالك',treasurySub:'تُرحل التحويلات المعتمدة داخلياً مع حركة خزينة مرتبطة.',
  recent:'أحدث المعاملات',all:'عرض الكل',payer:'من حساب',payee:'إلى حساب',
  posted:'تم الترحيل',rejected:'مرفوض',pendingStatus:'بانتظار موافقة المالك',note:'ملاحظة',today:'التاريخ',
  transferTitle:'إعادة الرصيد إلى المنشأة',receiveTitle:'طلب رصيد من المنشأة',
  transferHelp:'في حدود الرصيد المتاح؛ هذا طلب وليس تحويلاً بنكياً خارجياً.',
  receiveHelp:'اطلب تخصيص أموال من خزينة المالك إلى محفظتك الداخلية.',
  submit:'إرسال للموافقة',amount:'المبلغ',message:'السبب / المرجع',cancel:'إلغاء',
  reviews:'اعتماد التحويلات',approve:'اعتماد وترحيل',reject:'رفض',approvalNote:'سبب الاعتماد أو الرفض (٨ أحرف على الأقل)',
  source:'حساب خزينة المالك',none:'لا معاملات بهذه العملة',noWallet:'لم يُحدد حساب محفظة معتمد.',
  noSource:'لا يوجد حساب خزينة مؤهل بهذه العملة.',insufficient:'تحقق من توفر رصيد الخزينة قبل الاعتماد.',
  select:'اختر الحساب',accounts:'حسابات المحفظة',ownerInfo:'اختر شخصاً لمراجعة محفظته والتحويلات المعلقة.',
  bankNotice:'دفتر داخلي في ERP، ليس حساباً بنكياً أو نظام دفع خارجي. القروض والعهد القديمة مؤرشفة ولا تدخل في الرصيد المتاح.',
  processing:'جاري التنفيذ…',refresh:'تحديث',error:'تعذر قراءة المحفظة الموثقة. لن نفترض رصيداً صفرياً.',success:'تم إرسال الطلب.',reviewed:'اكتملت مراجعة المالك.',currencySafe:'تُحاسب كل عملة على حدة.',copy:'نسخ المعرف الداخلي',empty:'لا توجد محفظة شخصية. أضف أو اعتمد عضوية الشخص أولاً.',
  waiting:'بانتظار التحقق',reason:'سبب التحويل',activeAccount:'الحساب المختار',postedOnce:'كل اعتماد ينتج حركة خزينة واحدة وقيدين متوازنين في المحفظة.',
 },
 fa:{
  title:'مرکز بانکداری والت',arabic:'Wallet Banking Center',sub:'والت داخلی برای اشخاص تأییدشده و انتقال‌های دارای تأیید اونر',
  account:'شناسه حساب والت',linked:'بیزنس مرتبط',active:'فعال',currency:'ارز',
  balance:'موجودی قابل‌استفاده والت',pending:'انتقال‌های در انتظار',received:'انتقال‌های ورودی',sent:'انتقال‌های خروجی',
  actions:'عملیات سریع',transfer:'انتقال',receive:'دریافت',statement:'صورت‌حساب',beneficiaries:'حساب‌های اشخاص',
  treasury:'مرتبط به خزانه اونر',treasurySub:'انتقال داخلی پس از تأیید اونر با یک حرکت خزانه مرتبط ثبت می‌شود.',
  recent:'آخرین معاملات',all:'نمایش همه',payer:'از حساب',payee:'به حساب',
  posted:'ثبت قطعی',rejected:'ردشده',pendingStatus:'منتظر تأیید اونر',note:'یادداشت',today:'تاریخ',
  transferTitle:'برگشت موجودی والت به کسب‌وکار',receiveTitle:'درخواست دریافت وجه از بیزنس',
  transferHelp:'فقط تا موجودی قابل‌استفاده. این درخواست است؛ پول به بانک بیرونی انتقال نمی‌یابد.',
  receiveHelp:'از اونر بخواهید از خزانه، به حساب والت داخلی‌تان وجه اختصاص دهد.',
  submit:'ارسال برای تأیید اونر',amount:'مبلغ',message:'دلیل / مرجع',cancel:'انصراف',
  reviews:'تأیید انتقال‌ها',approve:'تأیید و ثبت قطعی',reject:'رد درخواست',approvalNote:'دلیل تأیید یا رد (حداقل ۸ حرف)',
  source:'حساب خزانه اونر',none:'برای این ارز معامله‌ای نیست',noWallet:'حساب والت تأییدشده انتخاب نشده است.',
  noSource:'حساب خزانه مناسب با همین ارز موجود نیست.',insufficient:'پیش از تأیید، موجودی خزانه را بررسی کنید.',
  select:'انتخاب حساب',accounts:'حساب‌های والت',ownerInfo:'شخص موردنظر را برای بررسی موجودی و درخواست‌هایش انتخاب کنید.',
  bankNotice:'این یک دفتر داخلی ERP است، نه حساب بانکی یا سیستم پرداخت خارجی. قرض و امانت قدیمی فقط در آرشیو محفوظ‌اند و به موجودی قابل‌مصرف تبدیل نمی‌شوند.',
  processing:'در حال اجرا…',refresh:'تازه‌سازی',error:'خواندن اطلاعات معتبر والت ناموفق شد؛ موجودی فرضی نشان داده نمی‌شود.',success:'درخواست ثبت شد.',reviewed:'بررسی اونر انجام شد.',currencySafe:'هر ارز حساب جداگانه دارد.',copy:'کاپی شناسه والت',empty:'هنوز والت شخصی نیست. ابتدا عضویت شخص را اضافه یا تأیید کنید.',
  waiting:'منتظر تأیید',reason:'دلیل انتقال',activeAccount:'حساب انتخاب‌شده',postedOnce:'هر تأیید یک حرکت خزانه و دو سطر مالی متوازن ثبت می‌کند.',
 }
};
const num=(v,lang)=>new Intl.NumberFormat(lang==='ar'?'ar-SA':lang==='fa'?'fa-AF':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v)||0);
const cardThemes={
 balance:'border-teal-200 bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-800',
 pending:'border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 text-orange-800',
 received:'border-blue-200 bg-gradient-to-br from-blue-50 to-sky-50 text-blue-900',
 sent:'border-rose-200 bg-gradient-to-br from-rose-50 to-red-50 text-rose-800',
};
function MoneyCard({label,value,currency,icon:Icon,tone,loading,onClick}){
 return <button type="button" onClick={onClick} className={'min-w-0 rounded-2xl border p-3.5 text-start shadow-sm sm:p-4 '+cardThemes[tone]}>
   <span className="flex items-center gap-2.5"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/70"><Icon className="size-5"/></span><span className="min-w-0 text-xs font-bold leading-5 sm:text-sm">{label}</span></span>
   <strong dir="ltr" className="mt-3 block break-words text-start text-xl font-black tabular-nums sm:text-2xl">{loading?'…':value===null?'—':num(value,'en')} <small className="text-sm">{currency}</small></strong>
 </button>;
}

export default function WalletBankingCenter({person=null,owner=false,lang='en',onBeneficiaries,embedded=false}){
 const t=L[lang]||L.en,client=useQueryClient();
 const [currency,setCurrency]=useState('SAR'),[panel,setPanel]=useState('home'),[kind,setKind]=useState('fund_wallet');
 const [amount,setAmount]=useState(''),[note,setNote]=useState(''),[requestId,setRequestId]=useState(()=>crypto.randomUUID()),[reviewId,setReviewId]=useState(null),[reviewNote,setReviewNote]=useState(''),[treasuryId,setTreasuryId]=useState('');
 const [limit,setLimit]=useState(5),[message,setMessage]=useState('');
 const query=useQuery({queryKey:['erp-bank-wallet',person?.id],enabled:!!person?.id,
  queryFn:async()=>{
   const {data,error}=await supabase.rpc('erp_bank_wallet_dashboard',{p_person:person.id,p_limit:100});
   if(error)throw error;
   if(!data||!Array.isArray(data.currencies)||!Array.isArray(data.transactions))throw Error('WALLET_INCOMPLETE_SNAPSHOT');
   return data;
  },staleTime:10000,refetchInterval:20000});
 // Funding sources must use the same authoritative posted balance calculation
 // as the owner approval RPC; opening_balance alone is often zero in legacy data.
 const accounts=useQuery({queryKey:['erp-bank-wallet-treasury',person?.restaurant_id,activeCurrency],
  enabled:owner&&!!person?.restaurant_id&&!!activeCurrency,
  queryFn:async()=>{
   const {data,error}=await supabase.rpc('erp_bank_wallet_owner_funding_accounts',{
    p_restaurant:person.restaurant_id,p_currency:activeCurrency
   });
   if(error)throw error;
   if(!Array.isArray(data)||data.some(a=>!a.id||a.currency!==activeCurrency||!Number.isFinite(Number(a.available_balance))))throw Error('WALLET_FUNDING_SNAPSHOT_INVALID');
   return data;
  },staleTime:10000,refetchInterval:15000});
 const currencies=useMemo(()=>[...new Set(['SAR',...(query.data?.currencies||[]).map(x=>x.currency),...(query.data?.transactions||[]).map(x=>x.currency)])], [query.data]);
 const activeCurrency=currencies.includes(currency)?currency:currencies[0]||'SAR';
 const current=(query.data?.currencies||[]).find(x=>x.currency===activeCurrency);
 const transactions=(query.data?.transactions||[]).filter(x=>x.currency===activeCurrency);
 const pending=transactions.filter(x=>x.status==='pending');
 const selectedRequest=transactions.find(x=>x.id===reviewId&&x.status==='pending');
 const eligible=(accounts.data||[]).filter(x=>x.currency===activeCurrency);
 const selectedTreasury=eligible.find(x=>x.id===treasuryId);
 const sufficientForFunding=!!selectedRequest&&selectedRequest.kind!=='fund_wallet'||(!!selectedTreasury&&Number(selectedTreasury.available_balance)>=Number(selectedRequest.amount));
 const invalidate=async()=>{await client.invalidateQueries({queryKey:['erp-bank-wallet',person?.id]});};
 const request=useMutation({mutationFn:async()=>{
   const raw=Number(amount);
   if(!/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?$/.test(amount)||!Number.isFinite(raw)||raw<=0||raw>10000000)throw Error('INVALID_AMOUNT');
   const {error}=await supabase.rpc('erp_bank_wallet_request',{
    p_person:person.id,p_kind:kind,p_amount:raw,p_currency:activeCurrency,
    p_request_id:requestId,p_note:note.trim()
   });if(error)throw error;
  },onSuccess:async()=>{setAmount('');setNote('');setRequestId(crypto.randomUUID());setPanel('home');setMessage(t.success);await invalidate();},
   onError:e=>setMessage(e?.message||t.error)});
 const review=useMutation({mutationFn:async approved=>{
   const {error}=await supabase.rpc('erp_bank_wallet_review',{
    p_request_id:reviewId,p_approve:approved,p_treasury_account:approved?treasuryId:null,
    p_review_note:reviewNote.trim()
   });if(error)throw error;
  },onSuccess:async()=>{setReviewId(null);setReviewNote('');setTreasuryId('');setPanel('home');setMessage(t.reviewed);await Promise.all([invalidate(),client.invalidateQueries({queryKey:['erp-bank-wallet-treasury',person?.restaurant_id]})]);},
   onError:e=>setMessage(e?.message||t.error)});
 const submit=()=>{
   setMessage('');request.mutate();
 };
 const selectReview=r=>{setReviewId(r.id);setReviewNote('');setTreasuryId('');setMessage('');setPanel('review');};
 const start=next=>{setMessage('');setPanel(next);setRequestId(crypto.randomUUID());if(next==='transfer')setKind('return_to_owner');if(next==='receive')setKind('fund_wallet');};
 const loaded=!query.isPending&&!query.isError;
 const canSubmit=loaded&&!!person?.id&&!owner&&amount!==''&&Number(amount)>0&&!request.isPending;
 const canApprove=loaded&&owner&&!!selectedRequest&&reviewNote.trim().length>=8&&!review.isPending&&!accounts.isFetching&&!accounts.isError&&!!selectedTreasury&&sufficientForFunding;
 const canReject=loaded&&owner&&!!selectedRequest&&reviewNote.trim().length>=8&&!review.isPending;
 const status=r=>r.status==='posted'?t.posted:r.status==='rejected'?t.rejected:t.pendingStatus;
 const direction=r=>r.kind==='fund_wallet'?'incoming':'outgoing';
 return <section dir={lang==='en'?'ltr':'rtl'} className="mx-auto max-w-6xl min-w-0 space-y-3 pb-20 sm:space-y-4">
   <header className="relative min-w-0 overflow-hidden rounded-b-[30px] bg-gradient-to-br from-blue-700 via-blue-900 to-slate-950 p-5 text-white shadow-lg sm:rounded-[26px] sm:p-7">
     <div className="pointer-events-none absolute -end-24 -top-20 size-72 rounded-full border-[70px] border-white/5"/>
     <p className="text-xs font-bold tracking-widest text-blue-200">BizCTRL · ERP Business Suite</p>
     <h1 className="relative mt-3 text-2xl font-black tracking-tight sm:text-4xl">{t.title}</h1>
     <p className="relative mt-1 text-base font-bold text-blue-100">{t.arabic}</p>
     <p className="relative mt-2 max-w-md text-xs leading-5 text-blue-100">{t.sub}</p>
   </header>
   {!person?<p className="rounded-2xl border bg-white p-5 text-center text-sm">{t.noWallet}</p>:<>
     <div className="min-w-0 rounded-[22px] border border-blue-100 bg-white p-4 shadow-md sm:p-5">
       <div className="flex min-w-0 flex-wrap items-center gap-3">
         <span className="grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-blue-800 text-white"><Users className="size-7"/></span>
         <div className="min-w-0 flex-1">
           <p dir="auto" className="break-words text-xl font-black text-slate-950">{query.data?.person_name||person.name}</p>
           <p className="mt-1 text-xs font-semibold text-emerald-700">{t.active}</p>
           <p className="mt-2 text-xs text-slate-600">{t.account}</p>
           <div className="flex min-w-0 items-center gap-1.5">
             <span dir="ltr" className="min-w-0 break-all font-mono text-xs font-bold text-blue-900">{query.data?.account_reference||'…'}</span>
             {query.data?.account_reference&&<button aria-label={t.copy} title={t.copy} type="button" className="grid size-9 shrink-0 place-items-center rounded-lg text-blue-600" onClick={()=>navigator.clipboard?.writeText(query.data.account_reference)}><Copy className="size-4"/></button>}
           </div>
         </div>
       </div>
       <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t pt-3">
         <div className="min-w-0"><p className="flex items-center gap-1.5 text-xs text-slate-600"><Building2 className="size-4"/>{t.linked}</p><strong dir="auto" className="mt-1 block break-words text-sm font-black text-slate-900">{query.data?.business_name||person.business||'…'}</strong></div>
         <label className="text-xs font-bold text-slate-600">{t.currency}
           <select aria-label={t.currency} className="mt-1 block min-h-11 rounded-xl border bg-white px-3 text-sm font-black text-slate-900" value={activeCurrency} onChange={e=>{setCurrency(e.target.value);setPanel('home');}}>{currencies.map(c=><option key={c} value={c}>{c}</option>)}</select>
         </label>
       </div>
     </div>
     {query.isError&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{t.error}<Button variant="outline" size="sm" className="ms-2" onClick={()=>query.refetch()}>{t.refresh}</Button></div>}
     <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
       <MoneyCard tone="balance" icon={Wallet} label={t.balance} currency={activeCurrency} loading={query.isPending} value={loaded?(current?.balance??0):null} onClick={()=>start('statement')}/>
       <MoneyCard tone="pending" icon={Clock3} label={t.pending} currency={activeCurrency} loading={query.isPending} value={loaded?(current?.pending_amount??0):null} onClick={()=>start('pending')}/>
       <MoneyCard tone="received" icon={ArrowDownLeft} label={t.received} currency={activeCurrency} loading={query.isPending} value={loaded?(current?.transfers_in??0):null} onClick={()=>start('statement')}/>
       <MoneyCard tone="sent" icon={ArrowUpRight} label={t.sent} currency={activeCurrency} loading={query.isPending} value={loaded?(current?.transfers_out??0):null} onClick={()=>start('statement')}/>
     </div>
     <div className="min-w-0 rounded-2xl border bg-white p-3.5 shadow-sm sm:p-5">
       <h2 className="text-lg font-black text-slate-950">{t.actions}</h2>
       <div className="mt-3 grid grid-cols-4 gap-2">
         {[
           {key:'transfer',icon:Send,active:'bg-blue-50 text-blue-700'},
           {key:'receive',icon:ArrowDownLeft,active:'bg-emerald-50 text-emerald-700'},
           {key:'statement',icon:FileText,active:'bg-violet-50 text-violet-700'},
           {key:'beneficiaries',icon:Users,active:'bg-sky-50 text-sky-700'},
         ].map(({key,icon:Icon,active})=><button key={key} type="button" onClick={()=>key==='beneficiaries'&&onBeneficiaries?onBeneficiaries():start(owner&&(key==='transfer'||key==='receive')?'pending':key)} className={'flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-xl p-2 text-center text-xs font-black leading-5 '+active}>
           <span className="grid size-11 place-items-center rounded-full bg-white/80"><Icon className="size-5"/></span><span className="break-words">{t[key]}</span>
         </button>)}
       </div>
     </div>
     <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm">
       <span className="grid size-12 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-700"><Landmark className="size-6"/></span>
       <div className="min-w-0 flex-1"><h3 className="text-sm font-black text-slate-900">{t.treasury}</h3><p className="mt-1 text-xs leading-5 text-slate-600">{t.treasurySub}</p></div>
       <span className="flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="size-4"/> ERP</span>
     </div>
     {message&&<p role="status" className="rounded-xl border bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
     {(panel==='transfer'||panel==='receive')&&!owner&&<div className="space-y-3 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm">
       <h3 className="text-lg font-black">{panel==='transfer'?t.transferTitle:t.receiveTitle}</h3>
       <p className="text-xs leading-5 text-slate-600">{panel==='transfer'?t.transferHelp:t.receiveHelp}</p>
       <label className="block text-xs font-bold">{t.amount}
         <Input type="number" inputMode="decimal" min="0.01" max="10000000" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} className="mt-1 h-12"/>
       </label>
       <label className="block text-xs font-bold">{t.reason}
         <Textarea rows={2} maxLength={500} value={note} onChange={e=>setNote(e.target.value)} className="mt-1"/>
       </label>
       <div className="flex gap-2"><Button type="button" disabled={!canSubmit} onClick={submit} className="min-h-11 flex-1">{request.isPending?t.processing:t.submit}</Button><Button variant="outline" type="button" onClick={()=>setPanel('home')}>{t.cancel}</Button></div>
     </div>}
     {panel==='review'&&owner&&selectedRequest&&<div className="space-y-3 rounded-2xl border border-orange-200 bg-white p-4">
       <h3 className="font-black">{t.reviews}</h3>
       <p className="text-xs">{selectedRequest.payer} → {selectedRequest.payee} · {num(selectedRequest.amount,lang)} {selectedRequest.currency}</p>
       <label className="block text-xs font-bold">{t.source}
         <select value={treasuryId} onChange={e=>setTreasuryId(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border p-2">
           <option value="">{t.select}</option>
           {eligible.filter(x=>x.currency===selectedRequest.currency).map(x=><option key={x.id} value={x.id} disabled={selectedRequest.kind==='fund_wallet'&&Number(x.available_balance)<Number(selectedRequest.amount)}>{x.account_name} · {new Intl.NumberFormat(lang==='ar'?'ar-SA':lang==='fa'?'fa-AF':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(x.available_balance))} {x.currency}</option>)}
         </select>
       </label>
       {accounts.isPending&&<p role="status" className="text-xs text-slate-600">{t.processing}</p>}
       {accounts.isError&&<p role="alert" className="text-xs text-rose-700">{t.error} <Button type="button" variant="outline" size="sm" onClick={()=>accounts.refetch()}>{t.refresh}</Button></p>}
       {accounts.isSuccess&&!eligible.length&&<p className="text-xs text-orange-700">{t.noSource}</p>}
       {selectedTreasury&&<p className="rounded-lg bg-blue-50 p-2 text-xs font-semibold text-blue-950">{selectedTreasury.account_name} · {new Intl.NumberFormat(lang==='ar'?'ar-SA':lang==='fa'?'fa-AF':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(selectedTreasury.available_balance))} {selectedTreasury.currency}</p>}
       {accounts.isSuccess&&selectedRequest.kind==='fund_wallet'&&eligible.every(a=>Number(a.available_balance)<Number(selectedRequest.amount))&&<p role="alert" className="text-xs text-amber-800">{t.insufficient}</p>}
       {accounts.isSuccess&&selectedTreasury&&!sufficientForFunding&&<p role="alert" className="text-xs text-amber-800">{t.insufficient}</p>}
       <label className="block text-xs font-bold">{t.approvalNote}
         <Textarea rows={2} maxLength={500} value={reviewNote} onChange={e=>setReviewNote(e.target.value)} className="mt-1"/>
       </label>
       {reviewNote.trim().length<8&&<p className="text-xs font-semibold text-amber-800">{t.approvalNote}</p>}
       <p className="text-xs text-slate-600">{t.postedOnce}</p>
       <div className="flex flex-wrap gap-2"><Button disabled={!canApprove} onClick={()=>review.mutate(true)} className="min-h-11 bg-emerald-700">{t.approve}</Button><Button variant="destructive" disabled={!canReject} onClick={()=>review.mutate(false)} className="min-h-11">{t.reject}</Button><Button variant="outline" onClick={()=>setPanel('home')}>{t.cancel}</Button></div>
     </div>}
     <section className="min-w-0 rounded-2xl border bg-white shadow-sm">
       <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
         <h2 className="text-lg font-black text-slate-950">{panel==='pending'?t.reviews:t.recent}</h2>
         <Button variant="ghost" onClick={()=>{setPanel(panel==='statement'?'home':'statement');setLimit(100);}}>{t.all}<ArrowRight className="ms-1 size-4"/></Button>
       </div>
       {query.isPending?<p className="p-4 text-sm text-slate-500">{t.processing}</p>:
        loaded&&!(panel==='pending'?pending:transactions.slice(0,panel==='statement'?100:limit)).length?<p className="p-5 text-center text-sm text-slate-600">{t.none}</p>:
        <div className="divide-y">{(panel==='pending'?pending:transactions.slice(0,panel==='statement'?100:limit)).map(r=>{
          const incoming=direction(r)==='incoming',isPosted=r.status==='posted';
          return <article key={r.id} className="min-w-0 space-y-2 p-3.5 sm:p-4">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className={'grid size-10 shrink-0 place-items-center rounded-full '+(r.status==='pending'?'bg-orange-50 text-orange-700':incoming?'bg-emerald-50 text-emerald-700':'bg-rose-50 text-rose-700')}>
                {r.status==='pending'?<Clock3 className="size-5"/>:incoming?<ArrowDownLeft className="size-5"/>:<ArrowUpRight className="size-5"/>}
              </span>
              <div className="min-w-0 flex-1">
                <div className="grid min-w-0 gap-1 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0 text-xs leading-6"><span dir="auto" className="break-all font-bold text-slate-900">{r.payer}</span><span className="mx-2 text-slate-400">→</span><span dir="auto" className="break-all font-bold text-slate-900">{r.payee}</span></div>
                  <strong dir="ltr" className={'text-start text-sm font-black tabular-nums '+(r.status==='pending'?'text-orange-700':incoming?'text-emerald-700':'text-rose-700')}>{!isPosted?'':incoming?'+':'−'}{num(r.amount,lang)} {r.currency}</strong>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{new Date(r.created_at).toLocaleDateString(lang==='en'?'en-GB':lang==='ar'?'ar-SA':'fa-IR')}</span>
                  <span className={'rounded-lg px-2 py-0.5 font-bold '+(r.status==='pending'?'bg-orange-50 text-orange-700':r.status==='posted'?'bg-emerald-50 text-emerald-700':'bg-rose-50 text-rose-700')}>{status(r)}</span>
                </div>
                {r.note&&<p dir="auto" className="mt-1 break-words text-xs text-slate-500">{r.note}</p>}
                {owner&&r.status==='pending'&&<Button size="sm" variant="outline" onClick={()=>selectReview(r)} className="mt-2 min-h-10">{t.reviews}</Button>}
              </div>
            </div>
          </article>;
        })}</div>}
     </section>
     <p className="flex items-start gap-1.5 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs leading-5 text-blue-950"><ShieldCheck className="mt-0.5 size-4 shrink-0"/>{t.bankNotice} {t.currencySafe}</p>
   </>}
 </section>;
}
