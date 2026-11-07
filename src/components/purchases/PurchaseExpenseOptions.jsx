import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, AlertTriangle, Link2 } from 'lucide-react';
import { expenseAllocationFields, invalidateExpenseClosingContext } from '@/lib/expenseConfiguration';
import { invoiceExpenseLinkInput } from '@/lib/expenseInvoiceMonthly';

const textByLanguage={
  en:{
    title:'Expense reference (optional)',record:'Previously recorded expense',none:'No expense record linked',
    category:'Expense type / category',noCategory:'No expense type',addType:'Create a new expense type',
    newTitle:'Quick-create an expense type',newName:'Name (e.g. electricity, rent, maintenance)',
    fixed:'Fixed monthly',variable:'Variable / occasional',monthly:'Configured monthly budget (SAR)',
    allocation:'Allocation days',cancel:'Cancel',create:'Save type',saving:'Saving…',loading:'Loading records…',
    empty:'No expense records exist in this branch yet. Create a type here or record the actual payment on Expenses.',
    note:'This is only an accounting reference. It does not add invoice charges, create a payment, or post another expense.',
    selected:'Linked expense',change:'Clear linked expense before choosing another type.',
    invalid:'Select a receiving branch before linking expenses.',error:'Expense reference could not be loaded.',
    duplicate:'This type already exists. Please select it from the dropdown.',
  },
  ar:{
    title:'ربط المصروف (اختياري)',record:'مصروف مسجل سابقاً',none:'دون ربط بسجل مصروف',
    category:'نوع المصروف / التصنيف',noCategory:'بلا نوع مصروف',addType:'إنشاء نوع مصروف جديد',
    newTitle:'إنشاء نوع مصروف بسرعة',newName:'الاسم (مثل الكهرباء، الإيجار، الصيانة)',
    fixed:'ثابت شهري',variable:'متغير / عند الحاجة',monthly:'الميزانية الشهرية المحددة (ر.س)',
    allocation:'أيام التوزيع',cancel:'إلغاء',create:'حفظ النوع',saving:'جارٍ الحفظ…',loading:'جارٍ تحميل السجلات…',
    empty:'لا توجد مصروفات مسجلة لهذا الفرع. أنشئ نوعاً هنا أو سجل الدفع الفعلي من صفحة المصروفات.',
    note:'الربط مرجع محاسبي فقط؛ لا يضيف تكلفة للفاتورة، ولا ينشئ دفعة أو مصروفاً ثانياً.',
    selected:'المصروف المرتبط',change:'أزل ربط المصروف أولاً لتغيير النوع.',
    invalid:'اختر فرع الاستلام قبل ربط المصروف.',error:'تعذر جلب المصروفات.',
    duplicate:'هذا النوع موجود بالفعل. اختره من القائمة.',
  },
  fa:{
    title:'ارتباط با مصرف (اختیاری)',record:'سند مصرف ثبت‌شده',none:'بدون ارتباط با سند مصرف',
    category:'نوع / دستهٔ مصرف',noCategory:'بدون نوع مصرف',addType:'ساخت نوع مصرف جدید',
    newTitle:'ساخت سریع نوع مصرف',newName:'نام (مثلاً برق، کرایه، ترمیمات)',
    fixed:'ثابت ماهانه',variable:'متغیر / موردی',monthly:'بودجهٔ ماهانهٔ تنظیم‌شده (ریال)',
    allocation:'روزهای تخصیص',cancel:'لغو',create:'ذخیره نوع',saving:'ذخیره می‌شود…',loading:'در حال دریافت رکوردها…',
    empty:'برای این شعبه سند مصرف پیدا نشد. نوع جدید بساز یا پرداخت واقعی را از صفحهٔ Expenses ثبت کن.',
    note:'این فقط ارتباط حسابداری است؛ مبلغ فاکتور را تغییر نمی‌دهد و مصرف یا پرداخت تازه ثبت نمی‌کند.',
    selected:'سند مصرف مرتبط',change:'برای تغییر نوع، نخست ارتباط سند مصرف را بردارید.',
    invalid:'اول شعبهٔ دریافت‌کننده را انتخاب کنید.',error:'دریافت اسناد مصرف ممکن نشد.',
    duplicate:'این نوع از قبل وجود دارد. از فهرست انتخابش کنید.',
  },
};

