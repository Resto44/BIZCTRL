import React,{useMemo,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {base44} from '@/api/base44Client';
import {useTenant} from '@/lib/TenantContext';
import {useRole} from '@/lib/RoleContext';
import {useLanguage} from '@/lib/LanguageContext';
import {Card} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Badge} from '@/components/ui/badge';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Wallet,ShieldCheck,AlertTriangle,Receipt,RefreshCw,Plus,ArrowDownLeft,ArrowUpRight,Camera,Loader2} from 'lucide-react';
import {toast} from 'sonner';
import {format} from 'date-fns';
import {readSponsorOwnerRows,sponsorOwnerSummary,
  validateSponsorOwnerEntry,sponsorOwnerError,SPONSOR_OWNER_KIN} from '@/lib/sponsorOwnerBilateral';

const UI={
  fa:{
    title:'دادوگرفت سپانسر و مالک',help:'دفتر قرض و بازپرداخت دوطرفه، مستقل از پول فروشات رستورانت نزد کفیل',
    sponsorLent:'سپانسر به مالک قرض داد',ownerRepaid:'مالک به سپانسر بازپرداخت کرد',
    ownerLent:'مالک به سپانسر قرض داد',sponsorRepaid:'سپانسر به مالک بازپرداخت کرد',
    ownerOwes:'بدهی مالک به سپانسر',sponsorOwes:'بدهی سپانسر به مالک',
    currency:'واحد پول',allCurrencies:'انتخاب واحد پول',new:'ثبت دادوگرفت',date:'تاریخ',
    kind:'نوع معامله',amount:'مبلغ',account:'حساب خزانه مالک',
    accountHelp:'دریافت پول، موجودی حساب انتخاب‌شده را زیاد می‌کند؛ پرداخت پول از آن کم می‌کند.',
    notes:'توضیح / دلیل قرض',reference:'شماره سند / مرجع بانکی',proof:'رسید (اختیاری)',
    upload:'عکس یا فایل رسید',uploadFail:'آپلود رسید ناموفق شد.',saved:'معامله و حرکت خزانه با موفقیت ثبت شد.',
    posting:'در حال ثبت…',save:'ثبت نهایی',cancel:'لغو',loading:'دفتر دوطرفه بارگذاری می‌شود…',
    failed:'دفتر کامل قابل خواندن نیست؛ هیچ جمع ناقصی نمایش داده نمی‌شود.',retry:'تلاش دوباره',
    empty:'هنوز معامله مستقیمی ثبت نشده است.',status:'اسناد ثبت‌شده',posted:'قطعی',
    postedInfo:'فقط انتقال واقعی و انجام‌شده را ثبت کنید. این سند همراه با یک حرکت خزانه، غیرقابل ویرایش است.',
    separate:'انتقال فروشات شعبه از سپانسر به مالک را در بخش «تسویه کفیل» ثبت کنید؛ اینجا قرض شخصی را ثبت کنید.',
    kindError:'نوع معامله را انتخاب کنید.',amountError:'مبلغ مثبت با حداکثر دو رقم اعشار وارد کنید.',
    dateError:'تاریخ صحیح، نه در آینده، وارد کنید.',accountError:'حساب مالک را انتخاب کنید.',
    notesError:'متن توضیح یا مرجع بیش از حد طولانی است.',
    excess:'مبلغ بازپرداخت از بدهی ثبت‌شده بیشتر است.',funds:'موجودی حساب مالک برای پرداخت کافی نیست.',
    accountInvalid:'این حساب خزانه فعال و متعلق به مالک نیست.',permission:'اجازه ثبت معامله را ندارید.',
    duplicate:'این درخواست قبلاً با محتوای دیگر ثبت شده است.',saveFailed:'ثبت تأیید نشد؛ همین سند را دوباره تلاش کنید، سند تازه نسازید.',
    noAccount:'حساب فعال خزانه مالک پیدا نشد.',noCurrency:'واحد پول را انتخاب کنید.',
    audit:'ثبت‌شده در خزانه',noNet:'بدهی دو طرف به‌صورت خودکار با هم تهاتر نمی‌شود.',
    confirm:'تأیید می‌کنم این انتقال واقعاً انجام شده و نباید دوباره در خزانه ثبت شود.',
    count:'تعداد اسناد',directionIn:'دریافت',directionOut:'پرداخت'
  },
  ar:{
    title:'حساب المعاملات بين الكفيل والمالك',help:'دفتر قروض وسداد متبادل مستقل عن أموال مبيعات الفروع لدى الكفيل',
    sponsorLent:'سلفة الكفيل للمالك',ownerRepaid:'سداد المالك للكفيل',
    ownerLent:'سلفة المالك للكفيل',sponsorRepaid:'سداد الكفيل للمالك',
    ownerOwes:'المستحق للكفيل على المالك',sponsorOwes:'المستحق للمالك على الكفيل',
    currency:'العملة',allCurrencies:'اختر العملة',new:'إضافة معاملة',date:'التاريخ',
    kind:'نوع المعاملة',amount:'المبلغ',account:'حساب خزينة المالك',
    accountHelp:'المبالغ المستلمة تزيد رصيد الحساب المحدد والمدفوعة تنقصه.',
    notes:'السبب / الملاحظات',reference:'رقم التحويل / المرجع البنكي',proof:'إيصال (اختياري)',
    upload:'صورة / ملف إيصال',uploadFail:'تعذر رفع الإيصال.',saved:'تم ترحيل المعاملة وحركة الخزينة.',
    posting:'جارٍ الترحيل…',save:'ترحيل نهائي',cancel:'إلغاء',loading:'جارٍ تحميل دفتر المعاملات…',
    failed:'تعذر تحميل جميع قيود المعاملات؛ لم تُعرض إجماليات جزئية.',retry:'إعادة المحاولة',
    empty:'لا توجد معاملات مباشرة مسجلة بعد.',status:'قيود مسجلة',posted:'مرحل',
    postedInfo:'سجل التحويلات المنفذة فقط. القيد غير قابل للتعديل ويرتبط بحركة خزينة واحدة.',
    separate:'سجل تحويل مبيعات الفروع لدى الكفيل في تسويات الكفيل، لا كقرض شخصي.',
    kindError:'اختر نوع المعاملة.',amountError:'أدخل مبلغًا موجبًا حتى منزلتين عشريتين.',
    dateError:'أدخل تاريخًا صالحًا ليس في المستقبل.',accountError:'اختر حساب المالك.',
    notesError:'الملاحظات أو رقم المرجع طويل جدًا.',
    excess:'قيمة السداد تتجاوز الرصيد المستحق.',funds:'رصيد خزينة المالك غير كافٍ للصرف.',
    accountInvalid:'حساب الخزينة غير نشط أو ليس تابعًا للمالك.',permission:'ليست لديك صلاحية ترحيل القيد.',
    duplicate:'سبق استخدام هذا الطلب ببيانات مختلفة.',saveFailed:'تعذر تأكيد الترحيل؛ أعد محاولة نفس القيد دون إنشاء قيد آخر.',
    noAccount:'لا يوجد حساب خزينة نشط للمالك.',noCurrency:'اختر العملة.',
    audit:'مرتبط بالخزينة',noNet:'لا تُجرى مقاصة تلقائية بين ديون الطرفين.',
    confirm:'أؤكد أن التحويل تم فعلاً ولم يُسجل مسبقًا في الخزينة.',
    count:'عدد القيود',directionIn:'استلام',directionOut:'صرف'
  },
  en:{
    title:'Sponsor ↔ Owner Transactions',help:'Separate bilateral advances and repayments, not branch sales held by sponsor',
    sponsorLent:'Sponsor advanced to owner',ownerRepaid:'Owner repaid sponsor',
    ownerLent:'Owner advanced to sponsor',sponsorRepaid:'Sponsor repaid owner',
    ownerOwes:'Owner owes sponsor',sponsorOwes:'Sponsor owes owner',
    currency:'Currency',allCurrencies:'Choose currency',new:'Record transaction',date:'Date',
    kind:'Transaction type',amount:'Amount',account:'Owner Treasury account',
    accountHelp:'Incoming payments credit the selected Owner account; outgoing payments debit it.',
    notes:'Purpose / notes',reference:'Transfer reference',proof:'Receipt (optional)',
    upload:'Photo / proof file',uploadFail:'Unable to upload receipt.',saved:'Transaction and Treasury movement posted.',
    posting:'Posting…',save:'Post transaction',cancel:'Cancel',loading:'Loading complete bilateral ledger…',
    failed:'Cannot read complete bilateral ledger. Partial totals are hidden.',retry:'Retry',
    empty:'No bilateral transactions have been posted yet.',status:'Posted entries',posted:'Posted',
    postedInfo:'Post only payments already made. This immutable entry creates exactly one Treasury movement.',
    separate:'Branch sales collected by Sponsor belong in Sponsor Settlement, not this loan ledger.',
    kindError:'Select a transaction type.',amountError:'Enter a positive amount with up to two decimals.',
    dateError:'Choose a valid date that is not in the future.',accountError:'Select an Owner account.',
    notesError:'Note or reference is too long.',
    excess:'Repayment exceeds the outstanding principal.',funds:'Not enough funds in the selected Owner account.',
    accountInvalid:'Invalid or inactive Owner Treasury account.',permission:'Only an authorized owner can post this transaction.',
    duplicate:'The request was previously posted with other details.',saveFailed:'Could not confirm the posting; retry this exact request rather than creating another.',
    noAccount:'No active Owner Treasury account.',noCurrency:'Select a currency.',
    audit:'Linked to Treasury',noNet:'Claims owed by each party are never silently netted.',
    confirm:'I confirm this transfer really happened and has not already been recorded in Treasury.',
    count:'Entries',directionIn:'Money in',directionOut:'Money out'
  }
};
const KIND_KEYS=['sponsor_advance_to_owner','owner_repay_sponsor',
  'owner_advance_to_sponsor','sponsor_repay_owner'];
