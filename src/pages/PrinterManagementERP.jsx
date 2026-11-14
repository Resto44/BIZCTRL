import React,{useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Printer,RefreshCw,PlusCircle,AlertTriangle,ChefHat,Receipt,CheckCircle2,RotateCcw} from 'lucide-react';
import {useTenant} from '@/lib/TenantContext';
import {useLanguage} from '@/lib/LanguageContext';
import {supabase} from '@/api/supabaseClient';
import {openERPPrintJob,kitchenTicketHtml,PRINTER_DOCUMENTS,PRINTER_PAPERS,printerPaperLabel} from '@/lib/erpPrinting';
import {Button} from '@/components/ui/button';

const words={
 en:{title:'ERP Printer Management',intro:'Assign paper and document routes per branch. The browser print dialog is not proof of physical printing.',
  branch:'Branch',printers:'Registered destinations',queue:'Print queue',add:'Add printer route',
  name:'Printer name',kind:'Document type',paper:'Paper',station:'Kitchen station (blank = all)',
  create:'Save route',disable:'Disable',enable:'Enable',active:'Active',off:'Disabled',
  open:'Open print dialog',confirm:'Operator confirms paper received',fail:'Mark failed',
  retry:'Retry queue',refresh:'Refresh',empty:'No queued printing tickets for this branch.',
  none:'No printer route assigned yet.',hint:'Hardware connection is not configured. Local browser confirmation remains required; no silent USB/network printing.',
  success:'Updated successfully',ready:'Pending',dialog:'Dialog opened (not yet verified)',done:'Operator confirmed',failed:'Failed',
  kitchen:'Kitchen ticket',receipt:'Cashier receipt',invoices:'Sales invoice',purchase:'Purchase invoice',
  supplier:'Supplier document',customer:'Customer statement',report:'Financial report',
  test:'Test print (no sale)',unavailable:'This route is configured but this document source has not been linked to the print queue yet.',
  warning:'Never mark printed just because the browser dialog opened. Confirm paper at the printer.',back:'Back to branch',
 },
 ar:{title:'إدارة الطابعات ERP',intro:'تعيين الطابعات ونوع المستند والورق لكل فرع. فتح نافذة الطباعة ليس دليلاً على خروج الورق.',
  branch:'الفرع',printers:'وجهات الطباعة',queue:'قائمة الطباعة',add:'إضافة طابعة',
  name:'اسم الطابعة',kind:'نوع المستند',paper:'مقاس الورق',station:'قسم المطبخ (فارغ = الكل)',
  create:'حفظ',disable:'تعطيل',enable:'تفعيل',active:'مفعّل',off:'متوقف',
  open:'فتح نافذة الطباعة',confirm:'تأكيد استلام الورق',fail:'تسجيل فشل',
  retry:'إعادة المحاولة',refresh:'تحديث',empty:'لا توجد تذاكر طباعة في الفرع.',
  none:'لم تُضف طابعة بعد.',hint:'لم يتم توصيل الجهاز فعلياً. الطباعة من المتصفح تتطلب موافقة المستخدم ولا تعمل بصمت على USB أو الشبكة.',
  success:'تم التحديث',ready:'بانتظار الطباعة',dialog:'النافذة فُتحت (غير مؤكدة)',done:'أكد المستخدم',failed:'فشل',
  kitchen:'تذكرة مطبخ',receipt:'إيصال كاشير',invoices:'فاتورة بيع',purchase:'فاتورة شراء',
  supplier:'مستند مورد',customer:'كشف حساب عميل',report:'تقرير مالي',
  test:'تجربة الطباعة (دون بيع)',unavailable:'تم إعداد نوع المستند، ولكن مصدر هذا المستند لم يُربط بعد بطابور الطباعة.',
  warning:'لا تعتمد على فتح النافذة كدليل طباعة. تحقق من الورق أولاً.',back:'العودة للفرع',
 },
 fa:{title:'مدیریت چاپگرهای ERP',intro:'برای هر شعبه چاپگر، نوع سند و اندازه کاغذ تنظیم کنید. بازشدن پنجره چاپ، ثابت نمی‌کند کاغذ چاپ شده است.',
  branch:'شعبه',printers:'چاپگرهای تعریف‌شده',queue:'صف چاپ',add:'افزودن چاپگر',
  name:'نام چاپگر',kind:'نوع سند',paper:'اندازه کاغذ',station:'بخش مطبخ (خالی = همه)',
  create:'ذخیره',disable:'غیرفعال',enable:'فعال',active:'فعال',off:'غیرفعال',
  open:'بازکردن چاپ',confirm:'تأیید دریافت کاغذ',fail:'ثبت خطای چاپ',
  retry:'چاپ دوباره',refresh:'تازه‌سازی',empty:'فعلاً تکت چاپی برای این شعبه وجود ندارد.',
  none:'هنوز چاپگری تنظیم نشده است.',hint:'اتصال فیزیکی چاپگر هنوز انجام نشده. چاپ مرورگر نیازمند تأیید کاربر است و USB/شبکه را خودکار و خاموش چاپ نمی‌کند.',
  success:'تغییر ذخیره شد',ready:'منتظر چاپ',dialog:'پنجره باز شد (تأیید نشده)',done:'اپراتور تأیید کرد',failed:'ناموفق',
  kitchen:'تکت مطبخ',receipt:'رسید کاشیر',invoices:'فاکتور فروش',purchase:'فاکتور خرید',
  supplier:'سند سپلایر',customer:'صورت‌حساب مشتری',report:'گزارش مالی',
  test:'چاپ آزمایشی (بدون فروش)',unavailable:'این نوع سند تنظیم شده اما منبع سند هنوز به صف چاپ وصل نشده است.',
  warning:'تا وقتی کاغذ را نگرفته‌اید، چاپ را تأیید نکنید.',back:'بازگشت به شعبه',
 },
};
const kindLabels={kitchen_ticket:'kitchen',cashier_receipt:'receipt',sales_invoice:'invoices',
 purchase_invoice:'purchase',supplier_document:'supplier',customer_statement:'customer',financial_report:'report'};
