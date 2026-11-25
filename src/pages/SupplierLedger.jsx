import React, {useMemo, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {useLanguage} from '@/lib/LanguageContext';
import {useTenant} from '@/lib/TenantContext';
import {buildSupplierLedger} from '@/lib/supplierLedger';
import {fetchSupplierLedger} from '@/lib/supplierLedgerData';
import {settlementPeriodRange} from '@/lib/treasurySettlementPeriods';
import PortalDataState from '@/components/shared/PortalDataState';
import {Card} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {BookOpen,RefreshCw,ReceiptText,Wallet,ChevronRight} from 'lucide-react';

const COPY = {
 en:{unapproved_invoice:'Invoice awaiting approval — excluded from posted balance',title:'Supplier Ledger',subtitle:'Invoices, recorded payments and reconciliation',branch:'Branch',allBranches:'All branches',supplier:'Supplier',allSuppliers:'All suppliers',currency:'Currency',unknown:'Unspecified currency',period:'Period',all:'All history',today:'Today',week:'Last 7 days',month:'This month','3months':'3 months','6months':'6 months',year:'This year',custom:'Custom',from:'From',to:'To',opening:'Opening balance',invoiced:'Period invoices',paid:'Recorded payments',closing:'Closing ledger balance',overdue:'Overdue invoices as of end date',statement:'Statement',invoices:'Invoices',payments:'Payments',date:'Date',description:'Description',amount:'Amount',balance:'Balance',invoice:'Invoice',payment:'Payment',empty:'No records in this period',search:'Search supplier, invoice or reference',searchNote:'Search only narrows visible rows. Totals and running balances keep the complete selected account scope.',refresh:'Refresh',more:'Show more',review:'Reconciliation required',reviewNote:'Some records need review. No automatic corrections or extra payments have been added.',identity:'Select an organization and an assigned branch.',range:'Start date must not be after end date.',due:'Due',remaining:'Remaining from linked payments',credit:'A negative closing balance is a supplier credit.',basis:'Opening + period invoices − recorded payments = closing. Each currency is separate; no conversion.',invalid_invoice:'Invalid invoice date or amount',invalid_payment:'Invalid payment date or amount',payment_mismatch:'Invoice paid amount differs from payment records',unmatched_payment:'Unlinked or inconsistent payment',unknown_currency:'Currency cannot be confirmed',duplicate_invoice_number:'Repeated invoice number',duplicate_or_missing_id:'Repeated or missing record ID'},
 fa:{unapproved_invoice:'فاکتور منتظر تأیید — از ماندهٔ قطعی خارج است',title:'دفتر حساب تأمین‌کننده',subtitle:'فاکتورها، پرداخت‌های ثبت‌شده و تطبیق حساب',branch:'شعبه',allBranches:'تمام شعبه‌ها',supplier:'تأمین‌کننده',allSuppliers:'تمام تأمین‌کنندگان',currency:'ارز',unknown:'ارز نامشخص',period:'دوره',all:'تمام سوابق',today:'امروز',week:'۷ روز اخیر',month:'این ماه','3months':'۳ ماه','6months':'۶ ماه',year:'امسال',custom:'دلخواه',from:'از',to:'تا',opening:'ماندهٔ اول دوره',invoiced:'فاکتورهای دوره',paid:'پرداخت‌های ثبت‌شده',closing:'ماندهٔ پایان دفتر',overdue:'فاکتورهای سررسیدگذشته تا پایان دوره',statement:'صورت‌حساب',invoices:'فاکتورها',payments:'پرداخت‌ها',date:'تاریخ',description:'شرح',amount:'مبلغ',balance:'مانده',invoice:'فاکتور',payment:'پرداخت',empty:'در این دوره سابقه‌ای نیست',search:'جست‌وجوی تأمین‌کننده، فاکتور یا مرجع',searchNote:'جست‌وجو فقط ردیف‌های نمایان را محدود می‌کند. مجموع‌ها و مانده، کل حساب انتخاب‌شده را حفظ می‌کنند.',refresh:'تازه‌سازی',more:'نمایش بیشتر',review:'نیاز به تطبیق حساب',reviewNote:'بعضی سوابق نیاز به بررسی دارند. اصلاح خودکار یا پرداخت اضافی ساخته نشده است.',identity:'سازمان و شعبهٔ مربوط را انتخاب کنید.',range:'تاریخ شروع نباید بعد از پایان باشد.',due:'سررسید',remaining:'مانده بر اساس پرداخت‌های مرتبط',credit:'ماندهٔ منفی یعنی اعتبار نزد تأمین‌کننده.',basis:'ماندهٔ اول + فاکتورهای دوره − پرداخت‌های ثبت‌شده = ماندهٔ پایان. ارزها جدا هستند؛ تبدیل ارز انجام نشده.',invalid_invoice:'تاریخ یا مبلغ نامعتبر فاکتور',invalid_payment:'تاریخ یا مبلغ نامعتبر پرداخت',payment_mismatch:'مبلغ پرداخت‌شدهٔ فاکتور با سوابق پرداخت فرق دارد',unmatched_payment:'پرداخت بدون ارتباط معتبر',unknown_currency:'ارز قابل تأیید نیست',duplicate_invoice_number:'شمارهٔ تکراری فاکتور',duplicate_or_missing_id:'شناسهٔ تکراری یا ناموجود'},
 ar:{unapproved_invoice:'فاتورة بانتظار الموافقة — مستبعدة من الرصيد المرحّل',title:'كشف حساب المورد',subtitle:'الفواتير والمدفوعات المسجلة ومطابقة الحساب',branch:'الفرع',allBranches:'كل الفروع',supplier:'المورد',allSuppliers:'كل الموردين',currency:'العملة',unknown:'عملة غير محددة',period:'الفترة',all:'كل السجلات',today:'اليوم',week:'آخر ٧ أيام',month:'هذا الشهر','3months':'٣ أشهر','6months':'٦ أشهر',year:'هذه السنة',custom:'مخصص',from:'من',to:'إلى',opening:'الرصيد الافتتاحي',invoiced:'فواتير الفترة',paid:'المدفوعات المسجلة',closing:'الرصيد الختامي للدفتر',overdue:'الفواتير المتأخرة حتى نهاية الفترة',statement:'كشف الحساب',invoices:'الفواتير',payments:'المدفوعات',date:'التاريخ',description:'الوصف',amount:'المبلغ',balance:'الرصيد',invoice:'فاتورة',payment:'دفعة',empty:'لا توجد سجلات في هذه الفترة',search:'ابحث عن مورد أو فاتورة أو مرجع',searchNote:'البحث يحدد الصفوف المعروضة فقط. الإجماليات والأرصدة تشمل كامل نطاق الحساب المحدد.',refresh:'تحديث',more:'عرض المزيد',review:'تحتاج مطابقة',reviewNote:'بعض السجلات تحتاج مراجعة. لم تُنشأ تصحيحات تلقائية أو دفعات إضافية.',identity:'اختر المنشأة والفرع المعين.',range:'تاريخ البداية يجب ألا يتجاوز النهاية.',due:'الاستحقاق',remaining:'المتبقي حسب الدفعات المرتبطة',credit:'الرصيد السالب يعني رصيداً دائناً لدى المورد.',basis:'الرصيد الافتتاحي + فواتير الفترة − المدفوعات المسجلة = الرصيد الختامي. العملات منفصلة دون تحويل.',invalid_invoice:'تاريخ أو مبلغ فاتورة غير صالح',invalid_payment:'تاريخ أو مبلغ دفعة غير صالح',payment_mismatch:'المبلغ المدفوع بالفاتورة يختلف عن سجلات الدفع',unmatched_payment:'دفعة غير مرتبطة أو غير متطابقة',unknown_currency:'تعذر تأكيد العملة',duplicate_invoice_number:'رقم فاتورة مكرر',duplicate_or_missing_id:'معرف سجل مكرر أو مفقود'},
};
function Filter({label,value,onChange,children}) {
 return <label className="min-w-0 text-xs text-muted-foreground">{label}<select aria-label={label} value={value} onChange={e=>onChange(e.target.value)} className="mt-1 block h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground">{children}</select></label>;
}
export default function SupplierLedger({supplier = null, onPayInvoice, onOpenInvoice}) {
 const {lang='en',currency:preferredCurrency} = useLanguage();
 const t=COPY[lang] || COPY.en;
 const {activeRestaurant,activeRestaurantId,branches=[],isBranchScoped,isManager,managerBranchObject,loadingRestaurants}=useTenant();
 const restaurantId=activeRestaurantId || activeRestaurant?.id;
 const restricted=isBranchScoped || isManager;
 const [branchId,setBranchId]=useState('all');
 const [selectedSupplierId,setSupplierId]=useState('all');
 const supplierId=supplier?.id || selectedSupplierId;
 const [currency,setCurrency]=useState('');
 const [period,setPeriod]=useState('all');
 const [custom,setCustom]=useState({start:'',end:''});
 const [search,setSearch]=useState('');
 const [limit,setLimit]=useState(50);
 const [view,setView]=useState('statement');
 const ux=(en,ar,fa)=>lang==='fa'?fa:lang==='ar'?ar:en;
 const assigned=restricted ? managerBranchObject : null;
 const query=useQuery({queryKey:['supplier-ledger',restaurantId,restricted,assigned?.id,assigned?.key],queryFn:()=>fetchSupplierLedger(supabase,{restaurantId,branch:assigned}),enabled:Boolean(restaurantId && (!restricted || assigned?.id)),refetchInterval:60000});
 const data=query.data || {invoices:[],payments:[],suppliers:[]};
 const branch=assigned || (branchId==='all'?null:branches.find(b=>b.id===branchId) || {id:branchId});
 const range=period==='custom'?custom:settlementPeriodRange(period);
 const invalidRange=period==='custom' && (!range.start || !range.end || range.start>range.end);
 const ledger=useMemo(()=>buildSupplierLedger({...data,branch,supplierId,...range}),[data,branch,supplierId,range.start,range.end]);
 const selectedCurrency=ledger.groups.some(g=>g.currency===currency)?currency:(ledger.groups.find(g=>g.currency===preferredCurrency)?.currency || ledger.groups[0]?.currency || preferredCurrency || 'UNKNOWN');
 const group=ledger.groups.find(g=>g.currency===selectedCurrency) || {opening:0,invoiced:0,paid:0,closing:0,rows:[],invoices:[],payments:[],overdue:[]};
 const money=value=>`${selectedCurrency==='UNKNOWN'?t.unknown:selectedCurrency} ${Number(value).toLocaleString(lang==='fa'?'fa-IR':lang==='ar'?'ar-SA':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
 const supplierOptions=new Map(data.suppliers.map(s=>[s.id,s.name]));
 for(const row of [...data.invoices,...data.payments])if(row.supplier_id&&!supplierOptions.has(row.supplier_id))supplierOptions.set(row.supplier_id,row.supplier_name || row.supplier_id);
 const invoicesById=new Map(data.invoices.map(row=>[row.id,row]));
 const branchNames=new Map(branches.map(row=>[row.id,row.name||row.label||row.key]));
 const invoiceRef=row=>row.invoice_number || invoicesById.get(row.invoice_id)?.invoice_number || row.invoice_id || row.id;
 const supplierName=row=>row.supplier_name || supplierOptions.get(row.supplier_id) || row.supplier_id || '—';
 const match=row=>!search.trim() || [supplierName(row),invoiceRef(row),row.id,row.invoice_id,row.notes,row.reference,row.payment_method,row.branch,branchNames.get(row.branch_id)].some(v=>String(v||'').toLowerCase().includes(search.trim().toLowerCase()));
 const rows=group.rows.filter(row=>match(row.ref));
 const visibleRows=view==='invoices'?rows.filter(row=>row.type==='invoice'):view==='payments'?rows.filter(row=>row.type==='payment'):rows;
 const postedInvoices=new Map(group.invoices.map(row=>[row.id,row]));
 const openInvoice=row=>{
   const invoice=row.type==='invoice' ? postedInvoices.get(row.ref.id) : postedInvoices.get(row.ref.invoice_id);
   // An earlier-period invoice may be linked to a current payment. Open it only
   // from the already scoped, authorized data with matching supplier identity.
   const linked=invoice || (row.type==='payment'?invoicesById.get(row.ref.invoice_id):null);
   return linked && linked.supplier_id===row.ref.supplier_id ? linked : null;
 };
 if (loadingRestaurants || query.isLoading) return <PortalDataState loading/>;
 if (!restaurantId || (restricted&&!assigned?.id)) return <p role="alert" className="p-6">{t.identity}</p>;
 if (query.isError) return <PortalDataState onRetry={query.refetch}/>;
 const issueCounts=ledger.issues.reduce((map,issue)=>({...map,[issue.type]:(map[issue.type]||0)+1}),{});
 return <div data-testid="supplier-ledger-workspace" className="min-w-0 space-y-3" dir={lang==='fa'||lang==='ar'?'rtl':'ltr'}>
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-black">{supplier ? t.statement : t.title}</h2><Button variant="outline" size="sm" onClick={()=>query.refetch()} disabled={query.isFetching}><RefreshCw className={`me-2 h-4 w-4 ${query.isFetching?'animate-spin':''}`}/>{t.refresh}</Button></div>
  <p className="text-xs text-muted-foreground">{t.subtitle}</p>
  <details className="rounded-xl border bg-card p-3"><summary className="cursor-pointer text-sm font-bold">{ux('Account filters','تصفية الحساب','فیلتر حساب')} · {t[period]} · {selectedCurrency==='UNKNOWN'?t.unknown:selectedCurrency}</summary>
  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
   <Filter label={t.branch} value={assigned?.id || branchId} onChange={value=>{if(!restricted){setBranchId(value);setLimit(50);}}}>
    {!restricted&&<option value="all">{t.allBranches}</option>}{(assigned?[assigned]:branches).map(b=><option key={b.id} value={b.id}>{b.name||b.label||b.key}</option>)}
   </Filter>
   {!supplier && <Filter label={t.supplier} value={supplierId} onChange={value=>{setSupplierId(value);setLimit(50);}}><option value="all">{t.allSuppliers}</option>{[...supplierOptions].map(([id,name])=><option key={id} value={id}>{name}</option>)}</Filter>}
   <Filter label={t.currency} value={selectedCurrency} onChange={value=>{setCurrency(value);setLimit(50);}}>{(ledger.groups.length?ledger.groups:[{currency:selectedCurrency}]).map(g=><option key={g.currency} value={g.currency}>{g.currency==='UNKNOWN'?t.unknown:g.currency}</option>)}</Filter>
   <Filter label={t.period} value={period} onChange={value=>{setPeriod(value);setLimit(50);}}>{['all','today','week','month','3months','6months','year','custom'].map(p=><option key={p} value={p}>{t[p]}</option>)}</Filter>
  </div>
  {period==='custom'&&<div className="grid grid-cols-2 gap-2">{['start','end'].map(key=><label key={key} className="text-xs">{key==='start'?t.from:t.to}<Input aria-label={key==='start'?t.from:t.to} type="date" value={custom[key]} onChange={e=>setCustom({...custom,[key]:e.target.value})}/></label>)}</div>}
  </details>
  {invalidRange?<p role="alert">{t.range}</p>:<>
   <p className="text-xs text-muted-foreground">{range.start || t.all} — {range.end}</p>
   {ledger.issues.length>0&&<details className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-950"><summary className="cursor-pointer font-semibold">{t.review} ({ledger.issues.length})</summary><p className="my-2 text-xs">{t.reviewNote}</p>{Object.entries(issueCounts).map(([type,count])=><p key={type} className="text-xs">{t[type]}: {count}</p>)}<ul className="mt-2 max-h-48 overflow-auto text-xs">{ledger.issues.map((issue,i)=><li key={i}>{t[issue.type]} — {onOpenInvoice && data.invoices.some(row=>row.id===issue.ref)?<button className="underline" onClick={()=>onOpenInvoice(data.invoices.find(row=>row.id===issue.ref))}>{data.invoices.find(row=>row.id===issue.ref)?.invoice_number || issue.ref}</button>:issue.ref || '—'}</li>)}</ul></details>}
   <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[['opening',group.opening],['invoiced',group.invoiced],['paid',group.paid],['closing',group.closing]].map(([key,value])=><Card key={key} className="min-w-0 p-3"><p className="text-xs text-muted-foreground">{t[key]}</p><p data-testid={`ledger-${key}`} className="mt-1 break-words text-lg font-bold" dir="ltr">{money(value)}</p></Card>)}</div>
   <section data-testid="supplier-record-history" className="min-w-0 space-y-3 rounded-xl border bg-card p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-base font-black"><BookOpen className="h-4 w-4 text-primary"/>{ux('Transaction history','سجل المعاملات','تاریخچه معاملات')}</h3><span className="text-xs font-semibold text-muted-foreground">{group.rows.length} {ux('records','سجل','رکورد')}</span></div>
    <div role="group" aria-label={ux('History view','عرض السجل','نمای تاریخچه')} className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
      {[['statement',t.statement,group.rows.length],['invoices',t.invoices,group.invoices.length],['payments',t.payments,group.payments.length]].map(([key,label,count])=><button key={key} type="button" data-testid={'ledger-view-'+key} aria-pressed={view===key} onClick={()=>{setView(key);setLimit(50);}} className={`min-h-12 min-w-0 rounded-lg px-1 py-1 text-xs font-bold ${view===key?'bg-background text-primary shadow-sm':'text-muted-foreground'}`}><span className="block break-words">{label}</span><span className="block tabular-nums">{count}</span></button>)}
    </div>
    <Input aria-label={t.search} placeholder={t.search} value={search} onChange={e=>{setSearch(e.target.value);setLimit(50);}}/>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{visibleRows.length} / {view==='invoices'?group.invoices.length:view==='payments'?group.payments.length:group.rows.length}</span>{search.trim()&&<Button size="sm" variant="ghost" onClick={()=>{setSearch('');setLimit(50);}}>{ux('Clear search','مسح البحث','پاک کردن جستجو')}</Button>}</div>
    <div className="space-y-2" data-testid="ledger-history-rows">
     {visibleRows.slice(0,limit).map(row=>{
      const isInvoice=row.type==='invoice';
      const invoice=openInvoice(row);
      const posted=postedInvoices.get(row.ref.id);
      const reference=invoiceRef(row.ref);
      return <article key={row.id} data-testid="ledger-history-row" data-record-type={row.type} className="min-w-0 rounded-xl border bg-background p-3">
       <div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-start gap-2"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${isInvoice?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>{isInvoice?<ReceiptText className="h-4 w-4"/>:<Wallet className="h-4 w-4"/>}</span><div className="min-w-0"><p className="break-words text-sm font-bold">{isInvoice?t.invoice:t.payment}</p><p className="break-all text-xs text-muted-foreground" dir="auto">{reference}</p><p className="break-words text-xs">{supplierName(row.ref)}</p><p className="text-xs text-muted-foreground">{row.date} · {branchNames.get(row.ref.branch_id)||row.ref.branch||'—'}</p></div></div><div className="min-w-0 text-end"><p dir="ltr" className={`break-all text-base font-black tabular-nums ${isInvoice?'text-blue-700':'text-emerald-700'}`}>{isInvoice?'+':'−'}{money(isInvoice?row.debit:row.credit)}</p>{!isInvoice&&row.ref.payment_method&&<p className="break-words text-xs text-muted-foreground">{row.ref.payment_method}</p>}</div></div>
       <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs"><span className="text-muted-foreground">{t.balance}</span><strong dir="ltr" className="break-all tabular-nums">{money(row.balance)}</strong></div>
       {isInvoice&&posted&&<div className="mt-1 flex flex-wrap justify-between gap-2 text-xs"><span>{t.remaining}</span><strong dir="ltr">{money(posted.ledgerRemaining)}</strong></div>}
       {row.ref.notes&&<p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{row.ref.notes}</p>}
       {(onOpenInvoice&&invoice||onPayInvoice&&isInvoice&&posted?.ledgerRemaining>0)&&<div className="mt-2 flex flex-wrap gap-2">
        {onOpenInvoice&&invoice&&<Button type="button" size="sm" variant="outline" onClick={()=>onOpenInvoice(invoice)}>{ux('Invoice details','تفاصيل الفاتورة','جزئیات فاکتور')}<ChevronRight className="ms-1 h-4 w-4 rtl:rotate-180"/></Button>}
        {onPayInvoice&&isInvoice&&posted?.ledgerRemaining>0&&<Button type="button" size="sm" onClick={()=>onPayInvoice(posted)}>{t.payment}</Button>}
       </div>}
      </article>;
     })}
     {!visibleRows.length&&<div role="status" className="rounded-xl border border-dashed p-4 text-sm"><p>{search.trim()?ux('No matching records','لا توجد نتائج مطابقة','رکورد مطابق یافت نشد'):t.empty}</p>{!search.trim()&&period!=='all'&&<Button variant="outline" size="sm" className="mt-2" onClick={()=>{setPeriod('all');setLimit(50);}}>{t.all}</Button>}</div>}
    </div>
    {visibleRows.length>limit&&<Button variant="outline" className="w-full" onClick={()=>setLimit(n=>n+50)}>{t.more} ({visibleRows.length-limit})</Button>}
    <p className="text-xs text-muted-foreground">{t.searchNote}</p>
   </section>
   <p className="text-xs text-muted-foreground">{t.overdue}: {group.overdue.length} · {t.credit}</p><p className="text-xs text-muted-foreground">{t.basis}</p>

  </>}
 </div>;
}
