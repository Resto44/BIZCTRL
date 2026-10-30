import React, {useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {Card} from '@/components/ui/card';
import {Switch} from '@/components/ui/switch';
import {toast} from 'sonner';

const labels={
 en:{
  title:'Owner automatic PDF reports',detail:'Completed periods · 08:00 Asia/Riyadh',frequencyTitle:'Select report schedules',frequencyHint:'Choose one or more. Each checked schedule sends its own completed-period PDF.',
  recipient:'Verified owner email',toggle:'Enable daily PDF',paused:'Paused',active:'Active',
  missing:'Automatic PDF is not enrolled for this organization. Existing organizations were not bulk-enrolled.',
  load:'Could not load daily PDF settings.',save:'Could not save report settings.',saved:'Report settings saved.',
  language:'PDF language',scope:'PDF branch',all:'All branches',history:'Delivery history',
  audit:'Owner changes',week:'7 days',month:'30 days',accepted:'Accepted by provider',
  pending:'Pending',sending:'Sending',failed:'Failed',cancelled:'Cancelled',
  noHistory:'No deliveries in this period.',noAudit:'No owner setting changes yet.',
  notice:'Provider acceptance does not confirm inbox delivery. Confirm in the email inbox or Resend.',
  alert:'An automatic report has failed. Review its delivery record.',
  historyError:'Delivery history is unavailable.',auditError:'Audit history is unavailable.',
  attempts:'Attempts',provider:'Provider ID',unavailable:'Unavailable'
 },
 ar:{
  title:'تقارير PDF التلقائية للمالك',detail:'بعد اكتمال الفترة · ٨ صباحاً بتوقيت الرياض',frequencyTitle:'اختر دورية التقارير',frequencyHint:'يمكن اختيار أكثر من دورية. كل دورية ترسل PDF مستقل بعد اكتمال الفترة.',
  recipient:'بريد المالك المؤكد',toggle:'تفعيل التقرير اليومي',paused:'متوقف',active:'مفعّل',
  missing:'هذه المؤسسة غير مسجلة في الإرسال التلقائي. لم تُفعّل المؤسسات القديمة تلقائياً.',
  load:'تعذر تحميل الإعدادات.',save:'تعذر حفظ الإعدادات.',saved:'تم حفظ الإعدادات.',
  language:'لغة PDF',scope:'فرع التقرير',all:'جميع الفروع',history:'سجل التسليم',
  audit:'تغييرات المالك',week:'٧ أيام',month:'٣٠ يوماً',accepted:'قبله مزود البريد',
  pending:'قيد الانتظار',sending:'جارٍ الإرسال',failed:'فشل',cancelled:'ملغى',
  noHistory:'لا توجد عمليات إرسال في هذه الفترة.',noAudit:'لا توجد تغييرات مسجلة.',
  notice:'قبول مزود البريد لا يعني وصوله إلى صندوق الوارد. تحقق من بريدك أو Resend.',
  alert:'فشل إرسال تقرير تلقائي. راجع سجل التسليم.',
  historyError:'تعذر تحميل سجل التسليم.',auditError:'تعذر تحميل سجل التغييرات.',
  attempts:'محاولات',provider:'معرّف المزود',unavailable:'غير متاح'
 },
 fa:{
  title:'کنترل گزارش‌های خودکار PDF مالک',detail:'پس از پایان دوره · ساعت ۸ صبح ریاض',frequencyTitle:'زمان‌بندی گزارش‌های PDF',frequencyHint:'یک یا چند دوره انتخاب کنید. هر دوره بعد از پایان خودش PDF جدا ارسال می‌کند.',
  recipient:'ایمیل تأییدشده مالک',toggle:'فعال‌سازی گزارش روزانه',paused:'متوقف',active:'فعال',
  missing:'این سازمان در ارسال خودکار ثبت نشده است. سازمان‌های قدیمی به‌طور گروهی فعال نشده‌اند.',
  load:'تنظیمات گزارش بارگذاری نشد.',save:'تنظیمات گزارش ذخیره نشد.',saved:'تنظیمات گزارش ذخیره شد.',
  language:'زبان PDF',scope:'شعبه گزارش',all:'تمام شعبه‌ها',history:'تاریخچه ارسال',
  audit:'تغییرات مالک',week:'۷ روز',month:'۳۰ روز',accepted:'پذیرفته‌شده توسط سرویس',
  pending:'در صف',sending:'در حال ارسال',failed:'ناموفق',cancelled:'لغوشده',
  noHistory:'در این بازه گزارشی ثبت نشده است.',noAudit:'هنوز تغییر تنظیماتی ثبت نشده است.',
  notice:'پذیرش سرویس ایمیل، دریافت در Inbox را ثابت نمی‌کند. ایمیل یا Resend را بررسی کنید.',
  alert:'یک گزارش خودکار ناموفق بوده است. تاریخچه ارسال را ببینید.',
  historyError:'تاریخچه ارسال در دسترس نیست.',auditError:'تاریخچه تغییرات در دسترس نیست.',
  attempts:'تلاش‌ها',provider:'شناسه سرویس',unavailable:'ناموجود'
 }
};
const periods=[
 {id:'daily',title:{en:'Daily',ar:'يومي',fa:'روزانه'},hint:{en:'Previous day',ar:'اليوم السابق',fa:'روز گذشته'}},
 {id:'weekly',title:{en:'Weekly',ar:'أسبوعي',fa:'هفتگی'},hint:{en:'Every Saturday',ar:'كل سبت',fa:'هر شنبه'}},
 {id:'monthly',title:{en:'Monthly',ar:'شهري',fa:'ماهانه'},hint:{en:'First day of month',ar:'أول الشهر',fa:'اول هر ماه'}},
 {id:'quarterly',title:{en:'Every 3 months',ar:'كل ٣ أشهر',fa:'هر ۳ ماه'},hint:{en:'Jan / Apr / Jul / Oct',ar:'يناير / أبريل / يوليو / أكتوبر',fa:'ژانویه / اپریل / جولای / اکتبر'}},
 {id:'semiannual',title:{en:'Every 6 months',ar:'كل ٦ أشهر',fa:'هر ۶ ماه'},hint:{en:'January / July',ar:'يناير / يوليو',fa:'ژانویه / جولای'}},
 {id:'nine_months',title:{en:'Every 9 months',ar:'كل ٩ أشهر',fa:'هر ۹ ماه'},hint:{en:'Non-overlapping 9-month blocks',ar:'فترات ٩ أشهر غير متداخلة',fa:'دوره‌های ۹ ماهه بدون هم‌پوشانی'}},
 {id:'yearly',title:{en:'Yearly',ar:'سنوي',fa:'سالانه'},hint:{en:'Every January 1',ar:'كل ١ يناير',fa:'اول ژانویه هر سال'}}
];
const langs=[{value:'en',label:'English'},{value:'ar',label:'العربية'},{value:'fa',label:'فارسی'}];
const formatDate=(value,lang)=>{
 if(!value)return '—';
 const date=new Date(value);
 return Number.isNaN(date.getTime())?String(value):
  new Intl.DateTimeFormat(lang==='fa'?'fa-IR':lang==='ar'?'ar-SA':'en-GB',
   {timeZone:'Asia/Riyadh',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
};

export default function AutomaticOwnerReport({restaurantId,lang,branches=[],isOwner=false}){
 const text=labels[lang]||labels.en;
 const client=useQueryClient();
 const [days,setDays]=useState(7);
 const queryKey=['automatic_owner_report',restaurantId];
 const {data,isLoading,isError}=useQuery({
  queryKey,enabled:Boolean(restaurantId&&isOwner),retry:1,
  queryFn:async()=>{
   const {data:row,error}=await supabase.from('organization_report_email')
    .select('restaurant_id,enabled,report_language,report_branch_id,report_frequencies,last_accepted_at,last_report_date')
    .eq('restaurant_id',restaurantId).maybeSingle();
   if(error)throw error;
   if(!row)return null;
   const {data:identity,error:authError}=await supabase.auth.getUser();
   if(authError)throw authError;
   return {...row,email:identity.user?.email||''};
  }
 });
 const {data:history=[],isError:historyError}=useQuery({
  queryKey:['owner_report_history',restaurantId,days],
  enabled:Boolean(data?.restaurant_id&&isOwner),retry:1,
  queryFn:async()=>{
   const {data:rows,error}=await supabase.rpc('erp_owner_report_history',
    {p_restaurant_id:restaurantId,p_limit:days});
   if(error)throw error;
   return Array.isArray(rows)?rows:[];
  }
 });
 const {data:audit=[],isError:auditError}=useQuery({
  queryKey:['owner_report_audit',restaurantId],
  enabled:Boolean(data?.restaurant_id&&isOwner),retry:1,
  queryFn:async()=>{
   const {data:rows,error}=await supabase.rpc('erp_owner_report_audit',
    {p_restaurant_id:restaurantId,p_limit:10});
   if(error)throw error;
   return Array.isArray(rows)?rows:[];
  }
 });
 const update=useMutation({
  mutationFn:async changes=>{
   const {data:row,error}=await supabase.from('organization_report_email')
    .update(changes).eq('restaurant_id',restaurantId).select('restaurant_id').single();
   if(error||!row)throw error||new Error('OWNER_REPORT_UPDATE_FAILED');
  },
  onSuccess:()=>{
   client.invalidateQueries({queryKey});
   client.invalidateQueries({queryKey:['owner_report_audit',restaurantId]});
   toast.success(text.saved);
  },
  onError:()=>toast.error(text.save)
 });
 if(!isOwner||!restaurantId)return null;
 if(isLoading)return <Card className="mb-3 p-3 text-sm text-muted-foreground" role="status">…</Card>;
 if(isError)return <p role="alert" className="mb-3 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{text.load}</p>;
 if(!data)return <Card className="mb-3 p-3"><h2 className="font-semibold">{text.title}</h2><p className="mt-1 text-sm text-muted-foreground">{text.missing}</p></Card>;
 const failed=history.some(row=>row.state==='failed');
 const status={accepted:text.accepted,pending:text.pending,sending:text.sending,failed:text.failed,cancelled:text.cancelled};
 const branchOptions=(branches||[]).filter(b=>b.id&&b.restaurant_id===restaurantId);
 const inputClass='min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm';
 return <Card className="mb-3 space-y-3 p-3 sm:p-4">
  <div className="flex items-start justify-between gap-3">
   <div className="min-w-0">
    <h2 className="text-base font-semibold">{text.title}</h2>
    <p className="text-xs text-muted-foreground">{text.detail}</p>
    <p className="mt-1 break-all text-xs text-muted-foreground">{text.recipient}: <span dir="ltr">{data.email}</span></p>
    <p className="mt-1 text-xs font-semibold">{data.enabled?text.active:text.paused}</p>
   </div>
   <Switch aria-label={text.toggle} checked={Boolean(data.enabled)}
    disabled={update.isPending} onCheckedChange={enabled=>update.mutate({enabled})}/>
  </div>
  <section className="space-y-2" aria-label={text.frequencyTitle}>
   <h3 className="text-sm font-semibold">{text.frequencyTitle}</h3>
   <p className="text-xs text-muted-foreground">{text.frequencyHint}</p>
   <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
    {periods.map(period=>{
     const checked=(data.report_frequencies||['daily']).includes(period.id);
     return <div key={period.id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border p-3">
      <div className="min-w-0">
       <p className="text-sm font-medium">{period.title[lang]||period.title.en}</p>
       <p className="text-xs text-muted-foreground">{period.hint[lang]||period.hint.en}</p>
      </div>
      <Switch aria-label={period.title[lang]||period.title.en}
       checked={Boolean(checked)} disabled={!data.enabled||update.isPending}
       onCheckedChange={isOn=>{
        const current=data.report_frequencies||['daily'];
        const next=isOn?[...new Set([...current,period.id])]:current.filter(item=>item!==period.id);
        update.mutate({report_frequencies:next});
       }}/>
     </div>;
    })}
   </div>
  </section>
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
   <label className="block min-w-0 text-xs font-medium">{text.language}
    <select className={inputClass+' mt-1'} aria-label={text.language} value={data.report_language||'en'}
     disabled={update.isPending}
     onChange={event=>update.mutate({report_language:event.target.value})}>
     {langs.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
   </label>
   <label className="block min-w-0 text-xs font-medium">{text.scope}
    <select className={inputClass+' mt-1'} aria-label={text.scope} value={data.report_branch_id||'all'}
     disabled={update.isPending}
     onChange={event=>update.mutate({report_branch_id:event.target.value==='all'?null:event.target.value})}>
     <option value="all">{text.all}</option>
     {branchOptions.map(b=><option key={b.id} value={b.id}>{b.name||b.label||b.branch_key}</option>)}
    </select>
   </label>
  </div>
  {data.last_accepted_at&&<p className="text-xs text-muted-foreground">{text.accepted}: {data.last_report_date} · {formatDate(data.last_accepted_at,lang)}</p>}
  {failed&&<p role="alert" className="rounded-lg border border-destructive/40 p-2 text-xs text-destructive">{text.alert}</p>}
  <p className="rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">{text.notice}</p>
  <details className="rounded-lg border p-3">
   <summary className="cursor-pointer text-sm font-semibold">{text.history}</summary>
   <div className="mt-2 flex gap-2">
    {[7,30].map(count=><button key={count} type="button" onClick={()=>setDays(count)}
     aria-pressed={days===count}
     className={'rounded-lg border px-3 py-2 text-xs '+(days===count?'bg-primary text-primary-foreground':'bg-background')}>
     {count===7?text.week:text.month}</button>)}
   </div>
   {historyError?<p role="alert" className="mt-2 text-xs text-destructive">{text.historyError}</p>:
    !history.length?<p className="mt-2 text-xs text-muted-foreground">{text.noHistory}</p>:
    <ul className="mt-2 space-y-2">
     {history.map(row=><li key={(row.frequency||'daily')+'-'+row.report_date} className="rounded-lg bg-muted/40 p-2 text-xs">
      <div className="flex flex-wrap justify-between gap-1"><strong>{periods.find(p=>p.id===(row.frequency||'daily'))?.title[lang]||'Daily'} · {row.period_start||row.report_date} → {row.report_date}</strong>
       <span className={row.state==='failed'?'text-destructive':'text-muted-foreground'}>{status[row.state]||row.state}</span></div>
      <p className="mt-1 text-muted-foreground">{text.attempts}: {row.attempts}
       {row.last_error?' · '+row.last_error:''}</p>
      {row.provider_id&&<p className="mt-1 break-all text-muted-foreground">{text.provider}: <span dir="ltr">{row.provider_id}</span></p>}
     </li>)}
    </ul>}
  </details>
  <details className="rounded-lg border p-3">
   <summary className="cursor-pointer text-sm font-semibold">{text.audit}</summary>
   {auditError?<p role="alert" className="mt-2 text-xs text-destructive">{text.auditError}</p>:
    !audit.length?<p className="mt-2 text-xs text-muted-foreground">{text.noAudit}</p>:
    <ul className="mt-2 space-y-2">
     {audit.map((entry,i)=><li key={entry.changed_at+'-'+i} className="rounded-lg bg-muted/40 p-2 text-xs">
      <p>{formatDate(entry.changed_at,lang)}</p>
      <p className="mt-1 break-words text-muted-foreground">{Object.keys(entry.changes||{}).join(' · ')}</p>
     </li>)}
    </ul>}
  </details>
 </Card>;
}
