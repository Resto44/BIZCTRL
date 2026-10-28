import React from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {Card} from '@/components/ui/card';
import {Switch} from '@/components/ui/switch';
import {toast} from 'sonner';

const labels={
 en:{title:'Daily organization report',detail:'Previous day · All branches · 08:00 Asia/Riyadh',recipient:'Sent automatically to your verified account email',toggle:'Enable daily reports',paused:'Paused',active:'Enabled',failed:'Could not update daily reports.',load:'Could not load daily report settings.',accepted:'Last accepted by email provider'},
 ar:{title:'التقرير اليومي للمؤسسة',detail:'اليوم السابق · جميع الفروع · ٨ صباحاً بتوقيت الرياض',recipient:'يرسل تلقائياً إلى بريد حسابك المؤكد',toggle:'تفعيل التقارير اليومية',paused:'متوقف',active:'مفعّل',failed:'تعذر تحديث التقارير اليومية.',load:'تعذر تحميل إعدادات التقرير اليومي.',accepted:'آخر قبول من مزود البريد'},
 fa:{title:'گزارش روزانهٔ سازمان',detail:'روز گذشته · تمام شعبه‌ها · ساعت ۸ صبح ریاض',recipient:'ارسال خودکار به ایمیل تأییدشدهٔ حساب شما',toggle:'فعال‌سازی گزارش روزانه',paused:'متوقف',active:'فعال',failed:'تنظیم گزارش روزانه ذخیره نشد.',load:'تنظیمات گزارش روزانه بارگذاری نشد.',accepted:'آخرین پذیرش توسط سرویس ایمیل'},
};

export default function AutomaticOwnerReport({restaurantId,lang}){
 const text=labels[lang]||labels.en;
 const client=useQueryClient(),queryKey=['automatic_owner_report',restaurantId];
 const {data,isError}=useQuery({queryKey,enabled:Boolean(restaurantId),queryFn:async()=>{
  const {data:row,error}=await supabase.from('organization_report_email').select('*').eq('restaurant_id',restaurantId).maybeSingle();
  if(error)throw error;
  if(!row)return null;
  const {data:identity,error:authError}=await supabase.auth.getUser();
  if(authError)throw authError;
  return {...row,email:identity.user?.email};
 }});
 const toggle=useMutation({mutationFn:async enabled=>{
  const {data:row,error}=await supabase.from('organization_report_email').update({enabled}).eq('restaurant_id',restaurantId).select('restaurant_id').single();
  if(error||!row)throw error||new Error('UPDATE_FAILED');
 },onSuccess:()=>client.invalidateQueries({queryKey}),onError:()=>toast.error(text.failed)});
 if(isError)return <p role="alert" className="mb-4 text-destructive">{text.load}</p>;
 if(!data)return null;
 return <Card className="mb-4 p-4">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div className="min-w-0"><h2 className="font-semibold">{text.title}</h2>
    <p className="text-sm text-muted-foreground">{text.detail}</p>
    <p className="mt-1 break-words text-sm">{text.recipient}: <span dir="ltr">{data.email}</span></p>
    <p className="text-sm">{data.enabled?text.active:text.paused}</p>
    {data.last_accepted_at&&<p className="text-xs text-muted-foreground">{text.accepted}: {data.last_report_date}</p>}
   </div>
   <Switch aria-label={text.toggle} checked={data.enabled} disabled={toggle.isPending} onCheckedChange={enabled=>toggle.mutate(enabled)}/>
  </div>
 </Card>;
}
