import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { useRole } from '@/lib/RoleContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import PortalDataState from '@/components/shared/PortalDataState';
import { computeRunningCashflow, cashflowDateRange } from '@/lib/cashflowEngine';
import { readCashflow, resolveCashflowBranch } from '@/lib/cashflowRepository';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { RefreshCw, Download } from 'lucide-react';

const COPY = {
 en:{title:'Running Cash Flow',today:'Today',week:'Week',month:'Month',year:'Year',all:'All branches',refresh:'Refresh',opening:'Opening ledger balance',closing:'Calculated cash balance',inflow:'Cash received',outflow:'Cash paid',net:'Net cash movement',count:'Latest counted cash',network:'Network sales',credit:'Credit sales',unknown:'Not verified',loading:'Updating…',basis:'Posted drawer receipts and payments. Wallet funding is a transfer; credit sales and network sales are separate from drawer cash.',missing:'Opening balance is not verified for every selected branch. Receipts, payments and net movement remain available; an unknown balance is not shown as zero.',noncash:'Calculated balances are before count differences; the latest physical count is shown separately. Network sales are not a confirmed bank balance. Credit sales are receivables, not cash received.',negative:'The recorded ledger balance is negative. Review funding and payments; this is not a physical cash count.',trend:'Cumulative net cash movement',statement:'Daily cash statement',sources:'Receipt and payment breakdown',date:'Date',running:'Cumulative net',noData:'No posted cash movements in this period.',closings:'finalized closings',movements:'posted cash movements',asOf:'Latest count date',csv:'Export CSV',other:'Other movements',cash_sale:'Cash sales',supplier_payment:'Supplier payments',cash_expense:'Paid expenses',cash_deposit:'Wallet / treasury funding',owner_injection:'Owner funding',customer_debt_collection:'Customer debt collections'},
 fa:{title:'جریان نقدی جاری',today:'امروز',week:'هفته',month:'ماه',year:'سال',all:'تمام شعبه‌ها',refresh:'تازه‌سازی',opening:'ماندهٔ دفتر در آغاز دوره',closing:'ماندهٔ محاسباتی صندوق',inflow:'نقد دریافت‌شده',outflow:'نقد پرداخت‌شده',net:'خالص گردش نقد',count:'آخرین نقد شمارش‌شده',network:'فروش شبکه',credit:'فروش کریدت',unknown:'تأیید نشده',loading:'در حال تازه‌سازی…',basis:'بر اساس دریافت‌ها و پرداخت‌های ثبت‌شدهٔ صندوق. تمویل والت انتقال پول است؛ فروش شبکه و کریدت از نقد صندوق جدا هستند.',missing:'ماندهٔ آغاز دوره برای تمام شعبه‌های انتخاب‌شده تأیید نشده است. دریافت، پرداخت و خالص گردش نمایش داده می‌شوند؛ ماندهٔ نامعلوم صفر حساب نمی‌شود.',noncash:'ماندهٔ محاسباتی پیش از تفاوت‌های شمارش است؛ آخرین نقد شمارش‌شده جدا نمایش داده می‌شود. فروش شبکه، موجودی تأییدشدهٔ بانک نیست. فروش کریدت طلب از مشتری است، نه پول دریافت‌شده.',negative:'ماندهٔ ثبت‌شده منفی است. تمویل و پرداخت‌ها بررسی شوند؛ این عدد شمارش واقعی صندوق نیست.',trend:'روند تجمعی خالص گردش نقد',statement:'صورت روزانهٔ گردش نقد',sources:'تفکیک دریافت‌ها و پرداخت‌ها',date:'تاریخ',running:'خالص تجمعی',noData:'در این دوره گردش نقدی ثبت نشده است.',closings:'کلوزینگ نهایی',movements:'گردش نقد ثبت‌شده',asOf:'تاریخ آخرین شمارش',csv:'دانلود CSV',other:'سایر گردش‌ها',cash_sale:'فروش نقدی',supplier_payment:'پرداخت به تأمین‌کننده',cash_expense:'مصارف پرداخت‌شده',cash_deposit:'تمویل از والت / خزانه',owner_injection:'تمویل مالک',customer_debt_collection:'دریافت بدهی مشتری'},
 ar:{title:'التدفق النقدي الجاري',today:'اليوم',week:'أسبوع',month:'شهر',year:'سنة',all:'جميع الفروع',refresh:'تحديث',opening:'رصيد الدفتر أول الفترة',closing:'رصيد النقد المحسوب',inflow:'النقد المستلم',outflow:'النقد المدفوع',net:'صافي حركة النقد',count:'آخر نقد معدود',network:'مبيعات الشبكة',credit:'المبيعات الآجلة',unknown:'غير مؤكد',loading:'جارٍ التحديث…',basis:'المقبوضات والمدفوعات المسجلة للصندوق. تمويل المحفظة تحويل مالي؛ مبيعات الشبكة والآجل منفصلة عن نقد الصندوق.',missing:'الرصيد الافتتاحي غير مؤكد لكل الفروع المحددة. تظل المقبوضات والمدفوعات وصافي الحركة متاحة؛ الرصيد المجهول لا يعرض صفراً.',noncash:'الأرصدة المحسوبة قبل فروق الجرد؛ آخر نقد معدود معروض بشكل مستقل. مبيعات الشبكة ليست رصيداً بنكياً مؤكداً. المبيعات الآجلة ذمم على العملاء وليست نقداً مستلماً.',negative:'رصيد الدفتر سالب. راجع التمويل والمدفوعات؛ هذا ليس جرداً فعلياً للصندوق.',trend:'صافي حركة النقد التراكمي',statement:'بيان حركة النقد اليومي',sources:'تفصيل المقبوضات والمدفوعات',date:'التاريخ',running:'الصافي التراكمي',noData:'لا توجد حركات نقدية مسجلة خلال الفترة.',closings:'إقفالات معتمدة',movements:'حركات نقدية مسجلة',asOf:'تاريخ آخر جرد',csv:'تصدير CSV',other:'حركات أخرى',cash_sale:'المبيعات النقدية',supplier_payment:'مدفوعات الموردين',cash_expense:'المصروفات المدفوعة',cash_deposit:'تمويل المحفظة / الخزينة',owner_injection:'تمويل المالك',customer_debt_collection:'تحصيل ديون العملاء'},
};
export default function CashFlow() {
 const {lang,currency:preferredCurrency}=useLanguage(); const m=COPY[lang]||COPY.en;
 const {branches,activeRestaurant}=useTenant(); const {role,user}=useRole();
 const currency=activeRestaurant?.currency || preferredCurrency;
 const [period,setPeriod]=useState('month'); const [selected,setSelected]=useState('all');
 useEffect(()=>setSelected('all'),[activeRestaurant?.id]);
 const [now,setNow]=useState(()=>new Date());
 const range=cashflowDateRange(period,now);
 const scope=useMemo(()=>{try{return {branch:resolveCashflowBranch({role,user,branches,selectedBranch:selected})};}catch(error){return {error};}},[role,user,branches,selected]);
 const query=useQuery({queryKey:['canonical-cashflow',activeRestaurant?.id,role,user?.id,scope.branch?.id,range.to],enabled:Boolean(activeRestaurant?.id&&!scope.error),staleTime:15000,refetchOnMount:'always',
  queryFn:()=>readCashflow(supabase,{restaurantId:activeRestaurant.id,branch:scope.branch,to:range.to})});
 const report=useMemo(()=>{if(!query.data)return null;try{return computeRunningCashflow({...query.data,branches:scope.branch?[scope.branch]:branches,fromStr:range.from,toStr:range.to});}catch(error){return {error};}},[query.data,scope.branch,branches,range.from,range.to]);
 const ready=Boolean(report&&!report.error&&!query.isError&&!scope.error);
 const fmt=value=>value==null?m.unknown:`${currency} ${Number(value).toLocaleString(lang==='fa'?'fa-IR':lang==='ar'?'ar-SA':'en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
 const refresh=()=>{setNow(new Date());query.refetch();};
 const exportCSV=()=>{
  if(!ready)return;
  const headers=[m.date,m.opening,m.inflow,m.outflow,m.closing,m.net,m.running,m.network,m.credit];
  const cell=v=>`"${String(v??'').replaceAll('"','""')}"`;
  const rows=report.rows.map(r=>[r.date,...[r.openCash,r.inflow,r.outflow,r.closeCash,r.net,r.runningNet,r.network,r.credit].map(n=>n==null?'':n.toFixed(2))]);
  const blob=new Blob(['\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`cashflow_${range.from}_${range.to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const metric=(label,value,color='text-foreground',note)=> <Card key={label} className="min-w-0 rounded-2xl p-4"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p dir="ltr" className={`mt-2 break-words text-start text-lg font-black tabular-nums sm:text-2xl ${color}`}>{fmt(value)}</p>{note&&<p className="mt-1 text-xs text-muted-foreground">{note}</p>}</Card>;
 return <div className="min-w-0 space-y-4" dir={['fa','ar'].includes(lang)?'rtl':'ltr'} data-i18n-skip="true">
  <PageHeader title={m.title} action={<div className="flex gap-2"><Button size="sm" variant="outline" onClick={refresh} disabled={query.isFetching} aria-label={m.refresh}><RefreshCw className={`h-4 w-4 ${query.isFetching?'animate-spin':''}`}/></Button><Button size="sm" variant="outline" disabled={!ready||query.isFetching} onClick={exportCSV}><Download className="me-2 h-4 w-4"/>{m.csv}</Button></div>}/>
  <div className="flex flex-wrap gap-2">{['today','week','month','year'].map(p=><Button key={p} aria-pressed={p===period} variant={p===period?'default':'outline'} onClick={()=>{setNow(new Date());setPeriod(p);}}>{m[p]}</Button>)}
  {role==='owner'&&<Select value={selected} onValueChange={setSelected}><SelectTrigger className="min-h-11 w-full sm:w-56"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">{m.all}</SelectItem>{branches.filter(b=>b.id).map(b=><SelectItem key={b.id} value={b.id}>{b.label||b.name||b.key}</SelectItem>)}</SelectContent></Select>}
  </div><p className="text-xs text-muted-foreground" dir="ltr">{range.from} — {range.to}</p>
  {!activeRestaurant?.id||scope.error?<PortalDataState missing/>:query.isLoading?<PortalDataState loading/>:!ready?<PortalDataState onRetry={refresh}/>:<>
  <p className="rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-950 dark:bg-blue-950 dark:text-blue-100">{m.basis}</p>
  <p className="text-xs text-muted-foreground">{report.summary.movementCount} {m.movements} · {report.summary.closingCount} {m.closings}{query.isFetching?` · ${m.loading}`:''}</p>
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{metric(m.inflow,report.summary.totalCashIn,'text-emerald-600')}{metric(m.outflow,report.summary.totalCashOut,'text-red-600')}{metric(m.net,report.summary.netCash,report.summary.netCash<0?'text-amber-700':'text-blue-600')}{metric(m.count,report.summary.latestCount,'text-foreground',report.summary.latestCountAt?`${m.asOf}: ${report.summary.latestCountAt}`:null)}</div>
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{metric(m.opening,report.summary.openingCash)}{metric(m.closing,report.summary.closingCash)}{metric(m.network,report.summary.networkSales,'text-blue-600')}{metric(m.credit,report.summary.creditSales,'text-violet-600')}</div>
  {report.summary.openingCash===null&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">{m.missing}</p>}
  {report.summary.closingCash!==null&&report.summary.closingCash<0&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{m.negative}</p>}
  <p className="text-xs leading-6 text-muted-foreground">{m.noncash}</p>
  {!report.summary.movementCount?<Card className="p-6 text-center">{m.noData}</Card>:<Card className="min-w-0 rounded-2xl p-4"><h3 className="mb-3 text-sm font-bold">{m.trend}</h3><div dir="ltr"><ResponsiveContainer width="100%" height={230}><AreaChart data={report.rows}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date" tickFormatter={v=>v.slice(5)} tick={{fontSize:10}}/><YAxis tick={{fontSize:10}}/><Tooltip formatter={value=>fmt(value)}/><Area type="linear" dataKey="runningNet" name={m.running} stroke="#2563eb" fill="#dbeafe"/></AreaChart></ResponsiveContainer></div></Card>}
  <Card className="rounded-2xl p-4"><h3 className="mb-3 font-bold">{m.sources}</h3><div className="space-y-2">{report.categories.map(r=><div key={r.key} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm"><span>{m[r.key]||m.other} <span className="text-xs text-muted-foreground">({r.count})</span></span><span dir="ltr" className="flex gap-3 tabular-nums"><span className="text-emerald-700">+{fmt(r.inflow)}</span><span className="text-red-600">−{fmt(r.outflow)}</span></span></div>)}</div></Card>
  <Card className="rounded-2xl p-4"><h3 className="mb-3 font-bold">{m.statement}</h3><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-start text-xs"><thead><tr>{[m.date,m.opening,m.inflow,m.outflow,m.closing,m.net].map(label=><th key={label} className="border-b p-2 text-start">{label}</th>)}</tr></thead><tbody>{report.rows.map(r=><tr key={r.date} className="border-b"><td className="whitespace-nowrap p-2">{r.date}</td>{[r.openCash,r.inflow,r.outflow,r.closeCash,r.net].map((value,i)=><td key={i} dir="ltr" className="whitespace-nowrap p-2 tabular-nums">{fmt(value)}</td>)}</tr>)}</tbody></table></div></Card>
  </>}
 </div>;
}
