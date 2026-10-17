import React,{useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {AlertTriangle,DatabaseZap,RefreshCw,ShieldCheck,Trash2} from 'lucide-react';
import {platformOwnerApi} from '@/lib/platformOwnerApi';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Label} from '@/components/ui/label';
import {toast} from 'sonner';

const TEXT={
  en:{
    title:'Database Cleanup',subtitle:'Scan unused platform records before removing them.',
    lead:'Only allowlisted disposable records are eligible. Inactive does not mean safe to delete.',
    group:'Record category',all:'All safe categories',inv:'Expired unused invitations (30+ days)',
    push:'Inactive push endpoints (90+ days)',scan:'Scan database',
    scanError:'Unable to scan safely. No records were changed.',
    eligible:'Eligible records',batch:'Included in this batch',noRecords:'No safe records are eligible for cleanup.',
    confirm:'Type CLEANUP to confirm this permanent action',reason:'Reason (required, 8–500 characters)',
    ack:'I understand this permanently removes only the eligible records shown in this preview.',
    action:'Delete eligible records',done:'Cleanup completed. A platform audit entry was recorded.',
    executionError:'Cleanup was not completed. Refresh the preview and try again.',
    protected:'Never deleted by this tool',limit:'Maximum 100 records per category, per confirmed run.',
    audit:'Every completed cleanup records the operator, time, type, count and reason.',
    notice:'Financial transactions, organization records, invoices, customers, payroll, payments, and audit history are protected.',
    snapshot:'Preview only — nothing has been deleted.',refresh:'Scan again',
    cancelled:'Preview changed since your scan. Run a fresh scan before confirming.',
  },
  fa:{
    title:'پاک‌سازی دیتابیس',subtitle:'رکوردهای بدون استفاده را قبل از حذف بررسی کنید.',
    lead:'فقط داده‌های کم‌خطر و از پیش تعیین‌شده قابل حذف‌اند. غیرفعال‌بودن به‌تنهایی دلیل حذف نیست.',
    group:'نوع رکورد',all:'همه گروه‌های مجاز',inv:'دعوت‌نامه‌های استفاده‌نشده و منقضی (بیش از ۳۰ روز)',
    push:'دستگاه‌های نوتیفیکیشن غیرفعال (بیش از ۹۰ روز)',scan:'بررسی دیتابیس',
    scanError:'بررسی امن انجام نشد. هیچ رکوردی تغییر نکرد.',
    eligible:'رکوردهای قابل حذف',batch:'در این مرحله',noRecords:'فعلاً رکورد کم‌خطر برای پاک‌سازی وجود ندارد.',
    confirm:'برای تأیید حذف دائمی، CLEANUP را وارد کنید',reason:'دلیل پاک‌سازی (الزامی، ۸ تا ۵۰۰ حرف)',
    ack:'تأیید می‌کنم فقط رکوردهای واجد شرایط نشان‌داده‌شده به‌صورت دائمی حذف شوند.',
    action:'حذف رکوردهای قابل پاک‌سازی',done:'پاک‌سازی انجام شد و گزارش آن در تاریخچه مدیریتی ثبت گردید.',
    executionError:'پاک‌سازی کامل نشد. بررسی تازه انجام دهید و دوباره تلاش کنید.',
    protected:'اطلاعات محافظت‌شده',limit:'در هر نوبت حداکثر ۱۰۰ رکورد از هر گروه حذف می‌شود.',
    audit:'نام اجراکننده، تاریخ، نوع، تعداد و دلیل هر پاک‌سازی در تاریخچه ثبت می‌شود.',
    notice:'تراکنش‌های مالی، سازمان‌ها، فاکتورها، مشتریان، معاشات، پرداخت‌ها و سوابق ممیزی حذف نمی‌شوند.',
    snapshot:'این فقط پیش‌نمایش است؛ هنوز چیزی حذف نشده.',refresh:'بررسی دوباره',
    cancelled:'از زمان بررسی، اطلاعات تغییر کرده است. دوباره دیتابیس را اسکن کنید.',
  },
  ar:{
    title:'تنظيف قاعدة البيانات',subtitle:'راجع السجلات غير المستخدمة قبل حذفها.',
    lead:'يُسمح فقط بحذف البيانات المؤقتة المحددة مسبقاً. عدم النشاط وحده ليس سبباً كافياً للحذف.',
    group:'نوع السجلات',all:'جميع الفئات الآمنة',inv:'دعوات منتهية وغير مستخدمة (أكثر من ٣٠ يوماً)',
    push:'اشتراكات إشعارات غير نشطة (أكثر من ٩٠ يوماً)',scan:'فحص قاعدة البيانات',
    scanError:'تعذر الفحص الآمن، ولم تتغير أي سجلات.',
    eligible:'سجلات مؤهلة',batch:'في الدفعة الحالية',noRecords:'لا توجد سجلات مؤهلة للحذف الآمن.',
    confirm:'اكتب CLEANUP لتأكيد الحذف الدائم',reason:'سبب التنظيف (إلزامي من ٨ إلى ٥٠٠ حرف)',
    ack:'أقر أن الحذف الدائم يقتصر على السجلات المؤهلة المعروضة في المعاينة.',
    action:'حذف السجلات المؤهلة',done:'اكتمل التنظيف وسُجّل في سجل تدقيق المنصة.',
    executionError:'لم يكتمل التنظيف، أعد الفحص ثم حاول مجدداً.',
    protected:'سجلات محمية',limit:'حتى ١٠٠ سجل لكل فئة في كل عملية مؤكدة.',
    audit:'تُسجّل هوية المنفذ والوقت ونوع السجلات والعدد والسبب في سجل التدقيق.',
    notice:'المعاملات المالية والمنظمات والفواتير والعملاء والرواتب والمدفوعات وسجلات التدقيق محمية من الحذف.',
    snapshot:'هذه معاينة فقط، ولم تُحذف أي بيانات.',refresh:'إعادة الفحص',
    cancelled:'تغيرت البيانات منذ آخر فحص؛ أعد الفحص قبل التأكيد.',
  },
};
const OPTIONS=[
  {value:'all',title:'all'},
  {value:'expired_invitations',title:'inv'},
  {value:'inactive_push_subscriptions',title:'push'},
];
const nameOf=(k,t)=>k==='expired_invitations'?t.inv:k==='inactive_push_subscriptions'?t.push:k;

