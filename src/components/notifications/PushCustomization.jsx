import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { preferencesForLanguage, FINANCIAL_LABELS, financialTemplate, DEFAULT_PREFERENCES, MODULES, TOKENS, renderNotification, validTemplate } from '../../../supabase/functions/owner-push/preferences.ts';

const labels = {
 en: {heading:'Customize ERP push notifications',scope:'Applies to all owner devices for this business. Save before sending a test.',enabled:'Send business notifications',title:'Notification title',body:'Notification text',language:'Follows app language',actions:'Operations',insert:'Created',update:'Updated',delete:'Deleted',modules:'ERP sections',sales:'Sales & POS',purchases:'Purchases & suppliers',inventory:'Products & inventory',finance:'Finance & debts',people:'Customers & employees',other:'Other business records',branches:'Branches',all:'All branches and business-wide records',branchHelp:'With specific branches selected, records without an identifiable branch are excluded.',reference:'Include record name / number',privacy:'Notification text may appear on the lock screen. Turning this off hides the {reference} variable.',tokens:'Variables: business, branch, operation, record type, reference, time',preview:'Preview · example record',test:'Test saved notification',save:'Save notification settings',reset:'Restore defaults in editor',saved:'Saved. All owner devices now use these settings.',loading:'Loading settings…',error:'Could not load settings. Try again.',retry:'Retry',invalid:'Use non-empty text and only the variables listed below.',empty:'No operations or sections selected: business notifications will not be sent.',paused:'Business notifications are paused. The test button still works.',dirty:'Unsaved changes — the test button uses the last saved settings.'},
 fa: {heading:'شخصی‌سازی اعلان‌های ERP',scope:'برای تمام دستگاه‌های مالک همین کسب‌وکار اعمال می‌شود. قبل از اعلان آزمایشی، ذخیره کنید.',enabled:'ارسال اعلان‌های کسب‌وکار',title:'عنوان اعلان',body:'متن اعلان',language:'زبان اعلان مطابق زبان اپ',actions:'نوع عملیات',insert:'ثبت',update:'تغییر',delete:'حذف',modules:'بخش‌های ERP',sales:'فروش و POS',purchases:'خرید و تأمین‌کننده',inventory:'محصولات و موجودی',finance:'مالی و بدهی‌ها',people:'مشتری و کارمند',other:'سایر رکوردهای کاری',branches:'شعبه‌ها',all:'همهٔ شعبه‌ها و رکوردهای عمومی کسب‌وکار',branchHelp:'با انتخاب شعبه‌های مشخص، رکوردهایی که شعبهٔ مشخص ندارند ارسال نمی‌شوند.',reference:'نمایش نام یا شمارهٔ رکورد',privacy:'متن اعلان ممکن است روی صفحهٔ قفل دیده شود. خاموش‌کردن این گزینه متغیر {reference} را پنهان می‌کند.',tokens:'متغیرها: کسب‌وکار، شعبه، عملیات، نوع رکورد، شماره یا نام رکورد، زمان',preview:'پیش‌نمایش · رکورد نمونه',test:'تست اعلان ذخیره‌شده',save:'ذخیرهٔ تنظیمات اعلان',reset:'برگشت به تنظیمات پیش‌فرض در ویرایشگر',saved:'ذخیره شد. تنظیمات روی تمام دستگاه‌های مالک اعمال می‌شود.',loading:'در حال دریافت تنظیمات…',error:'تنظیمات دریافت نشد. دوباره تلاش کنید.',retry:'تلاش دوباره',invalid:'متن نباید خالی باشد؛ فقط از متغیرهای زیر استفاده کنید.',empty:'عملیات یا بخش انتخاب نشده؛ اعلان کاری ارسال نمی‌شود.',paused:'اعلان‌های کاری متوقف است. دکمهٔ تست همچنان کار می‌کند.',dirty:'تغییرات ذخیره نشده؛ اعلان آزمایشی از تنظیمات قبلی استفاده می‌کند.'},
 ar: {heading:'تخصيص إشعارات ERP',scope:'تُطبّق على جميع أجهزة المالك لهذه المنشأة. احفظ قبل إرسال إشعار تجريبي.',enabled:'إرسال إشعارات المنشأة',title:'عنوان الإشعار',body:'نص الإشعار',language:'لغة الإشعار تتبع لغة التطبيق',actions:'العمليات',insert:'إضافة',update:'تعديل',delete:'حذف',modules:'أقسام ERP',sales:'المبيعات ونقاط البيع',purchases:'المشتريات والموردون',inventory:'المنتجات والمخزون',finance:'المالية والديون',people:'العملاء والموظفون',other:'السجلات الأخرى',branches:'الفروع',all:'جميع الفروع والسجلات العامة للمنشأة',branchHelp:'عند تحديد فروع معينة، لا تُرسل السجلات التي ليس لها فرع محدد.',reference:'إظهار اسم أو رقم السجل',privacy:'قد يظهر النص على شاشة القفل. إيقاف هذا الخيار يخفي متغير {reference}.',tokens:'المتغيرات: المنشأة، الفرع، العملية، نوع السجل، المرجع، الوقت',preview:'معاينة · سجل تجريبي',test:'اختبار الإشعار المحفوظ',save:'حفظ إعدادات الإشعارات',reset:'استعادة الإعدادات الافتراضية في المحرر',saved:'تم الحفظ. تُطبّق الإعدادات على جميع أجهزة المالك.',loading:'جارٍ تحميل الإعدادات…',error:'تعذّر تحميل الإعدادات. حاول مجددًا.',retry:'إعادة المحاولة',invalid:'اكتب نصًا غير فارغ واستخدم المتغيرات الموضحة فقط.',empty:'لم يتم تحديد عمليات أو أقسام؛ لن تُرسل إشعارات العمل.',paused:'إشعارات العمل متوقفة. يبقى الإشعار التجريبي متاحًا.',dirty:'تغييرات غير محفوظة — الإشعار التجريبي يستخدم آخر إعدادات محفوظة.'},
};
export default function PushCustomization({ restaurant, branches = [], onTest, testEnabled, testing }) {
 const {lang}=useLanguage();
 const latestLanguage=useRef(lang);
 latestLanguage.current=lang;
 const t=labels[lang] || labels.en;
 const [draft,setDraft]=useState(null),[loaded,setLoaded]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let alive=true;
  setDraft(null);setLoaded(null);setError('');setMessage('');
  supabase.from('owner_push_preferences').select('*').eq('restaurant_id',restaurant.id).maybeSingle().then(({data,error})=>{
   if(!alive)return;
   if(error){setError(error.message);return;}
   const value={...DEFAULT_PREFERENCES,...data};
   setDraft(preferencesForLanguage(value,latestLanguage.current));setLoaded(value);
  }).catch(e=>{if(alive)setError(e.message);});
  return()=>{alive=false;};
 },[restaurant.id,retry]);
 useEffect(()=>{setDraft(d=>d?preferencesForLanguage(d,lang):d);},[lang]);
 const set=(key,value)=>{setDraft(d=>({...d,[key]:value}));setMessage('');};
 const toggle=(key,value)=>set(key,draft[key].includes(value)?draft[key].filter(x=>x!==value):[...draft[key],value]);
 const save=async()=>{
  setBusy(true);setMessage('');
  const snapshot={...draft};
  try{
   const payload=Object.fromEntries(Object.keys(DEFAULT_PREFERENCES).map(key=>[key,snapshot[key]]));
   const {error}=await supabase.from('owner_push_preferences').upsert({...payload,restaurant_id:restaurant.id},{onConflict:'restaurant_id'});
   if(error)throw error;
   setLoaded(snapshot);setMessage(t.saved);
  }catch(e){setMessage(e.message);}finally{setBusy(false);}
 };
 if(!draft)return <div className="border-t pt-4"><h3 className="font-semibold">{t.heading}</h3><p role="status" className="text-sm mt-2">{error?t.error:t.loading}</p>{error&&<Button variant="outline" onClick={()=>setRetry(n=>n+1)}>{t.retry}</Button>}</div>;
 const ft=FINANCIAL_LABELS[draft.language] || FINANCIAL_LABELS.en;
 const dirty=JSON.stringify(draft)!==JSON.stringify(loaded);
 const valid=validTemplate(draft.title_template,100)&&validTemplate(draft.body_template,500);
 const sampleBranch=branches.find(b=>draft.branch_ids.includes(b.id)) || (!draft.branch_ids.length?branches[0]:null);
 const examples={sales:'sales_invoices',purchases:'purchases',inventory:'products',finance:'expenses',people:'employees',other:'tasks'};
 const preview=renderNotification(draft,{action:draft.actions[0] || 'insert',entity:examples[draft.modules[0]] || 'sales_invoices',reference:'TEST-001',created_at:new Date().toISOString()},restaurant,sampleBranch?{...sampleBranch,name:sampleBranch.name || sampleBranch.label}:null,{date:'2026-10-05',currency:restaurant.currency || 'SAR',network_sales:2000,pos_sales:3500,source_sales:1500,sales:5000,purchases:2000,expenses:750,net_profit:2250});
 const checkbox=(checked,onChange,text)=> <label className="flex items-center gap-2 py-2 text-sm cursor-pointer"><input type="checkbox" className="size-4 shrink-0 accent-blue-600" checked={checked} onChange={onChange} disabled={busy}/><span>{text}</span></label>;
 return <details className="border-t pt-4" open>
  <summary className="font-semibold cursor-pointer">{t.heading}</summary>
  <div className="space-y-4 mt-3">
   <p className="text-sm text-muted-foreground">{t.scope}</p>
   {checkbox(draft.enabled,()=>set('enabled',!draft.enabled),t.enabled)}
   <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-2 min-w-0">
    {checkbox(draft.financial_summary,()=>set('financial_summary',!draft.financial_summary),ft.heading)}
    <p className="text-xs text-muted-foreground leading-relaxed">{ft.help}</p>
    <Button type="button" variant="outline" disabled={busy} className="max-w-full whitespace-normal h-auto py-2" onClick={()=>{setDraft(d=>({...d,financial_summary:true,title_template:'{business}',body_template:financialTemplate(d.language)}));setMessage('');}}>{ft.preset}</Button>
   </div>
   <div className="grid gap-4 sm:grid-cols-2">
    <label className="text-sm space-y-1"><span>{t.title} ({draft.title_template.length}/100)</span><Input value={draft.title_template} maxLength={100} disabled={busy} onChange={e=>set('title_template',e.target.value)}/></label>
    <label className="text-sm space-y-1"><span>{t.language}</span><div className="rounded-md border bg-muted/40 p-2">{{en:'English',ar:'العربية',fa:'فارسی'}[lang] || 'English'}</div></label>
   </div>
   <label className="block text-sm space-y-1"><span>{t.body} ({draft.body_template.length}/500)</span><textarea className="w-full min-h-24 rounded-md border bg-background p-3" value={draft.body_template} maxLength={500} disabled={busy} onChange={e=>set('body_template',e.target.value)}/></label>
   <div className="text-xs text-muted-foreground space-y-2"><p>{t.tokens}</p><div className="flex flex-wrap gap-2" dir="ltr">{TOKENS.map(token=><code key={token} className="rounded bg-muted px-2 py-1">{'{'+token+'}'}</code>)}</div></div>
   {!valid&&<p role="alert" className="text-sm text-red-600">{t.invalid}</p>}
   <fieldset><legend className="text-sm font-medium">{t.actions}</legend><div className="flex flex-wrap gap-x-5">{['insert','update','delete'].map(value=><React.Fragment key={value}>{checkbox(draft.actions.includes(value),()=>toggle('actions',value),t[value])}</React.Fragment>)}</div></fieldset>
   <fieldset><legend className="text-sm font-medium">{t.modules}</legend><div className="grid grid-cols-1 sm:grid-cols-2">{MODULES.map(value=><React.Fragment key={value}>{checkbox(draft.modules.includes(value),()=>toggle('modules',value),t[value])}</React.Fragment>)}</div></fieldset>
   <fieldset><legend className="text-sm font-medium">{t.branches}</legend>{checkbox(draft.branch_ids.length===0,()=>set('branch_ids',[]),t.all)}<div className="grid grid-cols-1 sm:grid-cols-2 max-h-48 overflow-y-auto">{branches.filter(b=>b.id).map(b=><React.Fragment key={b.id}>{checkbox(draft.branch_ids.includes(b.id),()=>toggle('branch_ids',b.id),b.name || b.label || b.branch_key)}</React.Fragment>)}</div><p className="text-xs text-muted-foreground">{t.branchHelp}</p></fieldset>
   <div>{checkbox(draft.show_reference,()=>set('show_reference',!draft.show_reference),t.reference)}<p className="text-xs text-muted-foreground">{t.privacy}</p></div>
   {!draft.enabled?<p className="text-sm text-amber-700">{t.paused}</p>:(!draft.actions.length || !draft.modules.length)&&<p className="text-sm text-amber-700">{t.empty}</p>}
   <div className="rounded-xl border bg-muted/40 p-4 space-y-1 break-words" dir={draft.language==='en'?'ltr':'rtl'} aria-label={t.preview}><p className="text-xs text-muted-foreground">{t.preview}</p><p className="font-semibold">{preview.title}</p><p className="text-sm whitespace-pre-wrap">{preview.body}</p></div>
   {dirty&&<p className="text-sm text-amber-700">{t.dirty}</p>}
   <div className="flex flex-wrap gap-2"><Button disabled={busy || !valid || !dirty} onClick={save}>{t.save}</Button><Button variant="outline" disabled={busy || testing || dirty || !testEnabled} onClick={onTest}>{t.test}</Button><Button variant="outline" disabled={busy} onClick={()=>{setDraft({...DEFAULT_PREFERENCES});setMessage('');}}>{t.reset}</Button></div>
   {message&&<p role="status" className="text-sm break-words">{message}</p>}
  </div>
 </details>;
}
