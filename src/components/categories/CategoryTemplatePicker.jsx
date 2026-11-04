import React, {useEffect, useRef, useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {base44, supabase} from '@/api/supabaseClient';
import {useTenant} from '@/lib/TenantContext';
import {useBusinessMode} from '@/lib/BusinessModeContext';
import {useLanguage} from '@/lib/LanguageContext';
import {categoryTemplate, categoryLabel} from '@/lib/categoryTemplates/catalog';
import {installCategoryTemplate} from '@/lib/categoryTemplates/install';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription} from '@/components/ui/dialog';

export const templateCopy = {
 en:{open:'Start with 10 sample categories',title:'Customize sample categories',hint:'Choose categories and edit names before adding. Each includes two subcategories. Existing categories stay unchanged; you can edit, disable or delete added categories later.',purchase:'Restaurant and café templates organize purchased ingredients and supplies. POS food sales categories are managed separately.',add:'Add selected categories',close:'Close',all:'Select all',none:'Clear selection',name:'Category name',child:'Subcategory name',busy:'Adding…',error:'Could not finish. Some categories may already be saved. Retry safely to add the rest.',success:'Categories added. You can customize them in the category manager.',empty:'Select at least one category.',failedRead:'Could not load categories. Please retry.'},
 ar:{open:'ابدأ بـ 10 فئات نموذجية',title:'تخصيص الفئات النموذجية',hint:'اختر الفئات وعدّل أسماءها قبل الإضافة. لكل فئة فئتان فرعيتان. لن تتغير فئاتك الحالية، ويمكن تعديل الفئات المضافة أو تعطيلها أو حذفها لاحقاً.',purchase:'قوالب المطاعم والمقاهي مخصصة لمواد ومستلزمات الشراء. فئات بيع الطعام في POS مستقلة.',add:'إضافة الفئات المحددة',close:'إغلاق',all:'تحديد الكل',none:'إلغاء التحديد',name:'اسم الفئة',child:'اسم الفئة الفرعية',busy:'جارٍ الإضافة…',error:'تعذر الإكمال. ربما حُفظت بعض الفئات. أعد المحاولة بأمان لإضافة الباقي.',success:'تمت إضافة الفئات. يمكنك تخصيصها من إدارة الفئات.',empty:'اختر فئة واحدة على الأقل.',failedRead:'تعذر تحميل الفئات. أعد المحاولة.'},
 fa:{open:'شروع با ۱۰ کتگوری نمونه',title:'شخصی‌سازی کتگوری‌های نمونه',hint:'کتگوری‌ها را انتخاب و نام‌ها را پیش از افزودن ویرایش کنید. هر کتگوری دو زیرگروه دارد. کتگوری‌های موجود تغییر نمی‌کنند؛ نمونه‌های افزوده‌شده را بعداً می‌توانید ویرایش، غیرفعال یا حذف کنید.',purchase:'نمونه‌های رستورانت و کافه برای مواد و لوازم خرید هستند. کتگوری فروش غذا در POS جدا مدیریت می‌شود.',add:'افزودن کتگوری‌های انتخاب‌شده',close:'بستن',all:'انتخاب همه',none:'لغو انتخاب',name:'نام کتگوری',child:'نام زیرگروه',busy:'در حال افزودن…',error:'افزودن کامل نشد. شاید بخشی ذخیره شده باشد؛ برای افزودن باقی‌مانده با خیال راحت دوباره تلاش کنید.',success:'کتگوری‌ها افزوده شدند. از مدیریت کتگوری می‌توانید آن‌ها را تغییر دهید.',empty:'حداقل یک کتگوری انتخاب کنید.',failedRead:'کتگوری‌ها بارگذاری نشدند. دوباره تلاش کنید.'},
};
function Picker({scope, mode, lang, onClose}) {
 const c=templateCopy[lang]||templateCopy.en, qc=useQueryClient();
 const [groups,setGroups]=useState(()=>categoryTemplate(mode));
 const [selected,setSelected]=useState(()=>new Set(groups.map(g=>g.key)));
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(false);
 const alive=useRef(true), running=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const field=['ar','fa'].includes(lang)?`name_${lang}`:'name';
 const edit=(key,value,parent)=>setGroups(rows=>rows.map(row=>parent ? row.key===parent?{...row,children:row.children.map(child=>child.key===key?{...child,[field]:value}:child)}:row : row.key===key?{...row,[field]:value}:row));
 const add=async()=>{
  if(running.current)return;
  if(!selected.size){setError(true);setMessage(c.empty);return;}
  running.current=true;setBusy(true);setMessage('');setError(false);
  try {
   const chosen=groups.filter(g=>selected.has(g.key));
   if(chosen.flatMap(g=>[g,...g.children]).some(row=>!String(row[field] || '').trim()))throw new Error('Empty name');
   await installCategoryTemplate({scope,mode,groups:chosen,isCurrent:()=>alive.current,list:async()=>{
    const rows=[];
    for(let offset=0;;offset+=500){
     let query=supabase.from('product_categories').select('*').eq('restaurant_id',scope.tenant).order('id').range(offset,offset+499);
     if(scope.branch)query=query.eq('branch_id',scope.branch);
     const {data,error}=await query;if(error)throw error;
     rows.push(...data);if(data.length<500)return rows;
    }
   },create:row=>base44.entities.ProductCategory.create(row),get:id=>base44.entities.ProductCategory.get(id)});
   if(alive.current)setMessage(c.success);
  }catch{if(alive.current){setError(true);setMessage(c.error);}}
  finally{await qc.invalidateQueries({queryKey:['product_categories',scope.tenant]});running.current=false;if(alive.current)setBusy(false);}
 };
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent dir={['ar','fa'].includes(lang)?'rtl':'ltr'} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} onPointerDownOutside={e=>{if(busy)e.preventDefault();}}><DialogHeader><DialogTitle>{c.title}</DialogTitle><DialogDescription>{c.hint}</DialogDescription></DialogHeader>
 {['restaurant','cafe'].includes(mode)&&<p className="text-sm text-muted-foreground">{c.purchase}</p>}
 <fieldset disabled={busy} className="min-w-0 space-y-3">
 <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={()=>setSelected(new Set(groups.map(g=>g.key)))}>{c.all}</Button><Button type="button" variant="ghost" onClick={()=>setSelected(new Set())}>{c.none}</Button></div>
 {groups.map(group=><section key={group.key} className="space-y-2 rounded-xl border p-3"><div className="flex items-center gap-3"><input type="checkbox" aria-label={categoryLabel(group,lang)} checked={selected.has(group.key)} onChange={e=>setSelected(current=>{const next=new Set(current);if(e.target.checked)next.add(group.key);else next.delete(group.key);return next;})}/><Input aria-label={c.name} maxLength={160} value={group[field]||''} onChange={e=>edit(group.key,e.target.value)}/></div><div className="ms-7 grid gap-2 sm:grid-cols-2">{group.children.map(child=><Input key={child.key} aria-label={c.child} maxLength={160} value={child[field]||''} onChange={e=>edit(child.key,e.target.value,group.key)}/>)}</div></section>)}
 </fieldset>
 {message&&<p role={error?'alert':'status'} className={error?'text-sm text-red-600':'text-sm text-emerald-700'}>{message}</p>}
 <div className="sticky bottom-0 flex flex-wrap gap-2 bg-background py-3"><Button type="button" disabled={busy||!selected.size} onClick={add}>{busy?c.busy:c.add} ({selected.size})</Button><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{c.close}</Button></div>
 </DialogContent></Dialog>;
}
export default function CategoryTemplatePicker(){
 const {activeRestaurantId,isBranchScoped,managerBranchObject,managerBranch}=useTenant();
 const {activeMode}=useBusinessMode(),{lang}=useLanguage();
 const branch=isBranchScoped?(managerBranchObject?.id||managerBranch):null;
 const scopeKey=`${activeRestaurantId}:${branch}:${activeMode}`;
 const [opened,setOpened]=useState(null);
 const c=templateCopy[lang]||templateCopy.en;
 return <><Button type="button" variant="outline" disabled={!activeRestaurantId} onClick={()=>setOpened(scopeKey)}>{c.open}</Button>{opened===scopeKey&&<Picker key={scopeKey} scope={{tenant:activeRestaurantId,branch,branchScoped:isBranchScoped}} mode={activeMode} lang={lang} onClose={()=>setOpened(null)}/>}</>;
}
