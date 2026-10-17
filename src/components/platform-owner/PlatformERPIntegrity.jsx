import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Database, RefreshCw, ShieldCheck } from 'lucide-react';
import { platformOwnerApi } from '@/lib/platformOwnerApi';
import { Button } from '@/components/ui/button';

const WORDS={
 en:{
  title:'ERP Integrity Center',subtitle:'Live read-only checks across accounting, tenant scope and access controls',
  scan:'Scan integrity',loading:'Checking live database…',error:'Integrity check failed. No records have been changed.',
  total:'Records scanned',alerts:'Review flags',safe:'No flags detected',last:'Checked at',
  caution:'These are investigation flags, not automatic corrections. No invoice, amount, membership or organization is modified.',
  sales:'Sales invoices',supplier_invoices:'Supplier invoices',daily_sales:'Daily sales',
  branch_references:'Branch links',rls:'Database RLS',
  negative_amounts:'Negative amounts',overpaid:'Overpaid invoices',missing_organization:'Missing organization',
  missing_branch_id:'Missing branch ID',legacy_branch_name:'Legacy branch text labels',
  recent_missing_branch_id:'Missing branch ID in last 30 days',
  limitations:'RLS enabled does not guarantee permissions are correct. Review individual policies and end-to-end tests.',
  zero:'No matching records',archived:'Legacy records must be reconciled, not silently rewritten.',
 },
 fa:{
  title:'مرکز سلامت ERP',subtitle:'بررسی زنده و بدون تغییر اطلاعات حسابداری، سازمان‌ها و امنیت',
  scan:'بررسی دوباره',loading:'در حال بررسی دیتابیس…',error:'بررسی ناموفق بود. هیچ سندی تغییر نکرد.',
  total:'تعداد رکوردها',alerts:'موارد نیازمند بررسی',safe:'مورد مشکوکی ثبت نشد',last:'زمان بررسی',
  caution:'این‌ها هشدار بررسی هستند، نه اصلاح خودکار. هیچ فاکتور، مبلغ، کاربر یا سازمانی تغییر نمی‌کند.',
  sales:'فاکتورهای فروش',supplier_invoices:'فاکتورهای تأمین‌کننده',daily_sales:'فروشات روزانه',
  branch_references:'شناسه شعبه‌ها',rls:'امنیت دیتابیس (RLS)',
  negative_amounts:'مبالغ منفی',overpaid:'فاکتورهای اضافه‌پرداخت',
  missing_organization:'بدون شناسه سازمان',missing_branch_id:'بدون شناسه فرع',
  legacy_branch_name:'دارای نام متنی قدیمی فرع',recent_missing_branch_id:'بدون شناسه فرع در ۳۰ روز اخیر',
  limitations:'فعال‌بودن RLS به‌تنهایی امنیت تمام دسترسی‌ها را اثبات نمی‌کند؛ تست مجوزها نیز لازم است.',
  zero:'رکورد مرتبطی یافت نشد',archived:'اسناد قدیمی باید تطبیق شوند؛ مبلغ‌ها را خودکار بازنویسی نکنید.',
 },
 ar:{
  title:'مركز سلامة ERP',subtitle:'فحوصات حية للمالية وعزل المنظمات والأمان دون تعديل السجلات',
  scan:'إعادة الفحص',loading:'جارٍ فحص قاعدة البيانات…',error:'تعذر الفحص. لم تتغير أي سجلات.',
  total:'إجمالي السجلات',alerts:'تحتاج مراجعة',safe:'لا توجد مخالفات ظاهرة',last:'تاريخ الفحص',
  caution:'هذه تنبيهات للتحقيق وليست تصحيحات آلية. لا يتم تعديل الفواتير أو المبالغ أو الحسابات أو المنظمات.',
  sales:'فواتير المبيعات',supplier_invoices:'فواتير الموردين',daily_sales:'المبيعات اليومية',
  branch_references:'روابط الفروع',rls:'أمان قاعدة البيانات (RLS)',
  negative_amounts:'قيم سالبة',overpaid:'فواتير مدفوعة بأكثر من الإجمالي',
  missing_organization:'بدون معرف منظمة',missing_branch_id:'بدون معرف فرع',
  legacy_branch_name:'فرع بنص قديم',recent_missing_branch_id:'بدون معرف فرع آخر ٣٠ يوماً',
  limitations:'تفعيل RLS ليس دليلاً كافياً على سلامة كل الصلاحيات؛ يجب اختبار السياسات.',
  zero:'لا توجد سجلات مطابقة',archived:'السجلات القديمة تحتاج تسوية وليس تعديل مبالغها تلقائياً.',
 }
};
const DETAIL={
 en:{
  sales:'Saved total differs from cash + network + credit + other sales.',
  supplier_invoices:'Amounts paid exceed totals, or documents lack tenant scope.',
  daily_sales:'Historical closings may use a textual branch instead of branch ID.',
  branch_references:'Orphan branch identifiers in sales, purchases, invoices, expenses.',
  rls:'Public database tables with Row Level Security disabled.'
 },
 fa:{
  sales:'مجموع ثبت‌شده با نقد + شبکه + نسیه + سایر فروشات برابر نیست.',
  supplier_invoices:'پرداخت بیشتر از مبلغ فاکتور است یا شناسه سازمان خالی مانده.',
  daily_sales:'فروشات قدیمی ممکن است نام متنی فرع داشته باشند اما شناسه فرع نداشته باشند.',
  branch_references:'شناسه فرع نامعتبر در فروشات، خریدها، فاکتورها یا هزینه‌ها.',
  rls:'جدول‌های عمومی دیتابیس بدون فعال‌بودن RLS.'
 },
 ar:{
  sales:'إجمالي المبيعات المسجل لا يساوي النقد + الشبكة + الآجل + الأخرى.',
  supplier_invoices:'المدفوع يتجاوز الإجمالي أو لا يوجد معرف للمنظمة.',
  daily_sales:'قيود قديمة تحمل اسم فرع نصياً دون معرف رسمي.',
  branch_references:'معرفات فروع غير صالحة في العمليات المالية.',
  rls:'جداول عامة لا تدعم حماية الصفوف RLS.'
 }
};

