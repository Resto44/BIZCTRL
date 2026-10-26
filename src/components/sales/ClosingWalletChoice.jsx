import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { chooseClosingWallet, closingWalletFundingAmount } from './SimpleClosingFunding';

export default function ClosingWalletChoice({ restaurantId, branchId, branchKey, currency, expectedCash, actualCash, lang, role, value, onChange, disabled }) {
 const t=lang==='fa'?{title:'تمویل صندوق هنگام ثبت نهایی',owner:'والت اونر',restaurant:'والت ریستورنت',count:'اول نقد واقعی صندوق را وارد کنید.',note:'مبلغ از والت انتخاب‌شده کم و به صندوق اضافه می‌شود؛ با ثبت نهایی کلوزینگ، هر دو با هم ثبت می‌شوند.',low:'موجودی کافی نیست',error:'موجودی والت بارگذاری نشد.',retry:'تلاش مجدد',clear:'لغو انتخاب'}:lang==='ar'?{title:'تمويل الصندوق عند اعتماد الإقفال',owner:'محفظة المالك',restaurant:'محفظة المطعم',count:'أدخل النقد الفعلي أولاً.',note:'يُخصم المبلغ من المحفظة ويُضاف للصندوق مع اعتماد الإقفال في عملية واحدة.',low:'الرصيد غير كافٍ',error:'تعذر تحميل الأرصدة.',retry:'إعادة المحاولة',clear:'إلغاء الاختيار'}:{title:'Fund drawer with final closing',owner:'Owner wallet',restaurant:'Restaurant wallet',count:'Enter counted cash first.',note:'The selected wallet debit and drawer receipt post together when you confirm the closing.',low:'Insufficient balance',error:'Unable to load wallets.',retry:'Retry',clear:'Clear selection'};
 const accounts=useQuery({queryKey:['simple-closing-funding',restaurantId,branchId,currency],enabled:role==='owner'&&Boolean(restaurantId&&branchId),queryFn:async()=>{const {data,error}=await supabase.rpc('erp_closing_funding_accounts',{p_restaurant:restaurantId,p_branch:branchId,p_currency:currency});if(error)throw error;if(!Array.isArray(data))throw Error(t.error);return data;}});
 const amount=closingWalletFundingAmount(expectedCash,actualCash);
 if(role!=='owner'||(expectedCash>=0&&amount===0))return null;
 const destination=chooseClosingWallet(accounts.data||[],'restaurant',branchId,branchKey,currency);
 return <section id="closing-funding" data-testid="closing-wallet-choice" className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50 p-4" data-i18n-skip="true">
 <h3 className="font-black text-blue-950">{t.title} <span dir="ltr">{actualCash===null?'—':amount.toFixed(2)} {currency}</span></h3>
 {actualCash===null&&<p className="text-sm">{t.count}</p>}
 <div role="radiogroup" aria-label={t.title} className="grid grid-cols-2 gap-2">{['restaurant','owner'].map(kind=>{const account=chooseClosingWallet(accounts.data||[],kind,branchId,branchKey,currency);const ready=account&&Number(account.available_balance)>=amount&&(kind==='restaurant'||destination);return <button type="button" role="radio" aria-checked={value?.source===(kind==='owner'?'treasury':'restaurant')} key={kind} disabled={disabled||accounts.isFetching||!ready||amount<=0} onClick={()=>onChange({source:kind==='owner'?'treasury':'restaurant',source_account_id:account.id,destination_account_id:kind==='restaurant'?null:destination.id,amount,received:true})} className={`min-h-20 rounded-xl border bg-white p-3 text-sm disabled:opacity-50 ${value?.source===(kind==='owner'?'treasury':'restaurant')?'border-blue-600 ring-2 ring-blue-600':'border-slate-200'}`}><span className="block font-bold">{t[kind]}</span><span dir="ltr" className="block">{account?Number(account.available_balance).toFixed(2):'—'} {currency}</span>{account&&!ready&&<span className="text-xs text-red-700">{t.low}</span>}</button>;})}</div>
 <p className="text-xs leading-6 text-blue-900">{t.note}</p>
 {value&&<button type="button" onClick={()=>onChange(null)} disabled={disabled} className="min-h-10 text-sm underline">{t.clear}</button>}
 {accounts.isError&&<p role="alert">{t.error} <button type="button" onClick={()=>accounts.refetch()}>{t.retry}</button></p>}
 </section>;
}
