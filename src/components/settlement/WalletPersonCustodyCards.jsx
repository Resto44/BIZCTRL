import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {Wallet,Clock3} from 'lucide-react';

/**
 * Wallet presentation is read-only. Custody is business money actually held
 * by the person; it MUST NOT be merged into the person's loan balance.
 * Pending is a count (not a monetary balance).
 */
export function readCashCustodyAndPending(snapshot, currency) {
  if (!snapshot || !Array.isArray(snapshot.balances)) return null;
  const cash = snapshot.balances.filter(x=>x.currency===currency&&x.payment_method==='cash');
  const pending = snapshot.balances.filter(x=>x.currency===currency);
  return {
    cash:cash.reduce((sum,x)=>sum+Number(x.held||0),0),
    pending:pending.reduce((sum,x)=>sum+Number(x.pending||0),0),
  };
}
export default function WalletPersonCustodyCards({partner, currency,lang='en'}){
  const t={
    en:{cash:'Cash in custody',pending:'Pending custody approvals',note:'Custody is separate from personal debts',unit:'requests',error:'Unable to load custody',retry:'Retry'},
    ar:{cash:'العهدة النقدية لدى الشخص',pending:'طلبات العهدة بانتظار الموافقة',note:'العهدة منفصلة عن ديون الشخص',unit:'طلبات',error:'تعذر تحميل العهدة',retry:'إعادة المحاولة'},
    fa:{cash:'پول نقد امانت نزد شخص',pending:'درخواست‌های امانت منتظر تأیید',note:'پول امانتی با قرض شخصی جمع نمی‌شود',unit:'درخواست',error:'بارگذاری امانت ناموفق شد',retry:'تلاش دوباره'},
  }[lang]||null;
  const labels=t||{cash:'Cash in custody',pending:'Pending custody approvals',note:'Custody is separate from personal debts',unit:'requests',error:'Unable to load custody',retry:'Retry'};
  const q=useQuery({
    queryKey:['people-custody',partner?.id,'overview'],
    enabled:!!partner?.id,
    queryFn:async()=>{
      const {data,error}=await supabase.rpc('erp_person_custody',{p_person:partner.id,p_offset:0});
      if(error)throw error;
      if(!data||!Array.isArray(data.balances))throw Error('INCOMPLETE_CUSTODY_SNAPSHOT');
      return data;
    },
    staleTime:15000,refetchInterval:15000,
  });
  const data=readCashCustodyAndPending(q.data,currency);
  const fmt=v=>new Intl.NumberFormat(lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v);
  return <div className="col-span-2 grid grid-cols-2 gap-2.5 sm:gap-3">
    <div className="min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-3.5 text-emerald-900 sm:p-5">
      <div className="flex items-center gap-2"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><Wallet className="size-5"/></span>
        <p className="min-w-0 text-xs font-extrabold leading-5 sm:text-sm">{labels.cash}</p></div>
      <p dir="ltr" className="mt-3 break-words text-start text-xl font-black tabular-nums sm:text-2xl">{q.isPending?'…':q.isError?'—':fmt(data?.cash??0)} <span className="text-xs sm:text-sm">{currency}</span></p>
    </div>
    <div className="min-w-0 rounded-2xl border border-violet-200 bg-violet-50/90 p-3.5 text-violet-900 sm:p-5">
      <div className="flex items-center gap-2"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700"><Clock3 className="size-5"/></span>
        <p className="min-w-0 text-xs font-extrabold leading-5 sm:text-sm">{labels.pending}</p></div>
      <p className="mt-3 text-xl font-black tabular-nums sm:text-2xl">{q.isPending?'…':q.isError?'—':data?.pending??0} <span className="text-xs sm:text-sm">{labels.unit}</span></p>
    </div>
    <p className="col-span-2 text-xs text-muted-foreground">{labels.note}</p>
    {q.isError&&<button type="button" onClick={()=>q.refetch()} className="col-span-2 min-h-11 rounded-lg border border-rose-200 text-sm text-rose-700">{labels.error} · {labels.retry}</button>}
  </div>;
}