function Details({ group, t }){
 const flags=[
   'negative_amounts','overpaid','missing_organization','missing_branch_id',
   'legacy_branch_name','recent_missing_branch_id'
 ].filter(key=>group[key]!==undefined);
 if(!flags.length)return null;
 return <div className="mt-3 grid gap-2 sm:grid-cols-2">
   {flags.map(key=><div key={key} className="flex min-w-0 justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs">
     <span className="min-w-0 break-words text-slate-600">{t[key]}</span>
     <span className="shrink-0 font-extrabold tabular-nums">{group[key]}</span>
   </div>)}
 </div>;
}
export default function PlatformERPIntegrity({ lang='en' }){
 const t=WORDS[lang]||WORDS.en, descriptions=DETAIL[lang]||DETAIL.en;
 const query=useQuery({
   queryKey:['platform-owner','integrity'],
   queryFn:platformOwnerApi.erpIntegritySnapshot,
   retry:false,staleTime:0,refetchOnMount:'always',
 });
 const groups=Array.isArray(query.data?.groups)?query.data.groups:[];
 const flags=groups.reduce((sum,item)=>sum+Math.max(0,Number(item.alerts)||0),0);
 return <div dir={lang==='en'?'ltr':'rtl'} className="mx-auto max-w-5xl min-w-0 space-y-5">
   <div className="flex flex-wrap items-start justify-between gap-3">
     <div className="min-w-0">
       <h1 className="flex items-center gap-2 text-xl font-black text-slate-950 sm:text-2xl">
         <Database className="h-6 w-6 shrink-0 text-blue-600"/>{t.title}
       </h1>
       <p className="mt-2 text-sm leading-6 text-slate-600">{t.subtitle}</p>
     </div>
     <Button type="button" variant="outline" className="min-h-11 gap-2"
       disabled={query.isFetching} onClick={()=>query.refetch()}>
       <RefreshCw className={'size-4 '+(query.isFetching?'animate-spin':'')}/>{t.scan}
     </Button>
   </div>
   <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
     <AlertTriangle className="me-1 inline size-4"/>{t.caution}
   </div>
   {query.isPending?<p role="status" className="rounded-xl bg-white p-5 text-sm">{t.loading}</p>:null}
   {query.isError?<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">{t.error}</div>:null}
   {query.isSuccess&&<div className="space-y-4">
     <div className="grid grid-cols-2 gap-3">
       <div className="rounded-2xl border border-slate-200 bg-white p-4">
         <p className="text-sm font-semibold text-slate-600">{t.total}</p>
         <p className="mt-2 text-2xl font-black tabular-nums">
           {groups.reduce((n,g)=>n+(Number.isFinite(Number(g.total))?Number(g.total):0),0)}
         </p>
       </div>
       <div className={'rounded-2xl border p-4 '+(flags?'border-amber-200 bg-amber-50':'border-emerald-200 bg-emerald-50')}>
         <p className="text-sm font-semibold">{t.alerts}</p>
         <p className="mt-2 text-2xl font-black tabular-nums">{flags}</p>
       </div>
     </div>
     <div className="grid gap-3 md:grid-cols-2">
       {groups.map(g=><section key={g.key} className="min-w-0 rounded-2xl border bg-white p-4">
         <div className="flex items-start justify-between gap-3">
           <div className="min-w-0">
             <h2 className="font-extrabold text-slate-950">{t[g.key]||g.key}</h2>
             <p className="mt-1 text-xs leading-5 text-slate-600">{descriptions[g.key]||''}</p>
           </div>
           {Number(g.alerts)>0?<span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-sm font-bold text-amber-900"><AlertTriangle className="size-4"/>{g.alerts}</span>
           :<CheckCircle2 className="size-5 shrink-0 text-emerald-600"/>}
         </div>
         {g.total!==null&&g.total!==undefined&&<p className="mt-2 text-xs text-slate-500">{t.total}: <span className="font-bold tabular-nums">{g.total}</span></p>}
         <Details group={g} t={t}/>
       </section>)}
     </div>
     <p className="text-xs text-slate-600">{t.last}: {query.data?.generated_at?new Date(query.data.generated_at).toLocaleString(lang==='en'?'en-US':lang==='ar'?'ar-SA':'fa-IR'):'—'}</p>
     <div className="flex items-start gap-2 rounded-xl border bg-slate-100 p-3 text-xs leading-5 text-slate-600">
       <ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-600"/>{t.limitations} {t.archived}
     </div>
   </div>}
 </div>;
}