export default function PurchaseExpenseOptions({
  restaurantId,branchId,branchKey,value,onChange,disabled=false,
}){
  const {lang}=useLanguage();
  const tr=textByLanguage[lang]||textByLanguage.en;
  const qc=useQueryClient();
  const [creating,setCreating]=useState(false);
  const [name,setName]=useState('');
  const [isFixed,setIsFixed]=useState(false);
  const [monthlyAmount,setMonthlyAmount]=useState('');
  const [days,setDays]=useState('30');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const {data:categories=[],isError:catsError}=useQuery({
    queryKey:['purchase-expense-categories',restaurantId],
    enabled:Boolean(restaurantId),
    queryFn:async()=>{
      const {data,error}=await supabase.from('expense_categories')
        .select('id,name,name_ar,name_fa,expense_type,is_fixed,monthly_amount,branch_id,is_active')
        .eq('restaurant_id',restaurantId).order('name').limit(500);
      if(error)throw error;
      return data||[];
    },staleTime:30000,
  });
  const {data:records=[],isError:recordsError,isPending:recordsPending}=useQuery({
    queryKey:['purchase-existing-expenses',restaurantId,branchId,branchKey],
    enabled:Boolean(restaurantId&&branchId&&branchKey),
    queryFn:async()=>{
      const read=()=>supabase.from('expenses')
        .select('id,date,description,amount,category_id,expense_category_id,branch_id,branch_key')
        .eq('restaurant_id',restaurantId)
        .order('date',{ascending:false}).limit(100);
      const [current,legacy]=await Promise.all([
        read().eq('branch_id',branchId),
        read().is('branch_id',null).eq('branch_key',branchKey),
      ]);
      if(current.error||legacy.error)throw current.error||legacy.error;
      return [...new Map([...(current.data||[]),...(legacy.data||[])].map(row=>[row.id,row])).values()]
        .sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,200);
    },staleTime:30000,
  });
  const chosen=records.find(row=>row.id===value?.expense_id);
  const allowedCategories=useMemo(()=>categories.filter(cat=>
    (cat.is_active!==false||cat.id===value?.expense_category_id)
    && (!cat.branch_id||cat.branch_id===branchId)
  ),[categories,branchId,value?.expense_category_id]);
  const categoryName=cat=>lang==='ar'?(cat.name_ar||cat.name):lang==='fa'?(cat.name_fa||cat.name):cat.name;
  const readableRecord=rec=>{
    const category=categories.find(cat=>cat.id===(rec.expense_category_id||rec.category_id));
    return [rec.date,rec.description||category?.name||'—', 'SAR '+Number(rec.amount||0).toLocaleString(undefined,{maximumFractionDigits:2})].join(' · ');
  };
  const saveType=async()=>{
    if(!restaurantId||!branchId||!String(name).trim()||saving)return;
    setError('');
    try {
      const duplicate=categories.find(cat=>cat.name?.trim().toLocaleLowerCase()===name.trim().toLocaleLowerCase()
        && (!cat.branch_id||cat.branch_id===branchId));
      if(duplicate){setError(tr.duplicate);return;}
      const allocation=expenseAllocationFields({
        is_fixed:isFixed,monthly_amount:isFixed?monthlyAmount:0,
        allocation_days:days,
      },branchId);
      setSaving(true);
      const {data,error:insertError}=await supabase.from('expense_categories')
        .insert({restaurant_id:restaurantId,branch_id:branchId,
          name:name.trim().slice(0,120),is_active:true,color:isFixed?'#3b82f6':'#f59e0b',
          ...allocation}).select('id').single();
      if(insertError)throw insertError;
      await qc.invalidateQueries({queryKey:['purchase-expense-categories',restaurantId]});
      await qc.invalidateQueries({queryKey:['expense_categories']});
      await qc.invalidateQueries({queryKey:['expense_categories_dash']});
      invalidateExpenseClosingContext(qc);
      onChange({expense_id:null,expense_category_id:data.id});
      setCreating(false);setName('');setMonthlyAmount('');setDays('30');
    }catch(err){setError(err?.message||tr.error);}finally{setSaving(false);}
  };
  return <div className="space-y-3 text-sm" dir={lang==='en'?'ltr':'rtl'}>
    <p className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
      <Link2 className="mt-0.5 h-4 w-4 shrink-0"/>{tr.note}
    </p>
    {!branchId ? <p role="alert" className="text-amber-700">{tr.invalid}</p> :
      <div>
        <Label className="mb-1.5 block">{tr.record}</Label>
        <Select disabled={disabled||recordsError} value={value?.expense_id||'none'}
          onValueChange={id=>{
            const record=records.find(row=>row.id===id);
            onChange(invoiceExpenseLinkInput(record||null,id==='none'?value?.expense_category_id:null));
          }}>
          <SelectTrigger className="h-11 rounded-xl bg-white"><SelectValue placeholder={tr.none}/></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{tr.none}</SelectItem>
            {records.map(row=><SelectItem key={row.id} value={row.id}>
              <span className="max-w-[280px] truncate">{readableRecord(row)}</span>
            </SelectItem>)}
          </SelectContent>
        </Select>
        {chosen && <p className="mt-1 text-xs text-slate-600">{tr.selected}: {readableRecord(chosen)}</p>}
        {recordsPending && <p className="mt-1 text-xs text-slate-500">{tr.loading}</p>}
        {!recordsPending&&!records.length&&!recordsError&&<p className="mt-1 text-xs text-slate-500">{tr.empty}</p>}
      </div>
    }
    <div>
      <Label className="mb-1.5 block">{tr.category}</Label>
      <Select disabled={disabled||!branchId||Boolean(value?.expense_id)||catsError}
        value={value?.expense_category_id||'none'}
        onValueChange={id=>{
          if(id==='new'){setCreating(true);return;}
          onChange({expense_id:null,expense_category_id:id==='none'?null:id});
        }}>
        <SelectTrigger className="h-11 rounded-xl bg-white"><SelectValue placeholder={tr.noCategory}/></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{tr.noCategory}</SelectItem>
          {allowedCategories.map(cat=><SelectItem key={cat.id} value={cat.id}>
            {categoryName(cat)} · {cat.is_fixed||cat.expense_type==='fixed'?tr.fixed:tr.variable}
          </SelectItem>)}
          <SelectItem value="new">＋ {tr.addType}</SelectItem>
        </SelectContent>
      </Select>
      {value?.expense_id&&<p className="mt-1 text-xs text-slate-500">{tr.change}</p>}
      {!value?.expense_id&&<Button type="button" variant="ghost" size="sm" disabled={disabled||!branchId}
        onClick={()=>setCreating(true)} className="mt-1 gap-1 px-1 text-blue-700">
        <Plus className="h-3.5 w-3.5"/>{tr.addType}
      </Button>}
    </div>
    {creating&&!value?.expense_id&&<div className="space-y-3 rounded-xl border border-blue-200 bg-white p-3">
      <strong className="block">{tr.newTitle}</strong>
      <Input value={name} maxLength={120} placeholder={tr.newName}
        onChange={e=>setName(e.target.value)} disabled={saving}/>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant={isFixed?'default':'outline'} disabled={saving}
          onClick={()=>setIsFixed(true)}>{tr.fixed}</Button>
        <Button type="button" variant={!isFixed?'default':'outline'} disabled={saving}
          onClick={()=>setIsFixed(false)}>{tr.variable}</Button>
      </div>
      {isFixed&&<div className="grid grid-cols-2 gap-2">
        <div><Label>{tr.monthly}</Label><Input type="number" min="0" step="0.01" value={monthlyAmount}
          onChange={e=>setMonthlyAmount(e.target.value)} disabled={saving}/></div>
        <div><Label>{tr.allocation}</Label><Input type="number" min="1" max="366" step="1"
          value={days} onChange={e=>setDays(e.target.value)} disabled={saving}/></div>
      </div>}
      {error&&<p role="alert" className="flex items-center gap-1 text-xs text-red-700">
        <AlertTriangle className="h-4 w-4"/>{error}</p>}
      <div className="flex gap-2">
        <Button type="button" disabled={saving||!name.trim()} onClick={saveType}>{saving?tr.saving:tr.create}</Button>
        <Button type="button" variant="outline" disabled={saving} onClick={()=>{setCreating(false);setError('');}}>{tr.cancel}</Button>
      </div>
    </div>}
    {(catsError||recordsError)&&<p role="alert" className="text-xs text-red-600">{tr.error}</p>}
  </div>;
}
