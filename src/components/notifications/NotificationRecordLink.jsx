import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';
import { useBranchScope } from '@/lib/BranchScopeContext';
import { useLanguage } from '@/lib/LanguageContext';
import { notificationTarget, validEventId } from '../../../supabase/functions/owner-push/navigation.ts';
import { DEFAULT_PREFERENCES, renderNotification, resolveBranch } from '../../../supabase/functions/owner-push/preferences.ts';
import { isKnownEntity } from '../../../supabase/functions/owner-push/events.ts';

const Context=createContext(null);
export const useNotificationRecord=()=>useContext(Context);
const copy={
 en:{loading:'Opening the notification record…',unavailable:'This notification is unavailable or you do not have access.',deleted:'This record was deleted. The details below were saved at deletion.',missing:'The current record is unavailable. Showing the notification details.',record:'Notification record',close:'Close record details'},
 fa:{loading:'رکورد اعلان در حال بازشدن است…',unavailable:'این اعلان در دسترس نیست یا اجازهٔ مشاهده ندارید.',deleted:'این رکورد حذف شده است. معلومات زیر هنگام حذف ذخیره شده بود.',missing:'رکورد فعلی در دسترس نیست. معلومات اعلان نمایش داده می‌شود.',record:'رکورد مربوط به اعلان',close:'بستن جزئیات رکورد'},
 ar:{loading:'جارٍ فتح سجل الإشعار…',unavailable:'الإشعار غير متاح أو ليس لديك صلاحية لعرضه.',deleted:'تم حذف هذا السجل. التفاصيل أدناه محفوظة وقت الحذف.',missing:'السجل الحالي غير متاح. تُعرض تفاصيل الإشعار.',record:'السجل المرتبط بالإشعار',close:'إغلاق تفاصيل السجل'},
};

export default function NotificationRecordLink({children}) {
 const location=useLocation(),navigate=useNavigate();
 const {user}=useAuth();
 const {restaurants,activeRestaurant,setActiveRestaurant,allBranches=[]}=useTenant();
 const {setSelectedBranchId}=useBranchScope();
 const {lang}=useLanguage();
 const t=copy[lang] || copy.en;
 const id=new URLSearchParams(location.search).get('notification');
 const selected=useRef('');
 const eventQuery=useQuery({
  queryKey:['notification-record-event',user?.id,id],enabled:!!user?.id && validEventId(id),retry:false,
  queryFn:async()=>{
   const {data,error}=await supabase.from('owner_record_events').select('id,restaurant_id,entity,action,record_id,reference,branch,context,created_at').eq('id',id).maybeSingle();
   if(error) throw error;
   return data;
  },
 });
 const event=eventQuery.data;
 const authorized=Boolean(event && restaurants.some(r=>r.id===event.restaurant_id));
 const correctBusiness=authorized && activeRestaurant?.id===event.restaurant_id;
 const branch=correctBusiness?resolveBranch(event,allBranches):null;
 useEffect(()=>{
  if(!authorized) return;
  if(!correctBusiness) {setActiveRestaurant(event.restaurant_id);return;}
  if(branch && selected.current!==event.id) {setSelectedBranchId(branch.id);selected.current=event.id;}
  const target=notificationTarget(event);
  if(location.pathname!==target.split('?')[0]) navigate(target,{replace:true});
 },[authorized,correctBusiness,event,branch,setActiveRestaurant,setSelectedBranchId,location.pathname,navigate]);
 const recordQuery=useQuery({
  queryKey:['notification-record',user?.id,event?.restaurant_id,event?.entity,event?.record_id,event?.id],
  enabled:!!id && correctBusiness && event?.action!=='delete' && isKnownEntity(event?.entity) && !!event?.record_id,
  retry:false,
  queryFn:async()=>{
   const {data,error}=await supabase.from(event.entity).select('*').eq('id',event.record_id).eq('restaurant_id',event.restaurant_id).maybeSingle();
   if(error) throw error;
   return data;
  },
 });
 const record=recordQuery.data;
 const close=()=>{const params=new URLSearchParams(location.search);params.delete('notification');navigate({pathname:location.pathname,search:params.toString()},{replace:true});};
 if(!id) return <Context.Provider value={null}>{children}</Context.Provider>;
 if(eventQuery.isLoading || (authorized && !correctBusiness)) return <p role="status" className="p-4">{t.loading}</p>;
 if(!event || !authorized) return <><div role="status" className="mb-4 rounded-xl border p-4">{t.unavailable}<button className="ms-3 underline" onClick={close}>{t.close}</button></div>{children}</>;
 const shown=renderNotification({...DEFAULT_PREFERENCES,language:lang,financial_summary:false,body_template:'{branch} · {time}'},event,activeRestaurant,branch);
 const name=record?.invoice_number || record?.order_number || record?.name || record?.full_name || record?.driver_name || record?.description;
 const date=record?.date || record?.sale_date || record?.business_date;
 return <Context.Provider value={{event,record,loading:recordQuery.isLoading}}>
  <section className="mb-4 min-w-0 rounded-xl border border-blue-200 bg-blue-50/40 p-4" aria-label={t.record}>
   <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="font-bold">{t.record}</h2><button type="button" className="text-sm underline" onClick={close}>{t.close}</button></div>
   {event.action==='delete' ? <p className="mt-2 text-sm font-semibold text-red-700">{t.deleted}</p> : !record && !recordQuery.isLoading && <p className="mt-2 text-sm">{t.missing}</p>}
   <p className="mt-2 whitespace-pre-wrap break-words text-sm" dir={lang==='en'?'ltr':'rtl'}>{shown.body}</p>
   {record && <p className="mt-2 break-words text-sm font-medium">{[name,date].filter(Boolean).join(' · ')}</p>}
  </section>
  {children}
 </Context.Provider>;
}
