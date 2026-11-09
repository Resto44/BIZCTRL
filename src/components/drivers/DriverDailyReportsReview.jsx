import React,{useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {useLanguage} from '@/lib/LanguageContext';
import {Card,CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {toast} from 'sonner';
import {RefreshCw,ShieldCheck,AlertTriangle,Truck,CheckCircle2} from 'lucide-react';

// The manager reviews declared cash/card figures against canonical finalized
// Sales Closings. "Matched" is permitted only by an atomic server-side RPC.
// This component NEVER posts driver declarations as new revenue.
const COPY={
 en:{title:'Driver reports awaiting reconciliation',help:'Declarations are not business revenue. Compare with finalized Sales Closing before marking Matched.',
 noReports:'No reports in this branch and period.',refresh:'Refresh',cash:'Cash',network:'Network',
 reviewed:'Reviewed',matched:'Matched',rejected:'Rejected',pending:'Pending',review:'Review',
 match:'Match finalized closing',reject:'Reject',notes:'Review note (optional)',
 matchedHint:'The server blocks matching unless finalized closing cash and network equal the declaration.',
 failure:'Could not update review status',done:'Review status updated',period:'Report date'},
 ar:{title:'تقارير السائقين والمطابقة',help:'إقرارات السائقين ليست إيراداً. قارنها بإقفال البيع النهائي قبل المطابقة.',
 noReports:'لا توجد تقارير في هذه الفترة.',refresh:'تحديث',cash:'النقد',network:'الشبكة',
 reviewed:'تمت المراجعة',matched:'مطابق',rejected:'مرفوض',pending:'معلق',review:'مراجعة',
 match:'مطابقة بالإقفال النهائي',reject:'رفض',notes:'ملاحظة المراجعة (اختياري)',
 matchedHint:'الخادم يمنع المطابقة إذا اختلف النقد أو الشبكة عن الإقفال النهائي.',
 failure:'تعذر تحديث المراجعة',done:'تم تحديث حالة المراجعة',period:'تاريخ التقرير'},
 fa:{title:'گزارش‌های راننده و تطبیق فروش',help:'اظهار راننده درآمد جدید نیست. قبل از تطبیق، آن را با کلوزینگ نهایی مقایسه کن.',
 noReports:'در این دوره گزارشی وجود ندارد.',refresh:'تازه‌سازی',cash:'نقد',network:'شبکه',
 reviewed:'بررسی شد',matched:'تطبیق‌شده',rejected:'رد شده',pending:'منتظر',review:'بررسی',
 match:'تطبیق با کلوزینگ نهایی',reject:'رد',notes:'یادداشت بررسی (اختیاری)',
 matchedHint:'سیستم بدون برابری نقد و شبکه با کلوزینگ نهایی، تطبیق را قبول نمی‌کند.',
 failure:'تغییر وضعیت ممکن نشد',done:'وضعیت بررسی ثبت شد',period:'تاریخ گزارش'},
};
function formatMoney(v){const n=Number(v);return Number.isFinite(n)?n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):'—'}
export default function DriverDailyReportsReview({restaurantId,branchId,from,to,drivers=[]}){
 const {lang='en'}=useLanguage()||{};const t=COPY[lang]||COPY.en;
 const qc=useQueryClient();
 const [selected,setSelected]=useState(null);
 const [notes,setNotes]=useState('');
 const qkey=['driver-daily-reviews',restaurantId,branchId,from,to];
 const {data=[],isLoading,isError,refetch}=useQuery({
  queryKey:qkey,
  queryFn:async()=>{
   let q=supabase.from('driver_daily_reports').select('id,driver_id,branch_id,work_date,cash_amount,network_amount,notes,status,review_notes,reviewed_at,created_at')
    .eq('restaurant_id',restaurantId)
    .gte('work_date',from).lte('work_date',to)
    .order('work_date',{ascending:false}).limit(200);
   if(branchId)q=q.eq('branch_id',branchId);
   const {data:rows,error}=await q;
   if(error)throw error;
   return rows||[];
  },
  enabled:Boolean(restaurantId&&from&&to),
  refetchInterval:20000,refetchOnWindowFocus:true
 });
 const change=useMutation({
  mutationFn:async({id,action})=>{
   const {error}=await supabase.rpc('erp_driver_review_daily_report',{
    p_report_id:id,p_action:action,p_notes:notes
   });
   if(error)throw error;
  },
  onSuccess:()=>{setSelected(null);setNotes('');toast.success(t.done);qc.invalidateQueries({queryKey:['driver-daily-reviews']});qc.invalidateQueries({queryKey:['driver-erp-snapshot']});},
  onError:e=>toast.error(e?.message||t.failure)
 });
 return <Card data-testid="driver-manager-review" className="min-w-0 border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
   <CardContent className="space-y-3 p-3.5 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0"><h2 className="flex items-center gap-2 text-base font-extrabold"><Truck className="h-5 w-5 text-blue-600"/>{t.title}</h2>
       <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-300">{t.help}</p></div>
      <Button type="button" variant="outline" className="min-h-10" onClick={()=>refetch()}><RefreshCw className="me-2 h-4 w-4"/>{t.refresh}</Button>
    </div>
    {isError&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-800">{t.failure}</p>}
    {isLoading&&<p role="status">…</p>}
    {!isLoading&&!isError&&data.length===0&&<p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t.noReports}</p>}
    <div className="grid gap-3 lg:grid-cols-2">{data.map(r=>{
     const name=drivers.find(d=>String(d.id)===String(r.driver_id))?.full_name||String(r.driver_id).slice(0,8);
     return <div key={r.id} className="min-w-0 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
       <div className="flex flex-wrap items-center justify-between gap-2"><strong className="min-w-0 break-words text-sm">{name}</strong>
        <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-800">{t[r.status]||r.status}</span></div>
       <p className="mt-1 text-xs text-slate-500">{t.period}: {r.work_date}</p>
       <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800">
        <div><p className="text-slate-500 dark:text-slate-300">{t.cash}</p><strong className="text-base">{formatMoney(r.cash_amount)} SAR</strong></div>
        <div><p className="text-slate-500 dark:text-slate-300">{t.network}</p><strong className="text-base">{formatMoney(r.network_amount)} SAR</strong></div>
       </div>
       {r.notes&&<p className="mt-2 break-words text-xs text-slate-500">{r.notes}</p>}
       {r.review_notes&&<p className="mt-2 break-words text-xs text-slate-600 dark:text-slate-300">{r.review_notes}</p>}
       {r.status!=='matched'&&<div className="mt-3 space-y-2">
        {selected===r.id&&<Input maxLength={500} aria-label={t.notes} value={notes} placeholder={t.notes} onChange={e=>setNotes(e.target.value)} className="min-h-11"/>}
        <div className="flex flex-wrap gap-1.5">
         {selected!==r.id?<Button size="sm" type="button" variant="outline" className="min-h-10" onClick={()=>{setSelected(r.id);setNotes('')}}>{t.review}</Button>:
         <>
          <Button size="sm" type="button" variant="outline" disabled={change.isPending} onClick={()=>change.mutate({id:r.id,action:'reviewed'})}>{t.reviewed}</Button>
          <Button size="sm" type="button" variant="outline" disabled={change.isPending} onClick={()=>change.mutate({id:r.id,action:'rejected'})}>{t.reject}</Button>
          <Button size="sm" type="button" disabled={change.isPending} className="bg-emerald-600 text-white" onClick={()=>change.mutate({id:r.id,action:'matched'})}><CheckCircle2 className="me-1 h-3.5 w-3.5"/>{t.match}</Button>
         </>}
        </div>
       </div>}
     </div>
    })}</div>
    <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>{t.matchedHint}</p>
   </CardContent>
 </Card>;
}
