import React,{useEffect,useState} from 'react';
import {useMutation,useQuery} from '@tanstack/react-query';
import {AlertTriangle,ShieldAlert,Trash2,Loader2} from 'lucide-react';
import {platformOwnerApi} from '@/lib/platformOwnerApi';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Label} from '@/components/ui/label';
import {toast} from 'sonner';

const COPY={
  fa:{
    title:'حذف دائمی سازمان',lead:'این عملیات برگشت‌ناپذیر است. فقط سازمان بدون اسناد مالی و اطلاعات عملیاتی قابل حذف است.',
    warning:'شعبه‌ها، تنظیمات و دسترسی‌های سازمان خالی حذف می‌شوند. حساب کاربران مشترک، سوابق ممیزی پلتفرم و فایل‌های خارج از دیتابیس خودکار پاک نمی‌شوند.',
    loading:'در حال بررسی امن سازمان…',blocked:'حذف این سازمان فعلاً مجاز نیست؛ اطلاعات مرتبط وجود دارد.',
    blockers:'موارد مانع حذف',ready:'سازمان برای حذف دائمی آماده است.',
    branches:'شعبه‌های سازمان',type:'نام کامل سازمان را دقیقاً برای تأیید وارد کنید:',
    reason:'دلیل حذف (اختیاری، تا ۵۰۰ حرف)',confirm:'می‌دانم این حذف دائمی است و امکان بازیابی مستقیم وجود ندارد.',
    delete:'حذف دائمی سازمان',cancel:'انصراف',retry:'بررسی دوباره',error:'امکان تأیید امن حذف وجود ندارد.',
    success:'سازمان حذف شد.',failed:'عملیات حذف انجام نشد؛ اطلاعات سازمان حفظ شده است.',
    notFound:'سازمان دیگر وجود ندارد.',nameMismatch:'نام واردشده با نام سازمان مطابقت ندارد.',
    subscription:'اشتراک فعال یا قرارداد پرداخت وجود دارد',
  },
  ar:{
    title:'حذف المنظمة نهائياً',lead:'إجراء غير قابل للتراجع. الحذف متاح فقط للمنظمة الخالية من السجلات المالية والتشغيلية.',
    warning:'سيتم حذف الفروع والإعدادات والوصول الخاص بالمنظمة الفارغة. حسابات المستخدمين المشتركة وسجلات التدقيق والملفات خارج قاعدة البيانات لا تُحذف تلقائياً.',
    loading:'جارٍ فحص المنظمة…',blocked:'لا يمكن حذف المنظمة لوجود سجلات مرتبطة.',
    blockers:'السجلات المانعة للحذف',ready:'هذه المنظمة مؤهلة للحذف الدائم.',
    branches:'فروع المنظمة',type:'اكتب اسم المنظمة كاملاً للتأكيد:',
    reason:'سبب الحذف (اختياري، حتى ٥٠٠ حرف)',confirm:'أفهم أن هذا الحذف دائم ولا يمكن استرجاعه مباشرة.',
    delete:'حذف المنظمة نهائياً',cancel:'إلغاء',retry:'إعادة الفحص',error:'تعذر التحقق الآمن قبل الحذف.',
    success:'تم حذف المنظمة.',failed:'تعذر حذف المنظمة، بقيت بياناتها محفوظة.',
    notFound:'هذه المنظمة غير موجودة.',nameMismatch:'اسم المنظمة غير مطابق.',
    subscription:'اشتراك نشط أو التزام دفع قائم',
  },
  en:{
    title:'Permanently delete organization',lead:'This is irreversible. Only an organization without financial or operational records is eligible.',
    warning:'Empty-tenant branches, settings and memberships are removed. Shared user accounts, platform audit history and files outside the database are NOT automatically erased.',
    loading:'Checking organization safety…',blocked:'This organization cannot be deleted because protected records exist.',
    blockers:'Protected records preventing deletion',ready:'Organization is eligible for permanent deletion.',
    branches:'Organization branches',type:'Type the exact organization name to confirm:',
    reason:'Reason (optional, maximum 500 characters)',confirm:'I understand this is permanent and cannot be directly undone.',
    delete:'Permanently delete organization',cancel:'Cancel',retry:'Check again',error:'Unable to verify that deletion is safe.',
    success:'Organization permanently deleted.',failed:'Could not delete organization; its data was preserved.',
    notFound:'Organization not found.',nameMismatch:'Organization name does not match.',
    subscription:'Active subscription or provider billing obligation',
  },
};
export default function OrganizationDeleteDialog({item,lang='en',onClose,onDeleted}){
  const t=COPY[lang]||COPY.en;
  const [name,setName]=useState('');
  const [reason,setReason]=useState('');
  const [ack,setAck]=useState(false);
  const [serverBlockers,setServerBlockers]=useState(null);
  const [err,setErr]=useState('');
  const id=item?.id;
  useEffect(()=>{setName('');setReason('');setAck(false);setServerBlockers(null);setErr('');},[id]);
  const preview=useQuery({
    queryKey:['platform-owner','organization-delete-preflight',id],
    queryFn:()=>platformOwnerApi.organizationDeletionCheck(id),
    enabled:Boolean(id),retry:false,staleTime:0,refetchOnMount:'always',
  });
  const deletion=useMutation({
    mutationFn:()=>platformOwnerApi.deleteOrganization(id,name,reason),
    onSuccess:result=>{
      if(result?.deleted===true){
        toast.success(t.success);
        onDeleted?.(result);
        onClose();
      }else{
        setServerBlockers(result?.blockers||['not_found']);
        setErr(t.failed);
        preview.refetch();
      }
    },
    onError:error=>{
      setErr(error?.message||t.failed);
      preview.refetch();
    },
  });
  const available=preview.isSuccess&&preview.data?.found===true&&preview.data?.eligible===true;
  const blockers=serverBlockers||preview.data?.blockers||[];
  const named=(name===item?.name&&name.length>0);
  const ready=Boolean(available&&named&&ack&&!deletion.isPending&&reason.length<=500);
  const close=()=>{if(!deletion.isPending)onClose();};
  return <Dialog open={Boolean(item)} onOpenChange={open=>{if(!open)close();}}>
    <DialogContent dir={lang==='en'?'ltr':'rtl'}
      className="!w-[calc(100vw-1.5rem)] !max-w-lg min-w-0 max-h-[88dvh] overflow-x-hidden overflow-y-auto rounded-2xl p-4 sm:p-6">
      <DialogHeader className="pe-8">
        <DialogTitle className="flex items-center gap-2 text-base font-extrabold text-rose-800">
          <ShieldAlert className="h-5 w-5 shrink-0"/>{t.title}
        </DialogTitle>
        <DialogDescription className="text-sm leading-6">{t.lead}</DialogDescription>
      </DialogHeader>
      <div className="min-w-0 space-y-4">
        <div className="min-w-0 rounded-xl border bg-muted/30 p-3">
          <p dir="auto" className="break-words text-base font-extrabold">{item?.name}</p>
          <p dir="ltr" className="mt-1 break-all text-xs text-muted-foreground">{id}</p>
        </div>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-950">
          <AlertTriangle className="me-1 inline h-4 w-4"/>{t.warning}
        </p>
        {preview.isLoading&&<p role="status" className="text-sm">{t.loading}</p>}
        {preview.isError&&<div role="alert" className="space-y-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
          {t.error}<Button type="button" size="sm" variant="outline" onClick={()=>preview.refetch()}>{t.retry}</Button>
        </div>}
        {preview.isSuccess&&preview.data?.found===false&&
          <p role="alert" className="text-sm text-rose-700">{t.notFound}</p>}
        {preview.isSuccess&&preview.data?.found&&<div className="space-y-2">
          <p className={'text-sm font-bold '+(available?'text-emerald-700':'text-rose-700')}>
            {available?t.ready:t.blocked}
          </p>
          <p className="text-xs text-muted-foreground">{t.branches}: {preview.data.branch_count??0}</p>
          {!available&&blockers.length>0&&<div className="rounded-xl bg-rose-50 p-3 text-xs leading-6 text-rose-800">
            <p className="mb-1 font-bold">{t.blockers}</p>
            <ul className="list-inside list-disc break-all">
              {blockers.slice(0,15).map((block,i)=><li key={i}>{block==='active_or_provider_subscription'?t.subscription:block}</li>)}
            </ul>
          </div>}
        </div>}
        {available&&<>
          <div className="space-y-2">
            <Label htmlFor="org-delete-name">{t.type}</Label>
            <p dir="auto" className="break-words text-sm font-bold">{item?.name}</p>
            <Input id="org-delete-name" dir="auto" autoComplete="off"
              value={name} onChange={e=>{setName(e.target.value);setErr('');}}
              placeholder={item?.name||''} aria-invalid={name.length>0&&!named}/>
            {name.length>0&&!named&&<p className="text-xs text-rose-700">{t.nameMismatch}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="org-delete-reason">{t.reason}</Label>
            <Textarea id="org-delete-reason" dir="auto" maxLength={500}
              value={reason} onChange={e=>setReason(e.target.value)} rows={2}/>
          </div>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs leading-5">
            <input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}
              className="mt-1 shrink-0"/><span>{t.confirm}</span>
          </label>
        </>}
        {err&&<p role="alert" className="break-words text-xs text-rose-700">{err}</p>}
        <div className="flex min-w-0 flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={close} disabled={deletion.isPending} className="min-w-0 flex-1">{t.cancel}</Button>
          <Button type="button" variant="destructive" disabled={!ready} onClick={()=>deletion.mutate()}
            className="min-w-0 flex-1" aria-label={t.delete}>
            {deletion.isPending?<Loader2 className="me-2 h-4 w-4 animate-spin"/>:<Trash2 className="me-2 h-4 w-4"/>}
            {t.delete}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}