import React, {useMemo, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {useLanguage} from '@/lib/LanguageContext';
import {useTenant} from '@/lib/TenantContext';
import {buildSupplierLedger} from '@/lib/supplierLedger';
import {fetchSupplierLedger} from '@/lib/supplierLedgerData';
import {settlementPeriodRange} from '@/lib/treasurySettlementPeriods';
import PortalDataState from '@/components/shared/PortalDataState';
import PageHeader from '@/components/shared/PageHeader';
import {Card} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {BookOpen,RefreshCw} from 'lucide-react';

const COPY = {
 en:{unapproved_invoice:'Invoice awaiting approval — excluded from posted balance',title:'Supplier Ledger',subtitle:'Invoices, recorded payments and reconciliation',branch:'Branch',allBranches:'All branches',supplier:'Supplier',allSuppliers:'All suppliers',currency:'Currency',unknown:'Unspecified currency',period:'Period',all:'All history',today:'Today',week:'Last 7 days',month:'This month','3months':'3 months','6months':'6 months',year:'This year',custom:'Custom',from:'From',to:'To',opening:'Opening balance',invoiced:'Period invoices',paid:'Recorded payments',closing:'Closing ledger balance',overdue:'Overdue invoices as of end date',statement:'Statement',invoices:'Invoices',payments:'Payments',date:'Date',description:'Description',amount:'Amount',balance:'Balance',invoice:'Invoice',payment:'Payment',empty:'No records in this period',search:'Search supplier, invoice or reference',searchNote:'Search only narrows visible rows. Totals and running balances keep the complete selected account scope.',refresh:'Refresh',more:'Show more',review:'Reconciliation required',reviewNote:'Some records need review. No automatic corrections or extra payments have been added.',identity:'Select an organization and an assigned branch.',range:'Start date must not be after end date.',due:'Due',remaining:'Remaining from linked payments',credit:'A negative closing balance is a supplier credit.',basis:'Opening + period invoices − recorded payments = closing. Each currency is separate; no conversion.',invalid_invoice:'Invalid invoice date or amount',invalid_payment:'Invalid payment date or amount',payment_mismatch:'Invoice paid amount differs from payment records',unmatched_payment:'Unlinked or inconsistent payment',unknown_currency:'Currency cannot be confirmed',duplicate_invoice_number:'Repeated invoice number',duplicate_or_missing_id:'Repeated or missing record ID'},
 fa:{unapproved_invoice:'فاکتور منتظر تأیید — از ماندهٔ قطعی خارج است',title:'دفتر حساب تأمین‌کننده',subtitle:'فاکتورها، پرداخت‌های ثبت‌شده و تطبیق حساب',branch:'شعبه',allBranches:'تمام شعبه‌ها',supplier:'تأمین‌کننده',allSuppliers:'تمام تأمین‌کنندگان',currency:'ارز',unknown:'ارز نامشخص',period:'دوره',all:'تمام سوابق',today:'امروز',week:'۷ روز اخیر',month:'این ماه','3months':'۳ ماه','6months':'۶ ماه',year:'امسال',custom:'دلخواه',from:'از',to:'تا',opening:'ماندهٔ اول دوره',invoiced:'فاکتورهای دوره',paid:'پرداخت‌های ثبت‌شده',closing:'ماندهٔ پایان دفتر',overdue:'فاکتورهای سررسیدگذشته تا پایان دوره',statement:'صورت‌حساب',invoices:'فاکتورها',payments:'پرداخت‌ها',date:'تاریخ',description:'شرح',amount:'مبلغ',balance:'مانده',invoice:'فاکتور',payment:'پرداخت',empty:'در این دوره سابقه‌ای نیست',search:'جست‌وجوی تأمین‌کننده، فاکتور یا مرجع',searchNote:'جست‌وجو فقط ردیف‌های نمایان را محدود می‌کند. مجموع‌ها و مانده، کل حساب انتخاب‌شده را حفظ می‌کنند.',refresh:'تازه‌سازی',more:'نمایش بیشتر',review:'نیاز به تطبیق حساب',reviewNote:'بعضی سوابق نیاز به بررسی دارند. اصلاح خودکار یا پرداخت اضافی ساخته نشده است.',identity:'سازمان و شعبهٔ مربوط را انتخاب کنید.',range:'تاریخ شروع نباید بعد از پایان باشد.',due:'سررسید',remaining:'مانده بر اساس پرداخت‌های مرتبط',credit:'ماندهٔ منفی یعنی اعتبار نزد تأمین‌کننده.',basis:'ماندهٔ اول + فاکتورهای دوره − پرداخت‌های ثبت‌شده = ماندهٔ پایان. ارزها جدا هستند؛ تبدیل ارز انجام نشده.',invalid_invoice:'تاریخ یا مبلغ نامعتبر فاکتور',invalid_payment:'تاریخ یا مبلغ نامعتبر پرداخت',payment_mismatch:'مبلغ پرداخت‌شدهٔ فاکتور با سوابق پرداخت فرق دارد',unmatched_payment:'پرداخت بدون ارتباط معتبر',unknown_currency:'ارز قابل تأیید نیست',duplicate_invoice_number:'شمارهٔ تکراری فاکتور',duplicate_or_missing_id:'شناسهٔ تکراری یا ناموجود'},
 ar:{unapproved_invoice:'فاتورة بانتظار الموافقة — مستبعدة من الرصيد المرحّل',title:'كشف حساب المورد',subtitle:'الفواتير والمدفوعات المسجلة ومطابقة الحساب',branch:'الفرع',allBranches:'كل الفروع',supplier:'المورد',allSuppliers:'كل الموردين',currency:'العملة',unknown:'عملة غير محددة',period:'الفترة',all:'كل السجلات',today:'اليوم',week:'آخر ٧ أيام',month:'هذا الشهر','3months':'٣ أشهر','6months':'٦ أشهر',year:'هذه السنة',custom:'مخصص',from:'من',to:'إلى',opening:'الرصيد الافتتاحي',invoiced:'فواتير الفترة',paid:'المدفوعات المسجلة',closing:'الرصيد الختامي للدفتر',overdue:'الفواتير المتأخرة حتى نهاية الفترة',statement:'كشف الحساب',invoices:'الفواتير',payments:'المدفوعات',date:'التاريخ',description:'الوصف',amount:'المبلغ',balance:'الرصيد',invoice:'فاتورة',payment:'دفعة',empty:'لا توجد سجلات في هذه الفترة',search:'ابحث عن مورد أو فاتورة أو مرجع',searchNote:'البحث يحدد الصفوف المعروضة فقط. الإجماليات والأرصدة تشمل كامل نطاق الحساب المحدد.',refresh:'تحديث',more:'عرض المزيد',review:'تحتاج مطابقة',reviewNote:'بعض السجلات تحتاج مراجعة. لم تُنشأ تصحيحات تلقائية أو دفعات إضافية.',identity:'اختر المنشأة والفرع المعين.',range:'تاريخ البداية يجب ألا يتجاوز النهاية.',due:'الاستحقاق',remaining:'المتبقي حسب الدفعات المرتبطة',credit:'الرصيد السالب يعني رصيداً دائناً لدى المورد.',basis:'الرصيد الافتتاحي + فواتير الفترة − المدفوعات المسجلة = الرصيد الختامي. العملات منفصلة دون تحويل.',invalid_invoice:'تاريخ أو مبلغ فاتورة غير صالح',invalid_payment:'تاريخ أو مبلغ دفعة غير صالح',payment_mismatch:'المبلغ المدفوع بالفاتورة يختلف عن سجلات الدفع',unmatched_payment:'دفعة غير مرتبطة أو غير متطابقة',unknown_currency:'تعذر تأكيد العملة',duplicate_invoice_number:'رقم فاتورة مكرر',duplicate_or_missing_id:'معرف سجل مكرر أو مفقود'},
};
function Filter({label,value,onChange,children}) {
 return <label className="min-w-0 text-xs text-muted-foreground">{label}<select aria-label={label} value={value} onChange={e=>onChange(e.target.value)} className="mt-1 block h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground">{children}</select></label>;
}
export default function SupplierLedger() {
 const {lang='en',currency:preferredCurrency} = useLanguage();
 const t=COPY[lang] || COPY.en;
 const {activeRestaurant,activeRestaurantId,branches=[],isBranchScoped,isManager,managerBranchObject,loadingRestaurants}=useTenant();
 const restaurantId=activeRestaurantId || activeRestaurant?.id;
 const restricted=isBranchScoped || isManager;
 const [branchId,setBranchId]=useState('all');
 const [supplierId,setSupplierId]=useState('all');
 const [currency,setCurrency]=useState('');
 const [period,setPeriod]=useState('all');
 const [custom,setCustom]=useState({start:'',end:''});
 const [search,setSearch]=useState('');
 const [limit,setLimit]=useState(50);
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
 const match=row=>!search.trim() || [row.supplier_name,row.invoice_number,row.id,row.invoice_id,row.notes].some(v=>String(v||'').toLowerCase().includes(search.trim().toLowerCase()));
 const rows=group.rows.filter(row=>match(row.ref));
 if (loadingRestaurants || query.isLoading) return <PortalDataState loading/>;
 if (!restaurantId || (restricted&&!assigned?.id)) return <p role="alert" className="p-6">{t.identity}</p>;
 if (query.isError) return <PortalDataState onRetry={query.refetch}/>;
 const issueCounts=ledger.issues.reduce((map,issue)=>({...map,[issue.type]:(map[issue.type]||0)+1}),{});
 return <div className="space-y-4" dir={lang==='fa'||lang==='ar'?'rtl':'ltr'}>
  <PageHeader title={t.title} subtitle={t.subtitle} icon={<BookOpen className="h-5 w-5"/>}/>
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
   <Filter label={t.branch} value={assigned?.id || branchId} onChange={value=>{if(!restricted){setBranchId(value);setLimit(50);}}}>
    {!restricted&&<option value="all">{t.allBranches}</option>}{(assigned?[assigned]:branches).map(b=><option key={b.id} value={b.id}>{b.name||b.label||b.key}</option>)}
   </Filter>
   <Filter label={t.supplier} value={supplierId} onChange={value=>{setSupplierId(value);setLimit(50);}}><option value="all">{t.allSuppliers}</option>{[...supplierOptions].map(([id,name])=><option key={id} value={id}>{name}</option>)}</Filter>
   <Filter label={t.currency} value={selectedCurrency} onChange={setCurrency}>{(ledger.groups.length?ledger.groups:[{currency:selectedCurrency}]).map(g=><option key={g.currency} value={g.currency}>{g.currency==='UNKNOWN'?t.unknown:g.currency}</option>)}</Filter>
   <Filter label={t.period} value={period} onChange={setPeriod}>{['all','today','week','month','3months','6months','year','custom'].map(p=><option key={p} value={p}>{t[p]}</option>)}</Filter>
  </div>
  {period==='custom'&&<div className="grid grid-cols-2 gap-2">{['start','end'].map(key=><label key={key} className="text-xs">{key==='start'?t.from:t.to}<Input aria-label={key==='start'?t.from:t.to} type="date" value={custom[key]} onChange={e=>setCustom({...custom,[key]:e.target.value})}/></label>)}</div>}
  <Button variant="outline" size="sm" onClick={()=>query.refetch()} disabled={query.isFetching}><RefreshCw className="me-2 h-4 w-4"/>{t.refresh}</Button>
  {invalidRange?<p role="alert">{t.range}</p>:<>
   <p className="text-xs text-muted-foreground">{range.start || t.all} — {range.end}<br/>{t.basis}</p>
   {ledger.issues.length>0&&<details className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-amber-950"><summary className="cursor-pointer font-semibold">{t.review} ({ledger.issues.length})</summary><p className="my-2 text-xs">{t.reviewNote}</p>{Object.entries(issueCounts).map(([type,count])=><p key={type} className="text-xs">{t[type]}: {count}</p>)}<ul className="mt-2 max-h-48 overflow-auto text-xs">{ledger.issues.map((issue,i)=><li key={i}>{t[issue.type]} — {data.invoices.find(row=>row.id===issue.ref)?.invoice_number || issue.ref || '—'}</li>)}</ul></details>}
   <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[['opening',group.opening],['invoiced',group.invoiced],['paid',group.paid],['closing',group.closing]].map(([key,value])=><Card key={key} className="min-w-0 p-3"><p className="text-xs text-muted-foreground">{t[key]}</p><p data-testid={`ledger-${key}`} className="mt-1 break-words text-lg font-bold" dir="ltr">{money(value)}</p></Card>)}</div>
   <p className="text-xs text-muted-foreground">{t.overdue}: {group.overdue.length} · {t.credit}</p>
   <Input aria-label={t.search} placeholder={t.search} value={search} onChange={e=>{setSearch(e.target.value);setLimit(50);}}/>
   <p className="text-xs text-muted-foreground">{t.searchNote}</p>
   <Tabs defaultValue="statement"><TabsList className="flex w-full"><TabsTrigger value="statement" className="flex-1">{t.statement}</TabsTrigger><TabsTrigger value="invoices" className="flex-1">{t.invoices} ({group.invoices.length})</TabsTrigger><TabsTrigger value="payments" className="flex-1">{t.payments} ({group.payments.length})</TabsTrigger></TabsList>
    <TabsContent value="statement"><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[560px] text-sm"><thead><tr className="bg-muted text-start">{['date','description','amount','balance'].map(key=><th key={key} className="p-3 text-start">{t[key]}</th>)}</tr></thead><tbody>{rows.slice(0,limit).map(row=><tr key={row.id} className="border-t"><td className="whitespace-nowrap p-3">{row.date}</td><td className="p-3"><p>{row.type==='invoice'?t.invoice:t.payment} {row.ref.invoice_number || row.ref.invoice_id?.slice(0,8)}</p><p className="text-xs text-muted-foreground">{row.ref.supplier_name || row.ref.supplier_id || '—'}</p></td><td className="whitespace-nowrap p-3" dir="ltr">{row.type==='invoice'?'+':'−'}{money(row.debit || row.credit)}</td><td className="whitespace-nowrap p-3 font-semibold" dir="ltr">{money(row.balance)}</td></tr>)}</tbody></table></div>{!rows.length&&<p className="p-4 text-sm">{t.empty}</p>}{rows.length>limit&&<Button className="mt-2" onClick={()=>setLimit(limit+50)}>{t.more}</Button>}</TabsContent>
    <TabsContent value="invoices" className="space-y-2">{group.invoices.filter(match).map(row=><Card key={row.id} className="p-3"><p className="font-semibold">{row.invoice_number || row.id.slice(0,8)} · {row.supplier_name}</p><p className="text-xs text-muted-foreground">{row.date} · {t.due}: {row.due_date || '—'}</p><p dir="ltr">{money(row.total_amount)}</p><p className="text-xs">{t.remaining}: {money(row.ledgerRemaining)}</p></Card>)}</TabsContent>
    <TabsContent value="payments" className="space-y-2">{group.payments.filter(match).map(row=><Card key={row.id} className="p-3"><p className="font-semibold">{row.supplier_name || row.supplier_id || '—'}</p><p className="text-xs text-muted-foreground">{row.date} · {row.payment_method} · {row.invoice_id?.slice(0,8) || '—'}</p><p dir="ltr">{money(row.amount)}</p></Card>)}</TabsContent>
   </Tabs>
  </>}
 </div>;
}