const labels={sponsor_advance_to_owner:'sponsorLent',owner_repay_sponsor:'ownerRepaid',
  owner_advance_to_sponsor:'ownerLent',sponsor_repay_owner:'sponsorRepaid'};
const blank=()=>({kind:'',date:format(new Date(),'yyyy-MM-dd'),amount:'',accountId:'',
  notes:'',reference:'',proofUrl:'',confirm:false});

export default function SponsorOwnerBilateralLedger(){
  const {lang}=useLanguage();
  const t=UI[lang]||UI.en;
  const {role}=useRole();
  const {activeRestaurantId}=useTenant();
  const qc=useQueryClient();
  const [currency,setCurrency]=useState('');
  const [form,setForm]=useState(blank);
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState('');
  const requestId=useRef(null);
  const postingLock=useRef(false);
  const owner=role==='owner';

  const {data:records=[],isLoading,isError,refetch}=useQuery({
    queryKey:['sponsor-owner-bilateral',activeRestaurantId],
    queryFn:()=>readSponsorOwnerRows(supabase,activeRestaurantId),
    enabled:owner&&Boolean(activeRestaurantId),staleTime:30000,retry:1
  });
  const {data:accounts=[],isLoading:accountLoading,isError:accountError}=useQuery({
    queryKey:['sponsor-owner-accounts',activeRestaurantId],
    queryFn:async()=>{
      const {data,error:readError}=await supabase.from('treasury_accounts')
        .select('id,account_name,account_type,branch_id,branch_key,legacy_wallet_key,is_active,currency')
        .eq('restaurant_id',activeRestaurantId).eq('is_active',true)
        .is('branch_id',null).is('branch_key',null).order('account_name');
      if(readError)throw readError;
      return (data||[]).filter(a=>!a.legacy_wallet_key||
        ['owner_cash','owner_network'].includes(a.legacy_wallet_key));
    },
    enabled:owner&&Boolean(activeRestaurantId),staleTime:30000,retry:1
  });
  const currencies=useMemo(()=>[...new Set([
    ...accounts.map(a=>a.currency),...records.map(r=>r.currency)
  ].filter(Boolean))].sort(),[accounts,records]);
  const currentCurrency=currencies.includes(currency)?currency:(currencies[0]||'');
  const availableAccounts=accounts.filter(a=>a.currency===currentCurrency);
  const summary=useMemo(()=>sponsorOwnerSummary(records,currentCurrency),[records,currentCurrency]);
  const scopedRecords=records.filter(r=>r.currency===currentCurrency);
  const fmt=(amount,curr=currentCurrency)=>{
    const n=Number(amount||0);
    return new Intl.NumberFormat(lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-US',{
      minimumFractionDigits:2,maximumFractionDigits:2
    }).format(n)+' '+(curr||'');
  };
  const edit=(k,v)=>{
    requestId.current=null;
    setError('');
    setForm(x=>({...x,[k]:v,confirm:k==='confirm'?v:false}));
  };
  const launch=()=>{
    setForm({...blank(),accountId:availableAccounts[0]?.id||''});
    setError('');requestId.current=null;setOpen(true);
  };
  const upload=async(event)=>{
    const file=event.target.files?.[0];if(!file)return;
    setUploading(true);
    try{
      const result=await base44.integrations.Core.UploadFile({file});
      if(!result?.file_url)throw Error('NO_PROOF_URL');
      edit('proofUrl',result.file_url);
    }catch{toast.error(t.uploadFail)}finally{setUploading(false)}
  };
  const post=async()=>{
    if(postingLock.current||busy||uploading)return;
    const code=validateSponsorOwnerEntry({
      kind:form.kind,amount:form.amount,date:form.date,accountId:form.accountId,
      notes:form.notes,reference:form.reference
    });
    if(code){setError(t[code+'Error']||t.saveFailed);return;}
    if(!form.confirm){setError(t.confirm);return;}
    const account=availableAccounts.find(a=>a.id===form.accountId);
    if(!owner||!activeRestaurantId||!account){setError(t.accountInvalid);return;}
    requestId.current ||= crypto.randomUUID();
    postingLock.current=true;setBusy(true);setError('');
    try{
      const numeric=String(form.amount).trim().replace(/[٠-٩۰-۹]/g,c=>{
        const cp=c.charCodeAt(0);return String(cp>=0x06F0?cp-0x06F0:cp-0x0660);
      });
      const {data,error:postError}=await supabase.rpc('erp_post_sponsor_owner_transaction',{
        p_restaurant_id:activeRestaurantId,
        p_owner_account_id:account.id,
        p_kind:form.kind,p_amount:Number(numeric),p_date:form.date,
        p_request_id:requestId.current,p_notes:form.notes.trim()||null,
        p_external_reference:form.reference.trim()||null,
        p_proof_url:form.proofUrl||null,
      });
      if(postError)throw postError;
      if(!data?.id||data.id!==requestId.current)throw Error('NO_POST_CONFIRMATION');
      await Promise.all([
        qc.invalidateQueries({queryKey:['sponsor-owner-bilateral',activeRestaurantId]}),
        qc.invalidateQueries({queryKey:['wallet_transactions']}),
        qc.invalidateQueries({queryKey:['treasury_owner_central_transactions']}),
        qc.invalidateQueries({queryKey:['treasury_accounts']}),
      ]);
      requestId.current=null;
      setOpen(false);setForm(blank());toast.success(t.saved);
    }catch(e){
      const msg=sponsorOwnerError(e,t);
      setError(msg);toast.error(msg);
    }finally{postingLock.current=false;setBusy(false)}
  };

  if(!owner)return null;
  if(isLoading||accountLoading)return <Card role="status" className="p-4 text-sm">{t.loading}</Card>;
  if(isError||accountError)return <Card role="alert" className="space-y-3 border-rose-300 p-4 text-sm text-rose-700">
    {t.failed}<Button type="button" onClick={()=>{refetch();qc.invalidateQueries({queryKey:['sponsor-owner-accounts',activeRestaurantId]})}} variant="outline">{t.retry}</Button>
  </Card>;

  const rtl=lang!=='en';
  return <section dir={rtl?'rtl':'ltr'} className="min-w-0 space-y-3 overflow-x-clip">
    <Card className="min-w-0 space-y-3 rounded-2xl border-indigo-200 p-3 sm:p-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-base font-extrabold"><Wallet className="h-5 w-5 text-indigo-600"/>{t.title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t.help}</p>
        </div>
        <Button type="button" size="sm" onClick={launch} disabled={!availableAccounts.length} className="w-full sm:w-auto">
          <Plus className="me-1 h-4 w-4"/>{t.new}
        </Button>
      </div>
      <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5"><ShieldCheck className="me-1 inline h-4 w-4"/>{t.separate}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-xs">{t.currency}</Label>
        <Select value={currentCurrency||undefined} onValueChange={setCurrency}>
          <SelectTrigger className="h-9 w-40 max-w-full"><SelectValue placeholder={t.noCurrency}/></SelectTrigger>
          <SelectContent>{currencies.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          {key:'ownerOwes',style:'border-amber-200 bg-amber-50 text-amber-900'},
          {key:'sponsorOwes',style:'border-blue-200 bg-blue-50 text-blue-900'},
        ].map(x=><div key={x.key} className={'min-w-0 rounded-xl border p-3 '+x.style}>
          <p className="text-xs font-bold leading-5">{t[x.key]}</p>
          <p dir="ltr" className="mt-2 break-all text-start text-lg font-extrabold tabular-nums">{fmt(summary[x.key])}</p>
        </div>)}
      </div>
      <p className="text-xs text-muted-foreground">{t.noNet}</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {[['sponsorLent','text-emerald-700'],['ownerRepaid','text-rose-700'],
          ['ownerLent','text-rose-700'],['sponsorRepaid','text-emerald-700']].map(([key,cls])=>
          <div key={key} className="min-w-0 rounded-lg border p-2">
            <p className="text-muted-foreground">{t[key]}</p><p dir="ltr" className={'mt-1 break-all text-start font-bold '+cls}>{fmt(summary[key])}</p>
          </div>)}
      </div>
      <div className="flex items-center justify-between text-xs font-semibold">
        <span>{t.status}</span><Badge variant="outline">{summary.count} {t.count}</Badge>
      </div>
      {scopedRecords.length===0?<p className="p-4 text-center text-xs text-muted-foreground">{t.empty}</p>:
        <div className="max-h-[580px] space-y-2 overflow-y-auto">{scopedRecords.map(r=>{
          const inward=SPONSOR_OWNER_KINDS[r.kind]?.direction==='in';
          return <div key={r.id} className="flex min-w-0 items-start justify-between gap-2 rounded-xl border p-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1 text-xs font-bold">
                {inward?<ArrowDownLeft className="h-4 w-4 text-emerald-600"/>:<ArrowUpRight className="h-4 w-4 text-rose-600"/>}
                {t[labels[r.kind]]||r.kind}<Badge variant="outline" className="text-[10px]">{t.posted}</Badge>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{r.effective_date} · {t.audit}</p>
              {r.external_reference&&<p dir="auto" className="mt-1 break-words text-[11px] text-muted-foreground">{r.external_reference}</p>}
              {r.notes&&<p dir="auto" className="mt-1 break-words text-[11px] text-muted-foreground">{r.notes}</p>}
            </div>
            <div dir="ltr" className={'shrink-0 text-end text-xs font-extrabold tabular-nums '+(inward?'text-emerald-700':'text-rose-700')}>
              {inward?'+':'−'}{fmt(r.amount,r.currency)}
            </div>
          </div>
        })}</div>}
    </Card>

    <Dialog open={open} onOpenChange={v=>{if(!v&&!busy){setOpen(false);setError('');requestId.current=null}}}>
      <DialogContent dir={rtl?'rtl':'ltr'} className="!w-[calc(100vw-1.5rem)] !max-w-md min-w-0 max-h-[88dvh] overflow-x-hidden overflow-y-auto rounded-2xl p-4">
        <DialogHeader className="pe-8"><DialogTitle className="text-base">{t.new}</DialogTitle></DialogHeader>
        <div className="min-w-0 space-y-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{t.postedInfo}</div>
          <div><Label className="text-xs">{t.kind} *</Label>
            <Select value={form.kind||undefined} onValueChange={v=>edit('kind',v)}>
              <SelectTrigger className="mt-1 min-w-0"><SelectValue placeholder={t.kind}/></SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">
                {KIND_KEYS.map(k=><SelectItem value={k} key={k}>{t[labels[k]]}</SelectItem>)}
              </SelectContent>
            </Select></div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0"><Label className="text-xs">{t.date} *</Label>
              <Input dir="ltr" type="date" className="mt-1 w-full min-w-0 max-w-full text-base [min-inline-size:0]"
                value={form.date} onChange={e=>edit('date',e.target.value)}/></div>
            <div className="min-w-0"><Label className="text-xs">{t.amount} *</Label>
              <Input dir="ltr" type="text" inputMode="decimal" className="mt-1 w-full min-w-0 max-w-full text-base"
                value={form.amount} onChange={e=>edit('amount',e.target.value)} placeholder="0.00"/></div>
          </div>
          <div><Label className="text-xs">{t.account} * ({currentCurrency})</Label>
            <Select value={form.accountId||undefined} onValueChange={v=>edit('accountId',v)}>
              <SelectTrigger className="mt-1 min-w-0"><SelectValue placeholder={t.account}/></SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">
                {availableAccounts.map(a=><SelectItem value={a.id} key={a.id}>{a.account_name} · {a.currency}</SelectItem>)}
              </SelectContent>
            </Select><p className="mt-1 text-xs text-muted-foreground">{t.accountHelp}</p></div>
          <div><Label className="text-xs">{t.reference}</Label>
            <Input dir="auto" className="mt-1 min-w-0" value={form.reference} onChange={e=>edit('reference',e.target.value)}/></div>
          <div><Label className="text-xs">{t.notes}</Label>
            <Input dir="auto" className="mt-1 min-w-0" value={form.notes} onChange={e=>edit('notes',e.target.value)}/></div>
          <div><Label className="block text-xs">{t.proof}</Label>
            <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed p-3 text-xs">
              {uploading?<Loader2 className="h-4 w-4 animate-spin"/>:<Camera className="h-4 w-4"/>}
              {form.proofUrl?t.audit:t.upload}
              <input type="file" accept="image/*,.pdf" className="hidden" disabled={uploading} onChange={upload}/>
            </label></div>
          <label className="flex items-start gap-2 rounded-lg border p-3 text-xs leading-5">
            <input type="checkbox" checked={form.confirm} onChange={e=>edit('confirm',e.target.checked)} className="mt-1"/>
            <span>{t.confirm}</span>
          </label>
          {error&&<p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
          <div className="sticky bottom-0 z-10 flex gap-2 border-t bg-background pt-3">
            <Button type="button" className="min-w-0 flex-1" disabled={busy||uploading||!form.confirm} onClick={post}>
              {busy?<Loader2 className="me-1 h-4 w-4 animate-spin"/>:<Receipt className="me-1 h-4 w-4"/>}
              {busy?t.posting:t.save}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={()=>setOpen(false)} className="min-w-0 flex-1">{t.cancel}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}