const input='min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950';
const card='rounded-2xl border border-slate-200 bg-white p-4 shadow-sm';
async function printRpc(name,args) {
 const {data,error}=await supabase.rpc(name,args);
 if(error)throw new Error(error.message||'PRINT_CONNECTION_ERROR');
 return data;
}
export default function PrinterManagementERP(){
 const {activeRestaurant,branches=[]}=useTenant();
 const {lang}=useLanguage();
 const t=words[lang]||words.en;
 const restaurantId=activeRestaurant?.id;
 const [branch,setBranch]=useState('');
 const [name,setName]=useState('');
 const [kind,setKind]=useState('kitchen_ticket');
 const [paper,setPaper]=useState('80mm');
 const [station,setStation]=useState('');
 const [working,setWorking]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const effectiveBranch=branches.find(x=>x.id===branch)?.id||branches[0]?.id||null;
 const state=useQuery({
  queryKey:['erp-print-management',restaurantId,effectiveBranch],
  queryFn:()=>printRpc('erp_print_state',{p_restaurant_id:restaurantId,p_branch_id:effectiveBranch}),
  enabled:!!restaurantId&&!!effectiveBranch,refetchInterval:12000,refetchIntervalInBackground:false,staleTime:4000,retry:1,
 });
 const data=state.data||{};
 const printers=Array.isArray(data.printers)?data.printers:[];
 const jobs=Array.isArray(data.jobs)?data.jobs:[];
 const counts=useMemo(()=>({
  pending:jobs.filter(j=>j.status==='pending'||j.status==='failed').length,
  awaiting:jobs.filter(j=>j.status==='dialog_opened').length,
  done:jobs.filter(j=>j.status==='operator_confirmed').length,
 }),[jobs]);
 const act=async fn=>{if(working)return;setWorking(true);setError('');setNotice('');
  try{await fn();setNotice(t.success);await state.refetch();}
  catch(e){setError(e?.message||'PRINT_OPERATION_FAILED');}finally{setWorking(false);}};
 const manage=(action,id=null)=>act(()=>printRpc('erp_print_manage',{
  p_restaurant_id:restaurantId,p_branch_id:effectiveBranch,p_id:id,p_action:action,
  p_payload:action==='create'?{name:name.trim(),kind,paper,station:station.trim()}: {},
 }).then(()=>{if(action==='create'){setName('');setStation('');}}));
 const action=(job,cmd)=>act(()=>printRpc('erp_print_job_action',{
  p_restaurant_id:restaurantId,p_job_id:job.id,p_action:cmd,
 }));
 const openJob=job=>{
  if(working)return;
  try{
   // The popup must be opened synchronously from a human click on iOS.
   openERPPrintJob(job,lang);
   void action(job,'open');
  }catch(e){setError(e.message||'PRINT_POPUP_BLOCKED');}
 };
 const testPrint=()=>{
  try {
   const popup=window.open('','_blank','width=600,height=850');
   if(!popup)throw new Error('PRINT_POPUP_BLOCKED');
   popup.opener=null;
   popup.document.open();
   popup.document.write(kitchenTicketHtml({number:'TEST',order_type:'TEST',lines:[{name:'TEST PRINT / اختبار / آزمایش',quantity:1}],notes:'Not an invoice / ليس فاتورة'},paper,lang));
   popup.document.close();
   popup.focus();popup.setTimeout(()=>popup.print(),350);
  } catch(e){setError(e?.message||'PRINT_POPUP_BLOCKED');}
 };
 const label=k=>t[kindLabels[k]]||k;
 return <main data-testid="erp-printer-management" dir={lang==='en'?'ltr':'rtl'}
   className="mx-auto max-w-6xl space-y-4 px-3 py-4 text-slate-900 sm:p-6">
  <header className={card}>
   <div className="flex flex-wrap items-center gap-3">
    <span className="rounded-xl bg-blue-100 p-3 text-blue-700"><Printer className="size-7"/></span>
    <div className="min-w-0 flex-1"><h1 className="text-2xl font-black">{t.title}</h1>
     <p className="mt-1 text-sm text-slate-600">{t.intro}</p></div>
    <Button variant="outline" onClick={()=>state.refetch()} disabled={state.isFetching}><RefreshCw className="me-2 size-4"/>{t.refresh}</Button>
   </div>
   <div className="mt-3 max-w-xl">
    <label className="text-sm font-bold">{t.branch}</label>
    <select data-testid="print-branch-filter" className={input} value={effectiveBranch||''} onChange={e=>setBranch(e.target.value)}>
     {branches.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}
    </select>
   </div>
  </header>
  <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
   <AlertTriangle className="me-2 inline size-4"/>{t.hint}
  </p>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
  {state.isError&&<p role="alert" className="rounded-xl border border-red-200 p-4">{state.error?.message}</p>}
  {state.isPending&&<p role="status" className={card}>Loading / بارگذاری…</p>}
  {data.can_manage&&<section className={card} data-testid="printer-device-setup">
   <h2 className="mb-3 flex items-center gap-2 text-lg font-black"><PlusCircle className="size-5"/>{t.add}</h2>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <label className="block text-sm font-semibold">{t.name}<input className={input} value={name} maxLength={80} onChange={e=>setName(e.target.value)} placeholder={lang==='en'?'Kitchen 1':'مطبخ ۱'}/></label>
    <label className="block text-sm font-semibold">{t.kind}<select className={input} value={kind} onChange={e=>{setKind(e.target.value);if(e.target.value==='kitchen_ticket'||e.target.value==='cashier_receipt')setPaper('80mm');else setPaper('A4');}}>
     {PRINTER_DOCUMENTS.map(k=><option value={k} key={k}>{label(k)}</option>)}</select></label>
    <label className="block text-sm font-semibold">{t.paper}<select className={input} value={paper} onChange={e=>setPaper(e.target.value)}>{PRINTER_PAPERS.map(p=><option key={p}>{p}</option>)}</select></label>
    <label className="block text-sm font-semibold">{t.station}<input className={input} value={station} maxLength={60} onChange={e=>setStation(e.target.value)} disabled={kind!=='kitchen_ticket'}/></label>
   </div>
   <div className="mt-3 flex flex-wrap gap-2">
    <Button data-testid="printer-save-route" disabled={working||name.trim().length<2||!effectiveBranch} onClick={()=>manage('create')}>{t.create}</Button>
    <Button type="button" variant="outline" onClick={testPrint}>{t.test}</Button>
   </div>
  </section>}
  <section className={card}>
   <h2 className="mb-3 flex items-center gap-2 text-lg font-black"><Printer className="size-5"/>{t.printers} · {printers.length}</h2>
   {!printers.length&&<p className="text-sm text-slate-500">{t.none}</p>}
   <div className="grid gap-2 md:grid-cols-2">
   {printers.map(p=><article key={p.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
    <div className="min-w-0 flex-1"><strong className="block break-words">{p.name}</strong>
      <p className="text-xs text-slate-600">{label(p.kind)} · {printerPaperLabel(p.paper)} · {p.station||'All stations'} · {p.active?t.active:t.off}</p>
      {!['kitchen_ticket','cashier_receipt'].includes(p.kind)&&<p className="mt-1 text-xs text-amber-700">{t.unavailable}</p>}
    </div>
    {data.can_manage&&<Button variant="outline" disabled={working} onClick={()=>manage(p.active?'disable':'enable',p.id)}>{p.active?t.disable:t.enable}</Button>}
   </article>)}
   </div>
  </section>
  <section className={card} data-testid="erp-print-job-queue">
   <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
    <h2 className="flex items-center gap-2 text-lg font-black"><Receipt className="size-5"/>{t.queue} · {jobs.length}</h2>
    <p className="text-xs text-slate-600">{t.ready}: {counts.pending} · {t.dialog}: {counts.awaiting} · {t.done}: {counts.done}</p>
   </div>
   {!jobs.length&&<p className="text-sm text-slate-500">{t.empty}</p>}
   <div className="grid gap-3 lg:grid-cols-2">
    {jobs.map(job=><article key={job.id} data-testid="erp-print-ticket" className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
       <div className="flex min-w-0 items-center gap-2">
        {job.document_type==='kitchen_ticket'?<ChefHat className="size-5 text-amber-700"/>:<Receipt className="size-5 text-blue-700"/>}
        <div><strong>{label(job.document_type)} · #{job.payload?.number||'—'}</strong>
         <p className="text-xs text-slate-500">{job.device_name} · {job.paper} · {new Date(job.created_at).toLocaleString()}</p></div>
       </div>
       <span className={'rounded-full px-2 py-1 text-xs font-bold '+(job.status==='operator_confirmed'?'bg-emerald-100 text-emerald-900':'bg-amber-100 text-amber-900')}>
        {job.status==='pending'?t.ready:job.status==='dialog_opened'?t.dialog:job.status==='operator_confirmed'?t.done:t.failed}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
       <Button data-testid="printer-open-ticket" disabled={working} onClick={()=>openJob(job)}><Printer className="me-1 size-4"/>{t.open}</Button>
       {job.status==='dialog_opened'&&<Button variant="outline" disabled={working} onClick={()=>action(job,'confirm')}><CheckCircle2 className="me-1 size-4"/>{t.confirm}</Button>}
       <Button variant="outline" disabled={working} onClick={()=>action(job,'retry')}><RotateCcw className="me-1 size-4"/>{t.retry}</Button>
       {job.status!=='operator_confirmed'&&<Button variant="ghost" disabled={working} onClick={()=>action(job,'fail')}>{t.fail}</Button>}
      </div>
    </article>)}
   </div>
   <p className="mt-4 text-xs text-amber-700">{t.warning}</p>
  </section>
 </main>;
}
