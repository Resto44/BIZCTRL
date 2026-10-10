import React from 'react';
import {
  ArrowDownLeft,ArrowUpRight,ArrowRightLeft,AlertTriangle,
  BarChart3,Banknote,Building2,CreditCard,Landmark,
  ShieldAlert,WalletCards,Users,Activity,
} from 'lucide-react';
import {BarChart,Bar,CartesianGrid,Tooltip,ResponsiveContainer,XAxis} from 'recharts';

const textByLanguage={
 en:{
  title:'Treasury Command Center',subtitle:'Verified movements, account balances and settlement health',
  accounts:'Treasury accounts',ledger:'Account-linked balance',scope:'Account scope',
  wallet:'Owner wallet movements',ownerNetwork:'Owner network',ownerCash:'Owner cash',
  inflows:'Owner inflows · this month',outflows:'Owner outflows · this month',
  notBank:'Wallet movement totals are not the same as bank or cash account balances.',
  branch:'Branch wallet movements',branchNote:'These are signed wallet movements, not a verified physical cash count.',
  flow:'Owner inflow / outflow trend',flows:'6 recorded months',inflow:'In',outflow:'Out',
  health:'Reconciliation attention',negative:'Negative linked account(s)',unlinked:'Legacy wallet-only movements',
  orphan:'Transactions referring to unlisted accounts',inspect:'Review reconciliation',
  accountsAction:'Manage accounts',txAction:'All transactions',noData:'No recorded data',all:'All branches',
  selected:'Selected branch',active:'Active',inactive:'Inactive',negativeInfo:'A negative ledger is not automatically a bug. Review opening balances and recorded movements.',
  payroll:'Estimated base payroll per month',
 },
 ar:{
  title:'مركز إدارة الخزينة',subtitle:'الحركات المسجلة وأرصدة الحسابات وحالة التسوية',
  accounts:'حسابات الخزينة',ledger:'رصيد الحسابات المرتبطة',scope:'نطاق الحسابات',
  wallet:'حركات محفظة المالك',ownerNetwork:'شبكة المالك',ownerCash:'نقد المالك',
  inflows:'حركات المالك الواردة · هذا الشهر',outflows:'حركات المالك الصادرة · هذا الشهر',
  notBank:'حركات المحفظة لا تساوي بالضرورة أرصدة الحسابات البنكية أو النقدية.',
  branch:'حركات محفظة الفرع',branchNote:'هذه حركات محفظة وليست جرداً فعلياً للنقد في الصندوق.',
  flow:'اتجاه التدفقات الواردة والصادرة',flows:'آخر 6 أشهر مسجلة',inflow:'وارد',outflow:'صادر',
  health:'متابعة المطابقة',negative:'حسابات مرتبطة برصيد سالب',unlinked:'حركات محفظة غير مرتبطة بحساب',
  orphan:'حركات تشير لحسابات غير ظاهرة',inspect:'مراجعة المطابقة',
  accountsAction:'إدارة الحسابات',txAction:'جميع الحركات',noData:'لا توجد بيانات مسجلة',all:'جميع الفروع',
  selected:'الفرع المحدد',active:'نشط',inactive:'غير نشط',negativeInfo:'الرصيد السالب لا يعني خطأً تلقائياً. راجع الرصيد الافتتاحي والحركات المسجلة.',
  payroll:'تقدير الرواتب الأساسية شهرياً',
 },
 fa:{
  title:'مرکز مدیریت خزانه',subtitle:'گردش ثبت‌شده، مانده حساب‌ها و وضعیت تسویه',
  accounts:'حساب‌های خزانه',ledger:'مانده حساب‌های متصل',scope:'دامنه حساب‌ها',
  wallet:'گردش کیف‌پول مالک',ownerNetwork:'شبکه مالک',ownerCash:'نقد مالک',
  inflows:'ورودی مالک · این ماه',outflows:'خروجی مالک · این ماه',
  notBank:'گردش کیف‌پول لزوماً برابر موجودی بانک یا صندوق نیست.',
  branch:'گردش کیف‌پول شعبه',branchNote:'این ارقام گردش کیف‌پول هستند، نه شمارش واقعی نقد در صندوق.',
  flow:'روند ورودی و خروجی مالک',flows:'شش ماه ثبت‌شده',inflow:'ورودی',outflow:'خروجی',
  health:'موارد نیازمند تطبیق',negative:'حساب‌های متصل با مانده منفی',unlinked:'گردش‌های قدیمی بدون اتصال به حساب',
  orphan:'تراکنش‌های متصل به حساب نامشخص',inspect:'بررسی تطبیق',
  accountsAction:'مدیریت حساب‌ها',txAction:'همه تراکنش‌ها',noData:'داده ثبت نشده',all:'همه شعبه‌ها',
  selected:'شعبه انتخابی',active:'فعال',inactive:'غیرفعال',negativeInfo:'مانده منفی به‌تنهایی نشانه باگ نیست؛ مانده اولیه و تراکنش‌ها را بررسی کنید.',
  payroll:'برآورد ماهانه حقوق پایه',
 },
};
const tone=n=>Number(n)<0?'text-rose-600 dark:text-rose-400':'text-emerald-600 dark:text-emerald-400';
const Card=({children,className=''})=><section className={'rounded-[22px] border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-900 '+className}>{children}</section>;
const Money=({value,fmt,className=''})=><span dir="ltr" className={'block break-words font-black tracking-tight tabular-nums '+tone(value)+' '+className}>{fmt(Number(value)||0)}</span>;
function Header({icon:Icon,title,hint,action}){
 return <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
  <div className="flex min-w-0 items-center gap-2">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/80 dark:text-blue-300"><Icon className="h-5 w-5"/></span>
    <div className="min-w-0"><h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{title}</h3>
      {hint&&<p className="text-[11px] leading-4 text-muted-foreground">{hint}</p>}</div>
  </div>{action}
 </div>;
}
const Mini=({title,value,fmt,icon:Icon,color='emerald'})=><div className={'min-w-0 rounded-2xl border p-3 '+(color==='blue'?'border-blue-100 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-950/40':color==='rose'?'border-rose-100 bg-rose-50/80 dark:border-rose-900 dark:bg-rose-950/40':'border-emerald-100 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/40')}>
 <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">{Icon&&<Icon className="h-4 w-4"/>}{title}</span>
 <Money value={value} fmt={fmt} className="mt-1 text-base sm:text-lg"/>
 </div>;
