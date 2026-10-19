import {partnerRows} from '@/lib/partnerTreasury';
import {peopleText} from '@/lib/peopleAccounts';
import WalletPersonCustodyCards from './WalletPersonCustodyCards';
import React,{useEffect,useMemo,useRef,useState} from 'react';
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
import {Wallet,ShieldCheck,Receipt,Plus,ArrowDownLeft,ArrowUpRight,Camera,Loader2,Building2,Coins,BookOpen,CheckCircle2,CalendarDays,CreditCard} from 'lucide-react';
import {toast} from 'sonner';
import {format} from 'date-fns';
import {readSponsorOwnerRows,sponsorOwnerSummary,
  validateSponsorOwnerEntry,sponsorOwnerError,SPONSOR_OWNER_KINDS,sponsorOwnerAccountMethod} from '@/lib/sponsorOwnerBilateral';

const UI={
  fa:{
    method:'روش پرداخت / دریافت',cash:'کاش / نقدی',network:'شبکه / بانک',unknownMethod:'روش ثبت نشده',repaymentBalance:'حداکثر بازپرداخت بر اساس بدهی ثبت‌شده',repaymentHelp:'اگر این پول قرض جدید است، نوع «قرض داد» را انتخاب کنید؛ بازپرداخت فقط برای بدهی قبلی است.',noMethodAccount:'برای این روش و واحد پول، حساب فعال خزانه وجود ندارد.',
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
    duplicate:'این درخواست قبلاً با محتوای دیگر ثبت شده است.',custodyDuplicate:'این شماره حواله قبلاً در تسویه پول شعبه نزد کفیل ثبت شده است؛ آن را قرض شخصی ثبت نکنید.',saveFailed:'ثبت تأیید نشد؛ همین سند را دوباره تلاش کنید، سند تازه نسازید.',
    noAccount:'حساب فعال خزانه مالک پیدا نشد.',noCurrency:'واحد پول را انتخاب کنید.',
    audit:'ثبت‌شده در خزانه',noNet:'بدهی دو طرف به‌صورت خودکار با هم تهاتر نمی‌شود.',
    confirm:'تأیید می‌کنم این انتقال واقعاً انجام شده و نباید دوباره در خزانه ثبت شود.',
    count:'تعداد اسناد',directionIn:'دریافت',directionOut:'پرداخت'
  },
  ar:{
    method:'طريقة الدفع / الاستلام',cash:'نقدي',network:'شبكة / بنك',unknownMethod:'الطريقة غير مسجلة',repaymentBalance:'الحد المتاح للسداد حسب الدين المسجل',repaymentHelp:'إذا كان المبلغ سلفة جديدة فاختر نوع السلفة؛ السداد يتطلب دينًا سابقًا.',noMethodAccount:'لا يوجد حساب خزينة نشط لهذه الطريقة والعملة.',
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
    duplicate:'سبق استخدام هذا الطلب ببيانات مختلفة.',custodyDuplicate:'رقم الحوالة مسجل في تسويات مبيعات الفروع مع الكفيل؛ لا تسجله قرضًا شخصيًا.',saveFailed:'تعذر تأكيد الترحيل؛ أعد محاولة نفس القيد دون إنشاء قيد آخر.',
    noAccount:'لا يوجد حساب خزينة نشط للمالك.',noCurrency:'اختر العملة.',
    audit:'مرتبط بالخزينة',noNet:'لا تُجرى مقاصة تلقائية بين ديون الطرفين.',
    confirm:'أؤكد أن التحويل تم فعلاً ولم يُسجل مسبقًا في الخزينة.',
    count:'عدد القيود',directionIn:'استلام',directionOut:'صرف'
  },
  en:{
    method:'Payment / receipt method',cash:'Cash',network:'Network / bank',unknownMethod:'Method not recorded',repaymentBalance:'Available repayment against recorded debt',repaymentHelp:'For a new advance, select an advance transaction type. Repayment requires an existing debt.',noMethodAccount:'No active treasury account for this method and currency.',
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
    duplicate:'The request was previously posted with other details.',custodyDuplicate:'This transfer reference is already approved in the branch Sponsor settlement ledger; do not also post it as a personal loan.',saveFailed:'Could not confirm the posting; retry this exact request rather than creating another.',
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
const blank=()=>({kind:'',date:format(new Date(),'yyyy-MM-dd'),amount:'',accountId:'',paymentMethod:'cash',
  notes:'',reference:'',proofUrl:'',confirm:false});

export default function SponsorOwnerBilateralLedger({partner=null,legacyOnly=true,openTransactionSignal=0}){
  const {lang,currency:appCurrency}=useLanguage();
  const base=UI[lang]||UI.en;
  const pt=peopleText(lang);
  const t=partner?{...base,title:partner.name,help:pt.help,ownerOwes:pt.ownerOwes,sponsorOwes:pt.partnerOwes,
    sponsorLent:pt.sponsor_advance_to_owner,ownerRepaid:pt.owner_repay_sponsor,
    ownerLent:pt.owner_advance_to_sponsor,sponsorRepaid:pt.sponsor_repay_owner}:base;
  const {role}=useRole();
  const {activeRestaurantId}=useTenant();
  const qc=useQueryClient();
  const [currency,setCurrency]=useState(appCurrency||'');
  const [form,setForm]=useState(blank);
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState('');
  const requestId=useRef(null);
  const postingLock=useRef(false);
  const owner=role==='owner';

  const {data:allRecords=[],isLoading,isError,refetch}=useQuery({
    queryKey:['sponsor-owner-bilateral',activeRestaurantId],
    queryFn:()=>readSponsorOwnerRows(supabase,activeRestaurantId),
    enabled:owner&&Boolean(activeRestaurantId),staleTime:30000,retry:1,refetchInterval:15000
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
  const records=useMemo(()=>partner||legacyOnly?partnerRows(allRecords,partner?.id):allRecords,[allRecords,partner,legacyOnly]);
  const currencies=useMemo(()=>[...new Set([
    ...accounts.map(a=>a.currency),...records.map(r=>r.currency)
  ].filter(Boolean))].sort(),[accounts,records]);
  const currentCurrency=currencies.includes(currency)?currency:(currencies[0]||'');
  const availableAccounts=accounts.filter(a=>a.currency===currentCurrency);
  const methodAccounts=availableAccounts.filter(a=>sponsorOwnerAccountMethod(a)===form.paymentMethod);
  const summary=useMemo(()=>sponsorOwnerSummary(records,currentCurrency),[records,currentCurrency]);
  const repaymentDue=form.kind==='owner_repay_sponsor'?summary.ownerOwes:form.kind==='sponsor_repay_owner'?summary.sponsorOwes:null;
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
    const account=availableAccounts[0];
    setForm({...blank(),accountId:account?.id||'',paymentMethod:sponsorOwnerAccountMethod(account)||'cash'});
    setError('');requestId.current=null;setOpen(true);
  };
  const lastOpenSignal=useRef(0);
  useEffect(()=>{
    if(openTransactionSignal>0 && openTransactionSignal!==lastOpenSignal.current
       && !isLoading && !accountLoading && !isError && !accountError){
      lastOpenSignal.current=openTransactionSignal;
      if(availableAccounts.length && (!partner || (partner.is_active && partner.allow_loans!==false))) launch();
    }
  },[openTransactionSignal,isLoading,accountLoading,isError,accountError,availableAccounts.length,partner?.id]);
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
    if((partner&&(!partner.is_active||partner.allow_loans===false))||!owner||!activeRestaurantId||!account||sponsorOwnerAccountMethod(account)!==form.paymentMethod){setError(t.accountInvalid);return;}
    requestId.current ||= crypto.randomUUID();
    postingLock.current=true;setBusy(true);setError('');
    try{
      const numeric=String(form.amount).trim().replace(/[٠-٩۰-۹]/g,c=>{
        const cp=c.charCodeAt(0);return String(cp>=0x06F0?cp-0x06F0:cp-0x0660);
      });
      const {data,error:postError}=await supabase.rpc(partner?'erp_post_partner_transaction':'erp_post_sponsor_owner_transaction',{
        ...(partner?{p_partner_id:partner.id}:{}),
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
    <Card className="min-w-0 space-y-5 rounded-[24px] border-slate-200 bg-white p-3.5 shadow-sm sm:p-6">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600 sm:size-14"><Wallet className="size-7"/></span>
          <div className="min-w-0">
            <h3 className="break-words text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{partner?pt.title:t.title}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm">{partner?.name?partner.name+' · ':''}{t.help}</p>
          </div>
        </div>
        <Button type="button" onClick={launch} disabled={!availableAccounts.length||(partner&&(!partner.is_active||partner.allow_loans===false))} className="min-h-11 w-full gap-2 rounded-xl bg-blue-600 font-bold hover:bg-blue-700 sm:w-auto">
          <Plus className="size-4"/>{t.new}
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
        <p className="flex min-w-0 items-center gap-1.5 text-xs leading-5 text-slate-600">
          <ShieldCheck className="size-4 shrink-0 text-blue-600"/>{t.noNet}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Label className="text-xs font-semibold text-slate-600">{t.currency}</Label>
          <Select value={currentCurrency||undefined} onValueChange={setCurrency}>
            <SelectTrigger className="h-11 w-32 rounded-xl bg-white font-extrabold text-slate-950">
              <SelectValue placeholder={t.noCurrency}/>
            </SelectTrigger>
            <SelectContent>{currencies.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3" aria-label={t.title}>
        {[
          {key:'ownerOwes',icon:Coins,style:'border-amber-200 bg-amber-50/90 text-amber-900',iconStyle:'bg-amber-100 text-amber-700'},
          {key:'sponsorOwes',icon:Building2,style:'border-blue-200 bg-blue-50/90 text-blue-900',iconStyle:'bg-blue-100 text-blue-700'},
        ].map(x=><article key={x.key} className={'min-w-0 rounded-2xl border p-3.5 sm:p-5 '+x.style}>
          <div className="flex items-start gap-2"><span className={'grid size-10 shrink-0 place-items-center rounded-xl '+x.iconStyle}><x.icon className="size-5"/></span>
            <p className="min-w-0 text-xs font-extrabold leading-5 sm:text-sm">{t[x.key]}</p></div>
          <p dir="ltr" className="mt-3 break-words text-start text-xl font-black tabular-nums sm:text-2xl">{currentCurrency?fmt(summary[x.key]):'—'}</p>
        </article>)}
        {partner&&<WalletPersonCustodyCards partner={partner} currency={currentCurrency} lang={lang}/>}
      </div>
    </Card>
    <Card className="min-w-0 space-y-3 rounded-[24px] border-slate-200 bg-white p-3.5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><BookOpen className="size-5"/></span>
        <div className="min-w-0"><h3 className="text-base font-black text-slate-950 sm:text-lg">{lang==='fa'?'جزئیات مانده‌ها':lang==='ar'?'تفاصيل الأرصدة':'Detailed balances'}</h3>
        <p className="text-xs leading-5 text-slate-500">{t.noNet}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {[
          {key:'sponsorLent',icon:ArrowDownLeft,color:'text-emerald-700',bg:'bg-emerald-50'},
          {key:'ownerRepaid',icon:ArrowUpRight,color:'text-rose-700',bg:'bg-rose-50'},
          {key:'ownerLent',icon:ArrowUpRight,color:'text-rose-700',bg:'bg-rose-50'},
          {key:'sponsorRepaid',icon:ArrowDownLeft,color:'text-emerald-700',bg:'bg-emerald-50'},
        ].map(x=><div key={x.key} className="min-w-0 rounded-2xl border border-slate-200 p-3 sm:p-4">
          <div className="flex items-start gap-2">
            <span className={'grid size-9 shrink-0 place-items-center rounded-xl '+x.bg+' '+x.color}><x.icon className="size-5"/></span>
            <p className="min-w-0 text-xs font-semibold leading-5 text-slate-600 sm:text-sm">{t[x.key]}</p>
          </div>
          <p dir="ltr" className={'mt-2 break-words text-start text-base font-black tabular-nums sm:text-xl '+x.color}>{currentCurrency?fmt(summary[x.key]):'—'}</p>
        </div>)}
      </div>
    </Card>
    <Card className="min-w-0 space-y-4 rounded-[24px] border-slate-200 bg-white p-3.5 shadow-sm sm:p-6">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 text-base font-black text-slate-950 sm:text-lg">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Receipt className="size-5"/></span>{t.status}
        </h3>
        <Badge variant="outline" className="rounded-xl px-3 py-1.5 text-sm font-bold">{summary.count} {t.count}</Badge>
      </div>
      {scopedRecords.length===0?<p className="rounded-xl border bg-slate-50 p-6 text-center text-sm text-slate-600">{t.empty}</p>:
        <div className="max-h-[720px] space-y-3 overflow-y-auto overscroll-contain">{scopedRecords.map(r=>{
          const inward=SPONSOR_OWNER_KINDS[r.kind]?.direction==='in';
          const postedColor=inward?'text-emerald-700':'text-rose-700';
          return <article key={r.id} className="min-w-0 rounded-2xl border border-slate-200 p-3.5 sm:p-5">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <span className={'grid size-11 shrink-0 place-items-center rounded-full '+(inward?'bg-emerald-50 text-emerald-700':'bg-rose-50 text-rose-700')}>
                  {inward?<ArrowDownLeft className="size-5"/>:<ArrowUpRight className="size-5"/>}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-black leading-6 text-slate-950">
                    {t[labels[r.kind]]||r.kind}
                    <Badge className="border border-blue-100 bg-blue-50 text-xs font-bold text-blue-700 hover:bg-blue-50">{t.posted}</Badge>
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <CalendarDays className="size-3.5"/>{r.effective_date}
                    <span className="mx-1">·</span><BookOpen className="size-3.5"/>{t.audit}
                  </p>
                  <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold leading-5 text-slate-600">
                    <CreditCard className="mt-0.5 size-3.5 shrink-0"/>{t.method}: {['cash','network'].includes(r.wallet_transaction?.payment_method)?t[r.wallet_transaction.payment_method]:t.unknownMethod}
                  </p>
                  {r.external_reference&&<p dir="auto" className="mt-2 break-words text-xs text-slate-500">{r.external_reference}</p>}
                  {r.notes&&<p dir="auto" className="mt-2 break-words text-xs text-slate-500">{r.notes}</p>}
                  {partner&&(r.partner_confirmation?.confirmed_at||r.partner_confirmation?.[0]?.confirmed_at)&&<p className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="size-4"/>{pt.confirmed}</p>}
                </div>
              </div>
              <strong dir="ltr" className={'shrink-0 text-end text-base font-black tabular-nums sm:text-lg '+postedColor}>
                {inward?'+':'−'}{fmt(r.amount,r.currency)}
              </strong>
            </div>
          </article>
        })}</div>}
    </Card>

    <Dialog open={open} onOpenChange={v=>{if(!v&&!busy){setOpen(false);setError('');requestId.current=null}}}>
      <DialogContent dir={rtl?'rtl':'ltr'} className="!flex !w-[calc(100vw-1.5rem)] !max-w-md min-w-0 max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="shrink-0 p-4 pe-12"><DialogTitle className="text-base">{t.new}</DialogTitle></DialogHeader>
        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3.5">
           <p className="text-xs font-bold text-slate-600">{lang==='fa'?'حساب انتخاب‌شده':lang==='ar'?'الحساب المحدد':'Selected account'}</p>
           <p className="mt-1 text-base font-black text-slate-950">{partner?.name||t.title}</p>
           <p className="mt-1 text-xs text-blue-800">{t.noNet}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{t.postedInfo}</div>
          <div><Label className="text-xs">{t.kind} *</Label>
           <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label={t.kind}>{KIND_KEYS.map((k,i)=>{
             const Icon=i===0||i===3?ArrowDownLeft:ArrowUpRight;
             return <button key={k} type="button" disabled={busy} aria-pressed={form.kind===k} onClick={()=>edit('kind',k)} className={`min-h-[76px] rounded-xl border p-2.5 text-start transition-colors ${form.kind===k?'border-blue-600 bg-blue-50 text-blue-800 ring-1 ring-blue-600':'border-slate-200 bg-white text-slate-700'}`}>
               <Icon className={`mb-1 size-5 ${i===0||i===3?'text-emerald-600':'text-rose-600'}`}/><span className="text-xs font-extrabold leading-5">{t[labels[k]]}</span>
             </button>;
           })}</div></div>
          {repaymentDue!==null&&<div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><p>{t.repaymentBalance}: <strong dir="ltr">{fmt(repaymentDue)}</strong></p><p className="mt-1">{t.repaymentHelp}</p></div>}
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0"><Label className="text-xs">{t.date} *</Label>
              <Input dir="ltr" type="date" className="mt-1 w-full min-w-0 max-w-full text-base [min-inline-size:0]"
                value={form.date} onChange={e=>edit('date',e.target.value)}/></div>
            <div className="min-w-0"><Label className="text-xs">{t.amount} *</Label>
              <Input dir="ltr" type="text" inputMode="decimal" className="mt-1 w-full min-w-0 max-w-full text-base"
                value={form.amount} onChange={e=>edit('amount',e.target.value)} placeholder="0.00"/></div>
          </div>
          <div><Label className="text-xs">{t.method} *</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {['cash','network'].map(method=><Button key={method} type="button" variant={form.paymentMethod===method?'default':'outline'}
                aria-pressed={form.paymentMethod===method} disabled={busy} onClick={()=>{
                  requestId.current=null;setError('');
                  setForm(previous=>({...previous,paymentMethod:method,accountId:availableAccounts.find(a=>sponsorOwnerAccountMethod(a)===method)?.id||'',confirm:false}));
                }}>{t[method]}</Button>)}
            </div>
            {!methodAccounts.length&&<p role="status" className="mt-2 text-xs text-amber-700">{t.noMethodAccount}</p>}
          </div>
          <div><Label className="text-xs">{t.account} * ({currentCurrency})</Label>
            <Select value={form.accountId||undefined} onValueChange={v=>edit('accountId',v)}>
              <SelectTrigger className="mt-1 min-w-0"><SelectValue placeholder={t.account}/></SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)]">
                {methodAccounts.map(a=><SelectItem value={a.id} key={a.id}>{a.account_name} · {a.currency}</SelectItem>)}
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
        </div>
        <div className="shrink-0 space-y-2 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-xs leading-5">
            <input type="checkbox" checked={form.confirm} onChange={e=>edit('confirm',e.target.checked)} className="mt-1 h-5 w-5 shrink-0" disabled={busy}/>
            <span>{t.confirm}</span>
          </label>
          {error&&<p role="alert" className="max-h-24 overflow-y-auto rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" className="min-w-0 flex-1" disabled={busy||uploading||!form.confirm||!methodAccounts.some(a=>a.id===form.accountId)} onClick={post}>
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
