import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {useNavigate} from 'react-router-dom';
import {Banknote,ArrowRight,RefreshCw} from 'lucide-react';
import {supabase} from '@/api/supabaseClient';
import {useLanguage} from '@/lib/LanguageContext';
import {enteredDrawerCash} from '@/lib/executiveDrawerCash';
import {Button} from '@/components/ui/button';
const copy={
 en:{title:'Cash remaining in drawer',recorded:'Last recorded cash count',hint:'Remaining physical cash at the last finalized closing, after recorded cash movements. Cash sales and network sales are separate.',date:'Closing date',old:'Previous closing · not a live cash count',empty:'No finalized cash count recorded',error:'Could not load drawer balance',retry:'Retry',details:'View closing',loading:'Loading cash count…'},
 ar:{title:'النقد المتبقي في الصندوق',recorded:'آخر جرد نقدي مسجّل',hint:'النقد المتبقي فعلياً عند آخر إقفال معتمد بعد الحركات النقدية المسجلة. مبيعات النقد والشبكة أرقام منفصلة.',date:'تاريخ الإقفال',old:'إقفال سابق · ليس جرداً نقدياً لحظياً',empty:'لم يُسجّل جرد نقدي في إقفال معتمد',error:'تعذّر تحميل رصيد الصندوق',retry:'إعادة المحاولة',details:'عرض الإقفال',loading:'جارٍ تحميل الجرد…'},
 fa:{title:'پول باقی‌مانده در صندوق',recorded:'آخرین شمارش نقدی ثبت‌شده',hint:'پول نقد باقی‌مانده در آخرین بستن نهایی صندوق، پس از گردش‌های نقدی ثبت‌شده. فروش نقدی و فروش شبکه جدا هستند.',date:'تاریخ بستن صندوق',old:'ماندۀ بستن قبلی · شمارش لحظه‌ای نیست',empty:'هنوز شمارش نقدی نهایی ثبت نشده',error:'بارگذاری ماندۀ صندوق ناموفق بود',retry:'تلاش دوباره',details:'دیدن بستن صندوق',loading:'در حال بارگذاری شمارش…'}
};
export async function readManagerDrawer(client,branchId,asOf){
 if(!branchId)throw Error('Assigned branch required');
 const {data,error}=await client.from('daily_sales').select('id,branch_id,date,closing_state,actual_cash,closing_cash,owner_cash_injection,finalized_at')
 .eq('branch_id',branchId).eq('closing_state','finalized').lte('date',asOf)
 .order('date',{ascending:false}).order('finalized_at',{ascending:false,nullsFirst:false}).order('id',{ascending:false}).limit(1);
 if(error)throw error;
 const row=data?.[0];
 if(!row)return null;
 if(row.branch_id!==branchId||row.closing_state!=='finalized'||row.date>asOf)throw Error('Invalid drawer scope');
 return {...row,amount:enteredDrawerCash(row)};
}
export default function ManagerDrawerCashCard({branchId,asOf}){
 const {lang,formatMoney}=useLanguage(),t=copy[lang]||copy.en,navigate=useNavigate();
 const query=useQuery({queryKey:['manager-drawer-cash',branchId,asOf],queryFn:()=>readManagerDrawer(supabase,branchId,asOf),enabled:!!branchId,refetchInterval:30000,refetchOnWindowFocus:true});
 const known=query.isSuccess&&query.data?.amount!=null;
 return <section dir={lang==='en'?'ltr':'rtl'} aria-label={t.title} className="min-w-0 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
  <div className="flex items-start gap-3"><Banknote aria-hidden="true" className="mt-1 size-6 shrink-0 text-emerald-700"/><div className="min-w-0 flex-1">
   <h2 className="text-sm font-bold text-foreground">{t.title}</h2><p className="mt-1 text-xs text-muted-foreground">{t.recorded}</p>
   <p dir="ltr" className="mt-2 break-words text-start text-3xl font-black tabular-nums text-emerald-900 dark:text-emerald-100">{known?formatMoney(query.data.amount):'—'}</p>
  </div></div>
  {query.isPending?<p role="status" className="mt-2 text-xs">{t.loading}</p>:query.isError?<div role="alert" className="mt-2 text-sm text-rose-700">{t.error}<Button variant="ghost" size="sm" onClick={()=>query.refetch()}><RefreshCw className="me-1 size-4"/>{t.retry}</Button></div>:!known?<p className="mt-2 text-xs text-amber-800">{t.empty}</p>:<p className="mt-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200">{t.date}: <span dir="ltr">{query.data.date}</span>{query.data.date!==asOf&&<span className="mt-1 block text-amber-800 dark:text-amber-300">{t.old}</span>}</p>}
  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-200/60 pt-3"><p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">{t.hint}</p><Button variant="outline" size="sm" onClick={()=>navigate('/sales')} className="shrink-0">{t.details}<ArrowRight className="ms-1 size-4 rtl:rotate-180"/></Button></div>
 </section>;
}