export default function TreasuryERPOverview({
 accounts=[],accountBalances={},ledger=0,walletBalance={},
 branchBalances={},branches=[],monthlySummary={},trendData=[],
 integrity={},fmt,valueScope='all',setTab,payrollEstimate=0,lang='en',isLoading=false,
}){
 const tr=textByLanguage[lang]||textByLanguage.en;
 const balanceRows=accounts.slice(0,6);
 const negAccountCount=integrity.negativeAccounts||0;
 const attention=(integrity.unknownAccountMovements||0)+negAccountCount;
 return <div data-testid="treasury-erp-overview" className="space-y-3.5">
  <Card className="overflow-hidden !p-0">
    <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-950 px-4 py-4 text-white sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15"><WalletCards className="h-5 w-5"/></span>
          <div><h2 className="text-lg font-black">{tr.title}</h2><p className="text-[11px] text-blue-100">{tr.subtitle}</p></div>
        </div>
        <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-bold">{valueScope==='all'?tr.all:tr.selected}</span>
      </div>
      <div className="mt-4 rounded-xl border border-white/20 bg-white/10 px-3 py-3">
        <span className="text-xs text-blue-100">{tr.ledger}</span>
        {isLoading?<p className="mt-2 text-sm text-blue-100">…</p>:
         <p dir="ltr" className="mt-1 break-words text-3xl font-black tracking-tight tabular-nums">{accounts.length?fmt(ledger):'—'}</p>}
        <p className="mt-1 text-[10px] text-blue-200">{accounts.length} {tr.accounts} · {tr.negativeInfo}</p>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-4">
      <Mini icon={CreditCard} title={tr.ownerNetwork} value={walletBalance.ownerNetwork} fmt={fmt} color="blue"/>
      <Mini icon={Banknote} title={tr.ownerCash} value={walletBalance.ownerCash} fmt={fmt}/>
      <Mini icon={ArrowDownLeft} title={tr.inflows} value={monthlySummary.ownerIn} fmt={fmt}/>
      <Mini icon={ArrowUpRight} title={tr.outflows} value={monthlySummary.ownerOut} fmt={fmt} color="rose"/>
    </div>
    <p className="px-4 pb-3 text-[11px] text-muted-foreground">{tr.notBank}</p>
  </Card>
  <Card>
   <Header icon={Landmark} title={tr.accounts} hint={accounts.length+' '+tr.accounts}
     action={<button type="button" onClick={()=>setTab('accounts')} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950">{tr.accountsAction}</button>}/>
   {balanceRows.length?<div className="grid gap-2 sm:grid-cols-2">
     {balanceRows.map(account=><div key={account.id} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/70">
       <div className="min-w-0"><div className="flex items-center gap-1.5 text-xs font-bold"><span className="h-2 w-2 shrink-0 rounded-full bg-blue-500"/><span className="truncate">{account.account_name}</span></div>
         <span className="text-[10px] text-muted-foreground">{account.is_active===false?tr.inactive:tr.active} · {account.account_type}</span></div>
       <Money value={accountBalances[account.id]||0} fmt={fmt} className="shrink-0 text-sm"/>
     </div>)}
   </div>:<p className="text-xs text-muted-foreground">{tr.noData}</p>}
  </Card>
  <div className="grid gap-3 sm:grid-cols-2">
   <Card>
    <Header icon={BarChart3} title={tr.flow} hint={tr.flows}/>
    {trendData.some(d=>Number(d.ownerIn)>0||Number(d.ownerOut)>0)
      ?<div className="h-44 w-full" dir="ltr"><ResponsiveContainer width="100%" height="100%">
        <BarChart data={trendData} margin={{top:10,right:0,left:0,bottom:2}} barGap={2}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.18}/>
          <XAxis dataKey="label" tick={{fontSize:10,fill:'#64748b'}} axisLine={false} tickLine={false}/>
          <Tooltip formatter={value=>fmt(value)} contentStyle={{borderRadius:12,fontSize:11}}/>
          <Bar name={tr.inflow} dataKey="ownerIn" fill="#10b981" radius={[3,3,0,0]} maxBarSize={20}/>
          <Bar name={tr.outflow} dataKey="ownerOut" fill="#fb7185" radius={[3,3,0,0]} maxBarSize={20}/>
        </BarChart></ResponsiveContainer></div>
      :<div className="grid h-32 place-items-center text-xs text-muted-foreground">{tr.noData}</div>}
    <div className="mt-1 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
     <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-emerald-500"/>{tr.inflow}</span>
     <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-rose-400"/>{tr.outflow}</span>
    </div>
   </Card>
   <Card>
     <Header icon={Building2} title={tr.branch} hint={tr.branchNote}/>
     {Object.entries(branchBalances).length?
       <div className="space-y-2">{Object.entries(branchBalances).map(([key,balance])=>
         <div key={key} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/60">
           <span className="min-w-0 truncate text-xs font-semibold">{branches.find(b=>b.key===key||b.branch_key===key)?.label||key}</span>
           <Money value={balance} fmt={fmt} className="shrink-0 text-sm"/>
         </div>)}</div>:<p className="text-xs text-muted-foreground">{tr.noData}</p>}
     {payrollEstimate>0&&<div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2.5 dark:bg-amber-950/25">
       <span className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300"><Users className="h-4 w-4"/>{tr.payroll}</span>
       <span dir="ltr" className="shrink-0 text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">{fmt(payrollEstimate)}</span>
     </div>}
   </Card>
  </div>
  <Card>
   <Header icon={ShieldAlert} title={tr.health}
     action={<button type="button" onClick={()=>setTab('reconcile')} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950">{tr.inspect}</button>}/>
   <div className="grid grid-cols-3 gap-2">
    {[{label:tr.negative,n:negAccountCount},{label:tr.unlinked,n:integrity.legacyWalletMovements||0},{label:tr.orphan,n:integrity.unknownAccountMovements||0}].map(item=>
    <div key={item.label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-2 text-center dark:border-slate-700 dark:bg-slate-800">
      <span className={'text-lg font-black '+(item.n?'text-amber-600':'text-emerald-600')}>{item.n}</span>
      <p className="mt-1 break-words text-[10px] leading-4 text-muted-foreground">{item.label}</p>
    </div>)}
   </div>
   {attention>0&&<p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5 shrink-0"/>{tr.negativeInfo}</p>}
   <button type="button" onClick={()=>setTab('transactions')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300"><Activity className="h-4 w-4"/>{tr.txAction}<ArrowRightLeft className="h-4 w-4"/></button>
  </Card>
 </div>;
}
