import React,{useMemo,useRef,useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {useAuth} from '@/lib/AuthContext';
import {useTenant} from '@/lib/TenantContext';
import {useLanguage} from '@/lib/LanguageContext';
import {useRole} from '@/lib/RoleContext';
import {supabase} from '@/api/supabaseClient';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Card,CardContent} from '@/components/ui/card';
import PortalOrderInbox from '@/components/portal-orders/PortalOrderInbox';
import {portalOrderCategories, selectedPortalCategory, filterPortalOrderProducts, PORTAL_ORDER_ALL} from '@/lib/portalOrderCategories';

const copy={
 en:{title:'Customer order intake',intro:'Send a customer request to the manager or directly to the kitchen. This does not take payment or post sales.',enabled:'Order intake is disabled for this portal. Your Owner can enable it here.',destination:'Destination',manager:'Manager review',kitchen:'Kitchen directly',items:'Food / Products',category:'Food category',allCategories:'All categories',selectedItems:'Selected items',search:'Search food',quantity:'Quantity',add:'Add',remove:'Remove',customer:'Customer reference (optional)',notes:'Preparation / delivery notes',submit:'Send order',sending:'Sending…',success:'Order request delivered',history:'Your requests',total:'Menu quote (not paid)',empty:'No products configured for this branch',owner:'Owner configuration · Enable per portal',settings:'Save access',roles:'Portal',failure:'Could not load order intake. No order submitted.',retry:'Retry',notice:'Request only: no sales closing, payment, receipt or inventory movement. Cashier confirms payment in POS.',choose:'Select one or more products.',waiting:'Awaiting manager',disabled:'No enabled destination',stock:'Availability is confirmed by manager/kitchen.',branch:'Branch'},
 ar:{title:'إرسال طلب العميل',intro:'أرسل طلب العميل إلى المدير أو مباشرة إلى المطبخ؛ دون تسجيل بيع أو دفع.',enabled:'إرسال الطلبات غير مفعل لهذه البوابة. يمكن للمالك تفعيله.',destination:'الجهة المستلمة',manager:'موافقة المدير',kitchen:'إلى المطبخ مباشرة',items:'الأصناف',category:'تصنيف الأطعمة',allCategories:'جميع التصنيفات',selectedItems:'الأصناف المختارة',search:'بحث عن صنف',quantity:'الكمية',add:'إضافة',remove:'حذف',customer:'مرجع العميل (اختياري)',notes:'تعليمات الطلب أو التوصيل',submit:'إرسال الطلب',sending:'جار الإرسال…',success:'تم إرسال الطلب',history:'طلباتي',total:'تقدير السعر (غير مدفوع)',empty:'لا توجد أصناف لهذه الفرع',owner:'إعدادات المالك · تفعيل البوابات',settings:'حفظ الصلاحيات',roles:'البوابة',failure:'تعذّر تحميل الخدمة ولم يُرسل طلب.',retry:'إعادة المحاولة',notice:'طلب غير محاسبي؛ الدفع والفاتورة والمخزون عبر الكاشير فقط.',choose:'اختر منتجاً واحداً على الأقل.',waiting:'بانتظار المدير',disabled:'لا توجد جهة مفعّلة',stock:'يؤكد المدير/المطبخ توفر الصنف.',branch:'الفرع'},
 fa:{title:'ثبت سفارش مشتری',intro:'سفارش مشتری را به مدیر یا مستقیم به مطبخ بفرستید؛ بدون ثبت فروش یا پرداخت.',enabled:'سفارش‌فرستی برای این پورتل فعال نیست؛ مالک می‌تواند فعال کند.',destination:'مقصد سفارش',manager:'تأیید مدیر',kitchen:'مستقیم به مطبخ',items:'غذاها / محصولات',category:'دسته‌بندی غذاها',allCategories:'تمام دسته‌ها',selectedItems:'غذاهای انتخاب‌شده',search:'جستجوی غذا',quantity:'تعداد',add:'افزودن',remove:'حذف',customer:'مشخصات کوتاه مشتری (اختیاری)',notes:'یادداشت پخت یا تحویل',submit:'ارسال سفارش',sending:'در حال ارسال…',success:'درخواست سفارش ارسال شد',history:'سفارش‌های من',total:'قیمت تقریبی منو (پرداخت نشده)',empty:'غذا/محصول برای این شعبه تنظیم نشده',owner:'تنظیمات مالک · فعال‌سازی هر پورتل',settings:'ذخیره دسترسی',roles:'پورتل',failure:'بارگذاری سفارش‌ها ناموفق؛ هیچ سفارشی ارسال نشده.',retry:'دوباره کوشش',notice:'این درخواست فروش مالی نیست. پرداخت و ثبت موجودی فقط از مسیر صندوق POS انجام می‌شود.',choose:'حداقل یک غذا انتخاب کنید.',waiting:'منتظر مدیر',disabled:'مقصد فعال نیست',stock:'موجودی توسط مدیر/مطبخ بررسی شود.',branch:'شعبه'},
};
const roleLabels={owner:'Owner',manager:'Manager',employee:'Employee',driver:'Driver',supplier:'Supplier',customer:'Customer'};
async function rpc(name,args){const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data;}
function OwnerSettings({rows,restaurantId,restaurantMode,lang,t,onSaved}){
 const [draft,setDraft]=useState({});
 const [saving,setSaving]=useState('');
 const [error,setError]=useState('');
 const current=role=>(draft[role]||rows.find(row=>row.role===role)||{allow_manager:false,allow_kitchen:false});
 const update=(role,key,value)=>setDraft(previous=>({...previous,[role]:{...current(role),[key]:value}}));
 const save=async role=>{
  setSaving(role);setError('');
  const setting=current(role);
  try{
   await rpc('erp_portal_order_configure',{p_restaurant_id:restaurantId,p_role:role,
    p_allow_manager:!!setting.allow_manager,p_allow_kitchen:!!setting.allow_kitchen});
   onSaved();setDraft(previous=>{const next={...previous};delete next[role];return next;});
  }catch(e){setError(e?.message||t.failure);}finally{setSaving('');}
 };
 return <details data-testid="portal-order-owner-settings" className="rounded-2xl border border-blue-200 bg-white p-4">
  <summary className="cursor-pointer text-base font-black">{t.owner}</summary>
  {error&&<p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
  <div className="mt-4 space-y-3">{rows.map(row=>{const v=current(row.role);return <div key={row.role}
   className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3 sm:grid-cols-[120px_1fr_auto]">
   <strong className="text-sm">{roleLabels[row.role]||row.role}</strong>
   <div className="flex flex-wrap gap-4">
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!v.allow_manager} onChange={e=>update(row.role,'allow_manager',e.target.checked)}/>{t.manager}</label>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!v.allow_kitchen} disabled={!restaurantMode} onChange={e=>update(row.role,'allow_kitchen',e.target.checked)}/>{t.kitchen}</label>
   </div>
   <Button size="sm" type="button" disabled={!!saving} onClick={()=>save(row.role)}>{saving===row.role?'…':t.settings}</Button>
  </div>})}</div>
 </details>;
}
export default function PortalOrderDispatch(){
 const {user}=useAuth();
 const {activeRestaurant,branches=[]}=useTenant();
 const {can}=useRole();
 const {lang='en',isRTL=false}=useLanguage();
 const t=copy[lang]||copy.en;
 const qc=useQueryClient();
 const isOwner=user?.role==='owner';
 const [branchChoice,setBranchChoice]=useState('');
 const ownerBranch=branches.find(b=>b.id===branchChoice)||branches[0]||null;
 const restaurantId=isOwner?activeRestaurant?.id:null;
 const branchId=isOwner?ownerBranch?.id:null;
 const context=useQuery({queryKey:['portal-order-context',user?.id,restaurantId,branchId],
  queryFn:()=>rpc('erp_portal_order_context',{p_restaurant_id:restaurantId||null,p_branch_id:branchId||null}),
  enabled:Boolean(user?.id&&(!isOwner||(restaurantId&&branchId))),retry:1,refetchInterval:12000,refetchOnWindowFocus:true});
 const data=context.data;
 const [destination,setDestination]=useState('manager');
 const [chosen,setChosen]=useState({});
 const [search,setSearch]=useState('');
 const [categoryChoice,setCategoryChoice]=useState('');
 const [customer,setCustomer]=useState('');
 const [notes,setNotes]=useState('');
 const [error,setError]=useState('');
 const requestId=useRef(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'');
 const canManager=data?.allow_manager===true, canKitchen=data?.allow_kitchen===true;
 const chosenDestination=destination==='kitchen'&&canKitchen?'kitchen':canManager?'manager':canKitchen?'kitchen':null;
 const catalog=Array.isArray(data?.catalog)?data.catalog:[];
 const categories=portalOrderCategories(catalog,lang);
 const activeCategory=selectedPortalCategory(categories,categoryChoice);
 const visible=filterPortalOrderProducts(catalog,activeCategory,search);
 const lines=Object.entries(chosen).filter(([,n])=>n>0).map(([id,n])=>({id,quantity:n})).filter(row=>catalog.some(p=>p.id===row.id));
 const selected=useMemo(()=>lines.map(line=>{const product=catalog.find(p=>p.id===line.id);return {...line,product};}),[catalog,chosen]);
 const total=selected.reduce((sum,row)=>sum+Number(row.product?.price||0)*row.quantity,0);
 const canSend=Boolean(chosenDestination&&selected.length&&selected.length<=25&&selected.reduce((n,r)=>n+r.quantity,0)<=100);
 const submit=useMutation({
  mutationFn:()=>rpc('erp_portal_order_submit',{
   p_restaurant_id:data.restaurant_id,p_branch_id:data.branch_id,
   p_request_id:requestId.current,p_recipient:chosenDestination,
   p_items:lines,p_customer_reference:customer.trim(),p_notes:notes.trim(),
  }),
  onSuccess:result=>{
   setError('');setChosen({});setNotes('');setCustomer('');setSearch('');
   requestId.current=crypto.randomUUID();
   qc.invalidateQueries({queryKey:['portal-order-context']});
   qc.invalidateQueries({queryKey:['portal-order-inbox']});
  },
  onError:e=>setError(e?.message||t.failure),
 });
 const adjust=(id,step)=>{if(submit.isPending)return;requestId.current=crypto.randomUUID();setChosen(prev=>{
  const old=prev[id]||0;const value=Math.max(0,Math.min(20,old+step));return {...prev,[id]:value};
 });};
 const allowed=canManager||canKitchen;
 const manageInbox=(data?.role==='owner'||data?.role==='manager'||(data?.role==='employee'&&can?.viewOrders));
 return <main dir={isRTL?'rtl':'ltr'} aria-label={t.title} data-testid="portal-order-dispatch" className="mx-auto max-w-6xl space-y-4 pb-28 text-slate-950">
  <header className="rounded-2xl bg-blue-950 p-4 text-white"><h1 className="text-xl font-black">{t.title}</h1><p className="mt-1 text-xs text-blue-100">{t.intro}</p></header>
  {isOwner&&branches.length>1&&<label className="block rounded-xl border bg-white p-3 text-sm font-bold">{t.branch}
   <select className="ms-2 min-h-11 rounded-lg border px-3" value={ownerBranch?.id||''} onChange={e=>{setBranchChoice(e.target.value);setChosen({});setCategoryChoice('');setSearch('');requestId.current=crypto.randomUUID();}}>
    {branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
   </select></label>}
  {context.isPending&&<p role="status" className="rounded-xl bg-white p-5">…</p>}
  {context.isError&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{t.failure}<Button type="button" className="ms-3" variant="outline" onClick={()=>context.refetch()}>{t.retry}</Button></div>}
  {isOwner&&data?.role_settings?.length>0&&<OwnerSettings key={data.restaurant_id}
   rows={data.role_settings} restaurantId={data.restaurant_id} restaurantMode={data.restaurant_mode}
   lang={lang} t={t} onSaved={()=>context.refetch()}/>}
  {data&&!allowed&&<p data-testid="portal-order-disabled" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t.enabled}</p>}
  {data&&allowed&&<section data-testid="portal-order-entry" className="space-y-4 rounded-2xl border bg-white p-4">
   <div className="rounded-lg bg-amber-50 p-3 text-xs font-medium leading-5 text-amber-900">{t.notice}</div>
   <label className="block text-sm font-bold">{t.destination}
    <select className="mt-1 min-h-12 w-full rounded-xl border px-3" value={chosenDestination||''}
     onChange={e=>{setDestination(e.target.value);requestId.current=crypto.randomUUID();}}>
     {canManager&&<option value="manager">{t.manager}</option>}
     {canKitchen&&<option value="kitchen">{t.kitchen}</option>}
    </select>
   </label>
   <label className="block text-sm font-bold" data-testid="portal-order-category-picker">
    {t.category}
    <select aria-label={t.category} data-testid="portal-order-category-select"
      className="mt-1 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-950"
      value={activeCategory} onChange={e=>{setCategoryChoice(e.target.value);setSearch('');}}>
      <option value={PORTAL_ORDER_ALL}>{t.allCategories} ({catalog.length})</option>
      {categories.map(group=><option value={group.key} key={group.key}>{group.label} ({group.count})</option>)}
    </select>
   </label>
   <Input aria-label={t.search} placeholder={t.search} value={search} onChange={e=>setSearch(e.target.value)} className="h-12 text-base"/>
   <div className="grid max-h-[46dvh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
    {visible.map(item=><div key={item.id} className="flex min-h-16 items-center justify-between gap-3 rounded-xl border p-3">
     <div className="min-w-0"><strong className="block break-words text-sm">{item['name_'+lang]||item.name}</strong><p dir="ltr" className="text-xs text-slate-500">{Number(item.price).toFixed(2)}</p></div>
     <div className="flex shrink-0 items-center gap-2">
      <button type="button" className="h-11 w-11 rounded-lg border text-lg font-bold" aria-label={t.remove+' '+item.name} onClick={()=>adjust(item.id,-1)}>−</button>
      <span className="w-5 text-center font-bold">{chosen[item.id]||0}</span>
      <button type="button" className="h-11 w-11 rounded-lg bg-blue-600 text-lg font-black text-white" aria-label={t.add+' '+item.name} onClick={()=>adjust(item.id,1)}>+</button>
     </div>
    </div>)}
   </div>
   {catalog.length===0&&<p className="text-sm text-slate-500">{t.empty}</p>}
   {catalog.length>0&&visible.length===0&&<p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">{t.empty}</p>}
   {selected.length>0&&<div data-testid="portal-order-selected-items" className="rounded-xl border border-blue-200 bg-blue-50 p-3">
     <h3 className="mb-2 text-sm font-black text-blue-950">{t.selectedItems} · {selected.reduce((n,row)=>n+row.quantity,0)}</h3>
     <div className="flex flex-wrap gap-2">{selected.map(row=><div key={row.id} className="flex min-h-9 items-center gap-2 rounded-lg bg-white px-3 text-xs font-semibold text-slate-900">
       <span>{row.product?.['name_'+lang]||row.product?.name} ×{row.quantity}</span>
       <button type="button" aria-label={t.remove+' '+(row.product?.name||'')} onClick={()=>adjust(row.id,-row.quantity)}
         className="h-9 w-9 rounded-lg border border-rose-200 text-base font-bold text-rose-700">×</button>
     </div>)}</div>
   </div>}
   <Input aria-label={t.customer} maxLength={100} placeholder={t.customer} value={customer} onChange={e=>{setCustomer(e.target.value);requestId.current=crypto.randomUUID();}} className="h-12 text-base"/>
   <textarea aria-label={t.notes} maxLength={500} value={notes} onChange={e=>{setNotes(e.target.value);requestId.current=crypto.randomUUID();}}
    placeholder={t.notes} className="min-h-20 w-full rounded-xl border p-3 text-base"/>
   <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-50 p-3">
    <div><strong className="text-sm">{selected.length} {t.items}</strong><p className="text-xs text-slate-600">{t.total}: {total.toFixed(2)}</p><p className="text-xs text-amber-700">{t.stock}</p></div>
    <Button type="button" disabled={!canSend||submit.isPending} onClick={()=>submit.mutate()}>
     {submit.isPending?t.sending:t.submit}</Button>
   </div>
   {submit.isSuccess&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{t.success} · #{String(submit.data?.id||'').slice(0,8)}</p>}
   {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
  </section>}
  {data&&<section className="rounded-2xl border bg-white p-4"><h2 className="mb-3 font-black">{t.history}</h2>
   <div className="space-y-2">{(data.my_requests||[]).map(o=><div key={o.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
    <span>#{String(o.id).slice(0,8).toUpperCase()} · {o.recipient}</span><strong>{o.status.replaceAll('_',' ')}</strong>
   </div>)}</div>
  </section>}
  {data&&manageInbox&&<PortalOrderInbox restaurantId={data.restaurant_id} branchId={data.branch_id} lang={lang}/>}
 </main>;
}
