import React, {useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {Button} from '@/components/ui/button';

export function chooseClosingWallet(accounts,kind,branchId,branchKey,currency){
 const branch=a=>a.branch_id===branchId||(!a.branch_id&&a.branch_key===branchKey);
 const eligible=accounts.filter(a=>a.currency===currency&&(kind==='restaurant'
  ? branch(a)&&['cash','petty_cash'].includes(a.account_type)
  : !a.branch_id&&!a.branch_key&&['cash','bank','digital_wallet','network_pos','clearing'].includes(a.account_type)));
 return eligible.sort((a,b)=>Number(b.available_balance)-Number(a.available_balance)||String(a.id).localeCompare(String(b.id)))[0]||null;
}
export function closingWalletFundingAmount(expected,actual){
 if(expected===null||actual===null||!Number.isFinite(Number(expected))||!Number.isFinite(Number(actual))||Number(actual)<0)return 0;
 // A counted loss is settled separately; adding cash must not spend a wallet twice.
 return Math.max(0,Math.round((Number(actual)-Number(expected))*100)/100);
}
const copy={
 en:{title:'Cover cash shortage',restaurant:'Restaurant wallet',owner:'Owner wallet',balance:'Available',confirm:'Confirm cash received & fund',busy:'Recording…',retry:'Retry transfer',choose:'Choose a wallet',missing:'No eligible account',insufficient:'Insufficient balance',unavailable:'Wallet data could not be loaded.',reload:'Retry',closed:'A finalized closing must be reviewed first.',date:'Funding this past date requires an accounting correction.',count:'Enter the counted cash first.',done:'Transfer recorded. Recount the cash, then continue closing.',none:'No additional funding needed.',pending:'Transfer confirmation pending. Retry without changing the source.'},
 fa:{title:'تأمین کمبود صندوق',restaurant:'والت ریستورنت',owner:'والت اونر',balance:'موجودی',confirm:'تأیید دریافت نقد و تمویل',busy:'در حال ثبت…',retry:'تلاش مجدد انتقال',choose:'یک والت انتخاب کنید',missing:'حساب مناسب موجود نیست',insufficient:'موجودی کافی نیست',unavailable:'موجودی والت بارگذاری نشد.',reload:'تلاش مجدد',closed:'ابتدا کلوزینگ نهایی‌شده باید بررسی شود.',date:'تمویل برای این تاریخ گذشته نیاز به اصلاح حسابداری دارد.',count:'اول نقد شمارش‌شده را وارد کنید.',done:'انتقال ثبت شد؛ نقد را دوباره بشمارید و کلوزینگ را ادامه دهید.',none:'تمویل اضافی لازم نیست.',pending:'نتیجهٔ انتقال هنوز تأیید نشده؛ همان درخواست را دوباره اجرا کنید.'},
 ar:{title:'تغطية عجز الصندوق',restaurant:'محفظة المطعم',owner:'محفظة المالك',balance:'الرصيد',confirm:'تأكيد استلام النقد والتمويل',busy:'جارٍ التسجيل…',retry:'إعادة محاولة التحويل',choose:'اختر محفظة',missing:'لا يوجد حساب مناسب',insufficient:'الرصيد غير كافٍ',unavailable:'تعذر تحميل أرصدة المحافظ.',reload:'إعادة المحاولة',closed:'يجب مراجعة الإقفال النهائي أولاً.',date:'تمويل هذا التاريخ السابق يتطلب تصحيحاً محاسبياً.',count:'أدخل النقد المعدود أولاً.',done:'تم التحويل؛ أعد عد النقد ثم تابع الإقفال.',none:'لا حاجة لتمويل إضافي.',pending:'تأكيد التحويل معلّق؛ أعد نفس الطلب دون تغيير المصدر.'},
};
export default function SimpleClosingFunding({restaurantId,branchId,branchKey,date,shift,cashierId,expectedCash,actualCash,role,lang='en',currency='SAR',onPosted,disabled=false}){
 const t=copy[lang]||copy.en,qc=useQueryClient(),lock=useRef(false);
 const key=`closing-funding:${restaurantId}:${branchId}:${date}:${shift}:${cashierId}`;
 const [pending,setPending]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(key))||null;}catch{return null;}});
 const [kind,setKind]=useState(pending?.p_source==='restaurant'?'restaurant':pending?'owner':null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
 const accounts=useQuery({queryKey:['simple-closing-funding',restaurantId,branchId,currency],enabled:role==='owner'&&Boolean(restaurantId&&branchId),queryFn:async()=>{
  const {data,error}=await supabase.rpc('erp_closing_funding_accounts',{p_restaurant:restaurantId,p_branch:branchId,p_currency:currency});if(error)throw error;if(!Array.isArray(data))throw new Error(t.unavailable);return data;
 }});
 const validCount=actualCash!==null&&expectedCash!==null&&Number.isFinite(Number(actualCash))&&Number(actualCash)>=0&&Number.isFinite(Number(expectedCash));
 // Record funding separately; never overwrite the physical count or erase a shortage.
 const amount=validCount?closingWalletFundingAmount(expectedCash,actualCash):0;
 const source=chooseClosingWallet(accounts.data||[],kind,branchId,branchKey,currency);
 const destination=chooseClosingWallet(accounts.data||[],'restaurant',branchId,branchKey,currency);
 const canPost=kind&&validCount&&amount>0&&source&&Number(source.available_balance)>=amount&&(kind==='restaurant'||destination)&&accounts.isSuccess&&!accounts.isFetching;
 const submit=async()=>{
  if(lock.current||disabled||role!=='owner'||(!pending&&!canPost))return;
  lock.current=true;setBusy(true);setError('');
  try{
   const request=pending||{p_request_id:crypto.randomUUID(),p_restaurant_id:restaurantId,p_branch_id:branchId,p_date:date,p_shift:shift,p_cashier_id:cashierId,
    p_amount:amount,p_source:kind==='restaurant'?'restaurant':'treasury',p_source_account_id:source.id,p_destination_account_id:kind==='restaurant'?null:destination.id,
    p_note:'Closing cash funding confirmed by owner',p_received:true,p_settled:true};
   sessionStorage.setItem(key,JSON.stringify(request));setPending(request);
   const {data,error}=await supabase.rpc('erp_fund_sales_closing_drawer',request);if(error)throw error;
   if(!['posted','already_posted'].includes(data?.status))throw new Error(t.pending);
   sessionStorage.removeItem(key);setPending(null);setDone(true);setKind(null);
   await Promise.all(['simple-closing-funding','closing-owner-wallet-balances','sales-closing-cash-ledger-context','wallet_transactions','treasury_accounts','treasury_owner_central_transactions','cash-register'].map(k=>qc.invalidateQueries({queryKey:[k]})));
   await onPosted?.();
  }catch(e){
   if(['P0001','42501','23514','22003','22P02'].includes(e.code)){sessionStorage.removeItem(key);setPending(null);}
   setError(e.message?.includes('CLOSED_PERIOD')?t.closed:e.message?.includes('DATE_REVIEW')?t.date:e.message?.includes('INSUFFICIENT_BALANCE')?t.insufficient:e.message||t.unavailable);
  }finally{lock.current=false;setBusy(false);}
 };
 if(role!=='owner')return null;
 return <section id="closing-funding" data-testid="simple-closing-funding" dir={lang==='en'?'ltr':'rtl'} className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-3" data-i18n-skip="true">
  <div className="flex items-center justify-between gap-2"><h3 className="font-black">{t.title}</h3><strong dir="ltr">{pending?Number(pending.p_amount).toFixed(2):validCount?amount.toFixed(2):'—'} {currency}</strong></div>
  {done?<p role="status">{t.done}</p>:<>
   <div role="radiogroup" aria-label={t.choose} className="grid grid-cols-2 gap-2">
    {['restaurant','owner'].map(value=>{const account=chooseClosingWallet(accounts.data||[],value,branchId,branchKey,currency);return <button type="button" key={value} role="radio" aria-checked={kind===value} disabled={busy||disabled||Boolean(pending)} onClick={()=>{setKind(value);setError('');}} className={`min-h-20 rounded-xl border p-3 text-sm ${kind===value?'border-blue-600 bg-white ring-2 ring-blue-600':'border-slate-200 bg-white'}`}>
     <span className="block font-bold">{t[value]}</span><span className="block text-xs" dir="ltr">{accounts.isSuccess&&account?`${Number(account.available_balance).toFixed(2)} ${currency}`:'—'}</span>
    </button>;})}
   </div>
   {accounts.isError&&<p role="alert">{t.unavailable}<Button type="button" variant="ghost" onClick={()=>accounts.refetch()}>{t.reload}</Button></p>}
   {pending&&<p role="status" className="text-xs">{t.pending}</p>}
   {!validCount&&!pending&&<p className="text-xs">{t.count}</p>}
   {validCount&&amount===0&&!pending&&<p className="text-xs">{t.none}</p>}
   {kind&&accounts.isSuccess&&(!source||Number(source.available_balance)<amount)&&<p role="alert" className="text-xs text-red-700">{source?t.insufficient:t.missing}</p>}
   <Button type="button" className="min-h-12 w-full whitespace-normal bg-blue-600" disabled={busy||disabled||(!pending&&!canPost)} onClick={submit}>{busy?t.busy:pending?t.retry:t.confirm} · {pending?Number(pending.p_amount).toFixed(2):amount.toFixed(2)} {currency}</Button>
  </>}
  {error&&<p role="alert" className="text-sm text-red-800">{error}</p>}
 </section>;
}
