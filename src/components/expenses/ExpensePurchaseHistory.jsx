import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { formatCurrency } from '@/lib/helpers';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Link2, AlertCircle } from 'lucide-react';
import { expenseInvoiceHistoryModel, nextExpenseHistoryMonthStart } from '@/lib/expensePurchaseHistory';

const locales={
  en:{
    title:'Purchase invoice expense history',help:'Posted purchase invoices classified as fixed/variable expense references. These entries are NOT new Expense transactions and are excluded from the recorded expense totals above.',
    noHistory:'No posted purchase invoices linked to expense types in this month.',
    loading:'Loading purchase history…',error:'Purchase invoice history could not be loaded. Check purchasing permissions and refresh.',
    fixed:'Fixed monthly',variable:'Variable / occasional',invoice:'Purchase invoice',
    invoiced:'Invoice purchase',linked:'Linked to existing expense',
    existing:'Existing recorded Expense',categoryOnly:'Categorized purchase · no new Expense created',
    note:'Purchase amount is not added to Expenses again. See Purchases for actual invoice/payment.',
    showAll:'Show all',showLess:'Show fewer',paid:'Paid',partial:'Part paid',approved:'Approved',
  },
  ar:{
    title:'سجل الفواتير المرتبطة بالمصروفات',help:'فواتير الشراء المعتمدة المرتبطة بتصنيف مصروف ثابت أو متغير. هذه سجلات مرجعية وليست مصروفات جديدة ولا تُضاف مجدداً لإجمالي المصروفات أعلاه.',
    noHistory:'لا توجد فواتير شراء معتمدة مرتبطة بمصروفات في هذا الشهر.',
    loading:'جارٍ تحميل سجل الفواتير…',error:'تعذر تحميل السجل. راجع صلاحيات المشتريات ثم حدّث الصفحة.',
    fixed:'ثابت شهري',variable:'متغير / حسب الحاجة',invoice:'فاتورة مشتريات',
    invoiced:'مبلغ فاتورة الشراء',linked:'مرتبط بمصروف مسجل',
    existing:'المصروف المسجل سابقاً',categoryOnly:'شراء مصنف · لم يُنشأ مصروف آخر',
    note:'لا يضاف مبلغ الفاتورة للمصروفات مرة أخرى. راجع المشتريات لمعرفة الدفعات.',
    showAll:'عرض الكل',showLess:'عرض أقل',paid:'مدفوع',partial:'مدفوع جزئياً',approved:'معتمد',
  },
  fa:{
    title:'تاریخچهٔ فاکتورهای مرتبط با مصارف',help:'فاکتورهای خرید نهایی که به مصرف ثابت یا متغیر وصل شده‌اند. این‌ها سند مصرف تازه نیستند و به مجموع مصرف واقعی بالا دوباره جمع نمی‌شوند.',
    noHistory:'در این ماه فاکتور خرید نهایی مرتبط با مصارف ثبت نشده است.',
    loading:'تاریخچهٔ خرید دریافت می‌شود…',error:'دریافت تاریخچهٔ فاکتور ممکن نشد. مجوز Purchases را بررسی کرده و Refresh کن.',
    fixed:'ثابت ماهانه',variable:'متغیر / موردی',invoice:'فاکتور خرید',
    invoiced:'مبلغ فاکتور خرید',linked:'وصل به سند مصرف قبلی',
    existing:'مبلغ سند مصرف قبلی',categoryOnly:'خرید دسته‌بندی‌شده · مصرف جدید ساخته نشده',
    note:'مبلغ فاکتور به Expense دوباره اضافه نمی‌شود؛ جزئیات پرداخت در Purchases است.',
    showAll:'نمایش همه',showLess:'نمایش کمتر',paid:'پرداخت شده',partial:'پرداخت جزئی',approved:'تأیید شده',
  },
};
export default function ExpensePurchaseHistory({
  restaurantId,branchId,branchKey,isAllBranches,month,type,categoryId,
  categories=[],expenses=[],currency='SAR',
}) {
  const { lang }=useLanguage();
  const copy=locales[lang]||locales.en;
  const [expanded,setExpanded]=useState(false);
  const nextMonth=nextExpenseHistoryMonthStart(month);
  const {data:invoices=[],isPending,isError}=useQuery({
    queryKey:['expense_purchase_invoice_history',restaurantId,isAllBranches?'all':branchId,branchKey,month],
    enabled:Boolean(restaurantId&&nextMonth&&(isAllBranches||(branchId&&branchKey))),
    queryFn:async()=>{
      const base=()=>supabase.from('supplier_invoices')
        .select('id,invoice_number,date,branch,branch_id,restaurant_id,expense_id,expense_category_id,total_amount,paid_amount,status,approval_status,supplier_name,currency')
        .eq('restaurant_id',restaurantId)
        .gte('date',month+'-01').lt('date',nextMonth)
        .in('status',['approved','paid','partial'])
        .or('expense_id.not.is.null,expense_category_id.not.is.null')
        .order('date',{ascending:false}).limit(1000);
      if(isAllBranches){
        const {data,error}=await base();
        if(error)throw error;
        return data||[];
      }
      const [canonical,legacy]=await Promise.all([
        base().eq('branch_id',branchId),
        base().is('branch_id',null).eq('branch',branchKey),
      ]);
      if(canonical.error||legacy.error)throw canonical.error||legacy.error;
      return [...new Map([...(canonical.data||[]),...(legacy.data||[])]
        .map(record=>[record.id,record])).values()];
    },
    staleTime:15000,
    refetchInterval:60000,
  });
  const records=expenseInvoiceHistoryModel(invoices,expenses,categories,{month,type,categoryId});
  const shown=expanded?records:records.slice(0,5);
  const categoryLabel=cat=>cat?(lang==='ar'?(cat.name_ar||cat.name):
    lang==='fa'?(cat.name_fa||cat.name):cat.name):'—';
  const statusLabel=state=>copy[state]||state;
  return <Card data-testid="expense-purchase-history" className="mb-4 space-y-3 border-blue-200 p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <FileText className="h-4 w-4 text-blue-600"/>{copy.title}
      </h3>
      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700" data-testid="expense-purchase-history-count">
        {records.length}
      </span>
    </div>
    <p className="text-xs leading-5 text-muted-foreground">{copy.help}</p>
    {isPending?<p role="status" className="text-sm text-slate-500">{copy.loading}</p>
      :isError?<p role="alert" className="flex items-center gap-2 text-sm text-red-700"><AlertCircle className="h-4 w-4"/>{copy.error}</p>
      :records.length===0?<p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{copy.noHistory}</p>
      :<div className="space-y-2">
        {shown.map(record=><div key={record.id} data-testid="expense-purchase-history-record"
            className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="min-w-0 break-all text-sm text-slate-950">{copy.invoice}: {record.invoiceNumber||record.invoiceId}</strong>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">{statusLabel(record.status)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-600">{record.date} · {record.supplierName||'—'}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${record.type==='fixed'?'bg-blue-50 text-blue-700':'bg-amber-50 text-amber-700'}`}>
              {record.type==='fixed'?copy.fixed:copy.variable} · {categoryLabel(record.category)}
            </span>
            <strong className="tabular-nums text-sm text-slate-900">{copy.invoiced}: {record.invoiceAmount===null?'—':formatCurrency(record.invoiceAmount,currency)}</strong>
          </div>
          <div className="mt-2 flex items-start gap-1.5 text-xs text-slate-600">
            <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600"/>
            {record.expenseId?
              <span>{copy.linked} · {copy.existing}: {record.originalExpenseAmount===null?'—':formatCurrency(record.originalExpenseAmount,currency)}
                {record.originalExpenseDate?` · ${record.originalExpenseDate}`:''}</span>
              :<span>{copy.categoryOnly}</span>}
          </div>
        </div>)}
        {records.length>5&&<Button type="button" variant="outline" size="sm"
          onClick={()=>setExpanded(v=>!v)}>{expanded?copy.showLess:`${copy.showAll} (${records.length})`}</Button>}
      </div>}
    <p className="text-[11px] leading-4 text-amber-800">{copy.note}</p>
  </Card>;
}
