import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { closingFundingProposal } from '@/lib/closing/ClosingFunding';
import { Button } from '@/components/ui/button';

const labels = {
 en: { title:'Fund the cash drawer', minimum:'Minimum to cover posted cash payments', count:'Amount needed to reconcile to the physical count', explain:'Funding is cash received, not sales. Confirm the actual source and amount; the physical count remains unchanged.', owner:'New owner cash', treasury:'Transfer from owner wallet', source:'Source account', destination:'Branch cash account', choose:'Choose account', amount:'Cash received', note:'Reason / payment reference (at least 10 characters)', received:'I confirm this cash was actually received for this drawer and shift.', settled:'Network funds have settled and are available for withdrawal.', post:'Record funding', retry:'Retry same funding request', saving:'Recording…', manager:'The owner must record or approve funding.', pending:'Confirmation is pending. Retry this request; its details are locked to prevent duplicate funding.', done:'Funding posted. Recount the drawer and review the closing.', unavailable:'Treasury accounts could not be loaded.', load:'Reload accounts', historical:'Treasury transfers here use today’s business date. Earlier dates require a reviewed accounting correction.', closed:'This or a later shift is finalized. Review the closed period before recording funding.', date:'Treasury funding for an earlier date requires review; its date cannot be silently changed.' },
 fa: { title:'تمویل صندوق نقد', minimum:'حداقل تمویل برای پرداخت‌های نقدی ثبت‌شده', count:'تمویل لازم برای تطبیق با شمارش نقد', explain:'تمویل، پول دریافت‌شده است و فروش نیست. منبع و مبلغ واقعی را تأیید کنید؛ شمارش نقد تغییر نمی‌کند.', owner:'نقد جدید از اونر', treasury:'انتقال از والت اونر', source:'حساب مبدأ', destination:'حساب نقد شعبه', choose:'انتخاب حساب', amount:'نقد دریافت‌شده', note:'دلیل / مرجع پرداخت (حداقل ۱۰ حرف)', received:'تأیید می‌کنم این نقد واقعاً برای همین صندوق و شیفت دریافت شده است.', settled:'وجه شبکه تسویه شده و قابل برداشت است.', post:'ثبت تمویل', retry:'تلاش مجدد همان تمویل', saving:'در حال ثبت…', manager:'ثبت یا تأیید تمویل باید توسط اونر انجام شود.', pending:'تأیید در انتظار است. همین درخواست را تکرار کنید؛ جزئیات برای جلوگیری از ثبت تکراری قفل است.', done:'تمویل ثبت شد؛ نقد صندوق را دوباره شمارش و کلوزینگ را بررسی کنید.', unavailable:'حساب‌های خزانه بارگذاری نشد.', load:'بارگذاری مجدد', historical:'انتقال خزانه در این بخش با تاریخ امروز ثبت می‌شود؛ تاریخ گذشته نیاز به اصلاح حسابداری بررسی‌شده دارد.', closed:'این شیفت یا شیفت بعدی نهایی شده است؛ ابتدا دورهٔ بسته‌شده بررسی شود.', date:'تمویل خزانه برای تاریخ گذشته نیاز به بررسی دارد؛ تاریخ پرداخت خودکار تغییر نمی‌کند.' },
 ar: { title:'تمويل الصندوق النقدي', minimum:'الحد الأدنى لتغطية المدفوعات النقدية المسجلة', count:'التمويل اللازم للمطابقة مع العد الفعلي', explain:'التمويل نقد مستلم وليس مبيعات. أكّد المصدر والمبلغ الفعلي؛ العد النقدي لا يتغير.', owner:'نقد جديد من المالك', treasury:'تحويل من محفظة المالك', source:'حساب المصدر', destination:'حساب نقد الفرع', choose:'اختر الحساب', amount:'النقد المستلم', note:'السبب / مرجع الدفع (10 أحرف على الأقل)', received:'أؤكد استلام هذا النقد فعلياً لهذا الصندوق والوردية.', settled:'تمت تسوية أموال الشبكة وهي متاحة للسحب.', post:'تسجيل التمويل', retry:'إعادة نفس طلب التمويل', saving:'جارٍ التسجيل…', manager:'يجب على المالك تسجيل التمويل أو اعتماده.', pending:'التأكيد معلّق. أعد نفس الطلب؛ التفاصيل مقفلة لمنع التمويل المكرر.', done:'تم تسجيل التمويل؛ أعد عد الصندوق وراجع الإقفال.', unavailable:'تعذر تحميل حسابات الخزينة.', load:'إعادة التحميل', historical:'تحويلات الخزينة هنا بتاريخ اليوم؛ التواريخ السابقة تحتاج تصحيحاً محاسبياً مراجعاً.', closed:'هذه الوردية أو وردية لاحقة مقفلة؛ راجع الفترة المقفلة قبل التمويل.', date:'تمويل الخزينة بتاريخ سابق يحتاج مراجعة؛ لا يمكن تغيير التاريخ تلقائياً.' },
};
export default function ClosingFundingPanel({restaurantId, branchId, branchKey, date, shift, cashierId, expectedCash, actualCash, role, lang='en', currency='SAR', onPosted, disabled=false, initialSource='owner'}) {
 const tr=labels[lang]||labels.en;
 const qc=useQueryClient();
 const proposal=closingFundingProposal(expectedCash,actualCash);
 // Owner/treasury may physically top up a counted shortage. Posting Cash In
 // also increases Expected Cash: do NOT clear the original short variance.
 // It needs a separate audited shortage settlement/correction.
 const physicalShortage=Number.isFinite(Number(expectedCash)) && expectedCash !== null &&
   actualCash !== null && Number.isFinite(Number(actualCash)) && Number(expectedCash)>=0
   ? Math.max(0,Math.round((Number(expectedCash)-Number(actualCash))*100)/100) : 0;
 const storageKey=`closing-funding:${restaurantId}:${branchId}:${date}:${shift}:${cashierId}`;
 const [pending,setPending]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(storageKey))||null;}catch{return null;}});
 const [source,setSource]=useState(pending?.p_source||initialSource);
 const [sourceId,setSourceId]=useState(pending?.p_source_account_id||'');
 const [destinationId,setDestinationId]=useState(pending?.p_destination_account_id||'');
 const [amount,setAmount]=useState(pending ? String(pending.p_amount) : '');
 const [note,setNote]=useState(pending?.p_note||'');
 const [received,setReceived]=useState(pending?.p_received||false);
 const [settled,setSettled]=useState(pending?.p_settled||false);
 const [busy,setBusy]=useState(false); const lock=useRef(false);
 const [error,setError]=useState('');const [success,setSuccess]=useState(false);
 const {data:accounts=[],isLoading,isError,refetch}=useQuery({
  queryKey:['closing-funding-accounts',restaurantId,branchId],enabled:role==='owner'&&source==='treasury'&&Boolean(restaurantId),
  queryFn:async()=>{const all=[];for(let offset=0;offset<10000;offset+=500){const {data,error:err}=await supabase.from('treasury_accounts').select('id,restaurant_id,branch_id,branch_key,account_name,account_type,currency,is_active').eq('restaurant_id',restaurantId).eq('is_active',true).order('id').range(offset,offset+499);if(err)throw err;all.push(...data);if(data.length<500)return all;}throw new Error('Too many accounts');},
 });
 const walletEnabled=role==='owner'&&source==='treasury'&&Boolean(restaurantId);
 const wallet=useQuery({
  queryKey:['closing-owner-wallet-balances',restaurantId,currency],enabled:walletEnabled,
  queryFn:async()=>{const {data,error}=await supabase.rpc('erp_bank_wallet_owner_funding_accounts',{p_restaurant:restaurantId,p_currency:currency});if(error)throw error;if(!Array.isArray(data))throw new Error('Wallet balances unavailable');return data;},
 });
 const period=useQuery({
  queryKey:['closing-funding-period',restaurantId,branchId,branchKey,date,shift],
  enabled:walletEnabled&&Boolean(branchId&&date&&shift),
  queryFn:async()=>{
   for(let offset=0;offset<10000;offset+=500){
    const {data,error}=await supabase.from('daily_sales').select('id,date,shift,branch_id,branch,closing_state').eq('restaurant_id',restaurantId).eq('closing_state','finalized').gte('date',date).order('date',{ascending:false}).order('id').range(offset,offset+499);
    if(error)throw error;
    const blocking=data.find(row=>(row.branch_id===branchId||(!row.branch_id&&row.branch===branchKey))&&(row.date>date||row.shift===shift||(shift==='Morning'&&row.shift==='Evening')));
    if(blocking)return blocking;
    if(data.length<500)return null;
   }
   throw new Error('Closing history requires review');
  },
 });
 const sources=accounts.filter(a=>!a.branch_id&&!a.branch_key&&a.currency===currency&&['cash','bank','digital_wallet','network_pos','clearing'].includes(a.account_type));
 const destinations=accounts.filter(a=>(a.branch_id===branchId||(!a.branch_id&&a.branch_key===branchKey))&&a.currency===currency&&['cash','petty_cash'].includes(a.account_type));
 const chosen=sources.find(a=>a.id===sourceId);const target=destinations.find(a=>a.id===destinationId);
 const balanceRow=wallet.data?.find(a=>a.id===sourceId);
 const walletBalance=balanceRow?.available_balance==null?null:Number(balanceRow.available_balance);
 const walletReady=wallet.isSuccess&&!wallet.isFetching&&period.isSuccess&&!period.isFetching&&!period.data&&Number.isFinite(walletBalance)&&Number(amount)<=walletBalance;
 const needsSettled=['network_pos','clearing'].includes(chosen?.account_type);
 const valid=Boolean(restaurantId&&branchId&&cashierId&&date&&shift&&received&&note.trim().length>=10&&/^\d+(?:\.\d{1,2})?$/.test(amount)&&Number(amount)>0&&Number(amount)<=1e9&&(source==='owner'||(!isLoading&&!isError&&walletReady&&chosen&&target&&chosen.currency===target.currency&&(!needsSettled||settled))));
 const submit=async()=>{
  if(lock.current||disabled||role!=='owner'||(!pending&&!valid))return;
  lock.current=true;setBusy(true);setError('');setSuccess(false);
  try{
   const request=pending||{p_request_id:crypto.randomUUID(),p_restaurant_id:restaurantId,p_branch_id:branchId,p_date:date,p_shift:shift,p_cashier_id:cashierId,p_amount:Number(amount),p_source:source,p_source_account_id:source==='treasury'?sourceId:null,p_destination_account_id:source==='treasury'?destinationId:null,p_note:note.trim(),p_received:received,p_settled:settled};
   sessionStorage.setItem(storageKey,JSON.stringify(request));setPending(request);
   const {data,error:err}=await supabase.rpc('erp_fund_sales_closing_drawer',request);if(err)throw err;
   if(!['posted','already_posted'].includes(data?.status))throw new Error('Funding not confirmed');
   sessionStorage.removeItem(storageKey);setPending(null);setReceived(false);setAmount('');setSuccess(true);
   await Promise.all([qc.invalidateQueries({queryKey:['sales-closing-cash-ledger-context']}),qc.invalidateQueries({queryKey:['wallet_transactions']}),qc.invalidateQueries({queryKey:['treasury_owner_central_transactions']}),qc.invalidateQueries({queryKey:['cash-register']}),qc.invalidateQueries({queryKey:['closing-owner-wallet-balances']}),qc.invalidateQueries({queryKey:['treasury_accounts']}),qc.invalidateQueries({queryKey:['bank-wallet-owner-funding-accounts']})]);
   await onPosted?.();
  }catch(e){
   if(['P0001','42501','23514','22003','22P02'].includes(e.code)){sessionStorage.removeItem(storageKey);setPending(null);}
   setError(e.message?.includes('CLOSED_PERIOD')?tr.closed:e.message?.includes('TREASURY_DATE_REVIEW')?tr.date:e.message?.includes('INSUFFICIENT_BALANCE')?(lang==='fa'?'موجودی والت برای این مبلغ کافی نیست.':lang==='ar'?'رصيد المحفظة غير كافٍ لهذا المبلغ.':'The wallet balance is insufficient for this amount.'):e.message||'Funding failed');
  }finally{lock.current=false;setBusy(false);}
 };
 const field='min-h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900';
 return <section id="closing-funding" data-testid="closing-funding" dir={lang==='en'?'ltr':'rtl'} className="min-w-0 space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
  <h3 className="font-black text-slate-950">{tr.title}</h3><p className="text-sm leading-6">{tr.explain}</p>
  {physicalShortage > 0 && <div data-testid="funding-physical-shortage-note" className="rounded-xl border border-amber-200 bg-white p-3 text-xs leading-5 text-amber-900">
    {lang==='fa'?'کمبود شمارش:':lang==='ar'?'عجز الجرد:':'Counted shortage:'} <strong dir="ltr">{physicalShortage.toFixed(2)} {currency}</strong>.
    {' '}{lang==='fa'?'تمویل واقعاً دریافت‌شده به ورودی نقد افزوده می‌شود؛ اختلاف پیشین خودکار صفر نمی‌شود و به رسیدگی حسابداری نیاز دارد.':lang==='ar'?'يضاف التمويل المستلم فعلياً إلى النقد الوارد؛ لا يمحى فرق الجرد السابق تلقائياً ويحتاج مراجعة محاسبية.':'Physically received funding posts as Cash In. It does not erase the original count variance; audit review remains required.'}
  </div>}
  <details><summary className="cursor-pointer text-xs font-semibold">{lang==='fa'?'جزئیات اختلاف صندوق':lang==='ar'?'تفاصيل فرق الصندوق':'Cash difference details'}</summary><dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2"><div><dt>{tr.minimum}</dt><dd className="break-all text-lg font-black">{proposal.minimum.toFixed(2)} {currency}</dd></div><div><dt>{tr.count}</dt><dd className="break-all text-lg font-black">{proposal.toCount===null?'—':proposal.toCount.toFixed(2)} {currency}</dd></div></dl></details>
  {role!=='owner'?<p>{tr.manager}</p>:<>
   {pending&&<p role="status">{tr.pending}</p>}
   {source==='treasury'&&period.data&&<p role="alert" data-testid="funding-closed-period" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{tr.closed} <strong dir="ltr">{period.data.date} · {period.data.shift}</strong></p>}
   {source==='treasury'&&(wallet.isError||period.isError)&&<p role="alert">{tr.unavailable}<Button type="button" onClick={()=>{wallet.refetch();period.refetch();}}>{tr.load}</Button></p>}
   <fieldset disabled={busy||Boolean(pending)||disabled} className="min-w-0 space-y-3 disabled:opacity-60">
    <label className="block"><span>{tr.source}</span><select className={field} value={source} onChange={e=>setSource(e.target.value)}><option value="owner">{tr.owner}</option><option value="treasury">{tr.treasury}</option></select></label>
    {source==='treasury'&&<><p className="text-xs">{tr.historical}</p>{isError&&<p role="alert">{tr.unavailable}<Button type="button" onClick={()=>refetch()}>{tr.load}</Button></p>}<label className="block">{tr.source}<select className={field} value={sourceId} onChange={e=>setSourceId(e.target.value)}><option value="">{tr.choose}</option>{sources.map(a=><option key={a.id} value={a.id}>{a.account_name} · {a.currency}</option>)}</select></label>{chosen&&<p data-testid="owner-wallet-balance" className="rounded-xl bg-blue-50 p-3 text-sm">{lang==='fa'?'موجودی والت اونر':lang==='ar'?'رصيد محفظة المالك':'Owner wallet balance'}: <strong dir="ltr">{wallet.isSuccess&&Number.isFinite(walletBalance)?walletBalance.toFixed(2):'—'} {currency}</strong>{wallet.isSuccess&&Number.isFinite(walletBalance)&&Number(amount)>walletBalance&&<span className="block text-red-700">{lang==='fa'?'موجودی کافی نیست':lang==='ar'?'الرصيد غير كافٍ':'Insufficient balance'}</span>}</p>}<label className="block">{tr.destination}<select className={field} value={destinationId} onChange={e=>setDestinationId(e.target.value)}><option value="">{tr.choose}</option>{destinations.map(a=><option key={a.id} value={a.id}>{a.account_name} · {a.currency}</option>)}</select></label>{needsSettled&&<label className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={settled} onChange={e=>setSettled(e.target.checked)}/>{tr.settled}</label>}</>}
    <label className="block">{tr.amount} ({currency})<input aria-label={tr.amount} className={field} inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <Button type="button" variant="outline" onClick={()=>setNote(lang==='fa'?'تأمین نقد صندوق از اونر':lang==='ar'?'تمويل نقد الصندوق من المالك':'Owner funding for cash drawer')}>{lang==='fa'?'دلیل: تأمین نقد صندوق':lang==='ar'?'السبب: تمويل الصندوق':'Reason: fund the cash drawer'}</Button>
    <label className="block">{tr.note}<textarea aria-label={tr.note} className={field} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label>
    <label className="flex min-h-12 items-start gap-3 text-sm leading-6"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={received} onChange={e=>setReceived(e.target.checked)}/>{tr.received}</label>
   </fieldset>
   {error&&<p role="alert" className="break-words text-sm text-red-800">{error}</p>}{success&&<p role="status" className="text-sm text-emerald-800">{tr.done}</p>}
   <Button type="button" className="min-h-12 w-full whitespace-normal" disabled={busy||disabled||(!pending&&!valid)} onClick={submit}>{busy?tr.saving:pending?tr.retry:tr.post}</Button>
  </>}
 </section>;
}