export default function PlatformDatabaseCleanup({lang='en'}){
  const t=TEXT[lang]||TEXT.en,client=useQueryClient();
  const [category,setCategory]=useState('all');
  const [preview,setPreview]=useState(null);
  const [phrase,setPhrase]=useState('');
  const [reason,setReason]=useState('');
  const [ack,setAck]=useState(false);
  const [result,setResult]=useState(null);
  const scan=useMutation({
    mutationFn:()=>platformOwnerApi.databaseCleanupPreview(category),
    onSuccess:data=>{setPreview(data);setResult(null);setPhrase('');setAck(false);},
    onError:error=>{setPreview(null);toast.error(error?.message||t.scanError);}
  });
  const cleanup=useMutation({
    mutationFn:async()=>{
      const data=await platformOwnerApi.runDatabaseCleanup({
        category,token:preview.preview_token,reason:reason.trim(),confirmation:phrase,
      });
      if(data?.success!==true)throw new Error('CLEANUP_UNCONFIRMED');
      return data;
    },
    onSuccess:async data=>{
      setPreview(null);setResult(data);setPhrase('');setReason('');setAck(false);
      await client.invalidateQueries({queryKey:['platform-owner','activity']});
      toast.success(t.done);
    },
    onError:error=>{
      setPreview(null);setPhrase('');setAck(false);
      toast.error(String(error?.message||'').includes('PLATFORM_CLEANUP_SCAN_CHANGED')?t.cancelled:t.executionError);
    }
  });
  const canRun=Boolean(
    preview?.preview_token&&preview?.category===category&&preview?.batch_total>0&&
    phrase==='CLEANUP'&&reason.trim().length>=8&&reason.length<=500&&ack&&
    !cleanup.isPending&&!scan.isPending
  );
  const changeCategory=v=>{
    setCategory(v);setPreview(null);setPhrase('');setAck(false);setResult(null);
  };
  return <section dir={lang==='en'?'ltr':'rtl'} className="mx-auto min-w-0 max-w-3xl space-y-5">
    <div>
      <h1 className="flex items-center gap-2 text-xl font-black text-slate-950 sm:text-2xl">
        <DatabaseZap className="h-6 w-6 text-blue-600"/>{t.title}
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{t.subtitle}</p>
    </div>
    <div className="min-w-0 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
      <p className="text-sm leading-6 text-slate-600">{t.lead}</p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="min-w-0">
          <Label htmlFor="platform-cleanup-category">{t.group}</Label>
          <select id="platform-cleanup-category"
            value={category} onChange={e=>changeCategory(e.target.value)}
            className="mt-2 h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm">
            {OPTIONS.map(opt=><option key={opt.value} value={opt.value}>{t[opt.title]}</option>)}
          </select>
        </div>
        <Button type="button" className="min-h-11 gap-2" variant="outline"
          disabled={scan.isPending||cleanup.isPending} onClick={()=>scan.mutate()}>
          <RefreshCw className={'h-4 w-4 '+(scan.isPending?'animate-spin':'')}/>
          {preview?t.refresh:t.scan}
        </Button>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
        <AlertTriangle className="me-1 inline h-4 w-4"/>{t.notice}
      </div>
      {result&&<div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-bold">{t.done}</p>
        <p className="mt-1 text-lg font-extrabold tabular-nums">{result.deleted_total}</p>
      </div>}
      {preview&&<div className="space-y-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-900">
          <ShieldCheck className="me-1 inline h-4 w-4"/>{t.snapshot}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[['eligible_total',t.eligible],['batch_total',t.batch]].map(([field,title])=>
            <div key={field} className="min-w-0 rounded-xl bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-600">{title}</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{preview[field]||0}</p>
            </div>
          )}
        </div>
        <div className="space-y-2">
          {(preview.groups||[]).filter(x=>category==='all'||x.category===category)
            .map(x=><div key={x.category} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
              <span className="min-w-0 flex-1 text-sm font-semibold">{nameOf(x.category,t)}</span>
              <span className="shrink-0 text-sm font-black tabular-nums">{x.in_batch} / {x.eligible}</span>
            </div>)}
        </div>
        <p className="text-xs leading-5 text-slate-500">{t.limit}</p>
        {preview.batch_total>0?<div className="space-y-3 border-t pt-4">
          <div>
            <Label htmlFor="platform-cleanup-reason">{t.reason}</Label>
            <Textarea id="platform-cleanup-reason" dir="auto" maxLength={500}
              rows={2} value={reason} onChange={e=>setReason(e.target.value)}
              className="mt-2"/>
          </div>
          <div>
            <Label htmlFor="platform-cleanup-confirm">{t.confirm}</Label>
            <Input id="platform-cleanup-confirm" dir="ltr" autoComplete="off"
              value={phrase} onChange={e=>setPhrase(e.target.value)}
              placeholder="CLEANUP" className="mt-2"/>
          </div>
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-xs leading-5">
            <input type="checkbox" className="mt-1 shrink-0" checked={ack} onChange={e=>setAck(e.target.checked)}/>
            <span>{t.ack}</span>
          </label>
          <Button type="button" variant="destructive" className="min-h-11 w-full gap-2"
            disabled={!canRun} onClick={()=>cleanup.mutate()}>
            <Trash2 className="h-4 w-4"/>{t.action}
          </Button>
        </div>:<p className="text-center text-sm text-slate-500">{t.noRecords}</p>}
      </div>}
    </div>
    <p className="text-xs leading-6 text-slate-500">{t.audit}</p>
  </section>;
}
