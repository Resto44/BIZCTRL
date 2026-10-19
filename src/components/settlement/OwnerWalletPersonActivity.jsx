import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {walletAccountReference} from '@/lib/walletPersonalActivity';
import WalletUnifiedActivity from './WalletUnifiedActivity';
import {ShieldCheck,Wallet} from 'lucide-react';

const text={
 en:{account:'Internal wallet account',source:'Account holder',cash:'Business funds in custody',notice:'Custody is business property. It cannot be spent as the person’s personal wallet balance.',error:'Unable to load this person’s custody movements. Partial account activity is hidden.'},
 ar:{account:'حساب المحفظة الداخلي',source:'صاحب الحساب',cash:'أموال المنشأة في العهدة',notice:'العهدة ملك للمنشأة ولا تصبح رصيد إنفاق شخصي.',error:'تعذر تحميل حركة العهدة. لن تُعرض حركة جزئية.'},
 fa:{account:'حساب داخلی والت',source:'صاحب حساب',cash:'پول کسب‌وکار در امانت شخص',notice:'امانت، مال کسب‌وکار است و موجودی مصرفی شخص محسوب نمی‌شود.',error:'گردش امانت بارگذاری نشد؛ گردش ناقص نمایش داده نمی‌شود.'},
};
export default function OwnerWalletPersonActivity({person,businessName='',loans=[],currency='SAR',lang='en',onStatement,onCustody}){
 const t=text[lang]||text.en;
 const q=useQuery({queryKey:['people-custody',person.id,'owner-summary'],
  queryFn:async()=>{
   const {data,error}=await supabase.rpc('erp_person_custody',{p_person:person.id,p_offset:0});
   if(error)throw error;
   if(!data||!Array.isArray(data.records)||!Array.isArray(data.balances))throw Error('INCOMPLETE_CUSTODY_SNAPSHOT');
   return data;
  },refetchInterval:15000,staleTime:15000});
 return <section className="min-w-0 space-y-3">
   <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
    <p className="flex items-center gap-1.5 text-xs font-bold text-blue-800"><Wallet className="size-4"/>{t.account}</p>
    <p dir="ltr" className="mt-1 break-all font-mono text-[11px] font-bold text-slate-900">{walletAccountReference(person.id)}</p>
    <p className="mt-2 break-words text-xs text-slate-600">{t.source}: <strong>{person.name}</strong></p>
   </div>
   {q.isPending?<p role="status" className="rounded-xl border p-3 text-xs text-slate-600">…</p>:
     q.isError?<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{t.error}</p>:
     <WalletUnifiedActivity loans={loans} custody={q.data.records} account={{id:person.id,account_reference:walletAccountReference(person.id),business:businessName}} currency={currency} lang={lang} onStatement={onStatement} onRequests={onCustody}/>}
   <p className="flex items-start gap-1.5 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 size-4 shrink-0"/>{t.notice}</p>
 </section>;
}
