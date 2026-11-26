import {useState,useRef} from 'react';
import {useQuery} from '@tanstack/react-query';
import {readAllPortalRows} from '@/lib/portalReliability';
import {catalogCopy} from '@/components/suppliers/SupplierCatalogPicker';
import {supabase} from '@/api/supabaseClient';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {parseRestaurantMaterialSpreadsheet,downloadRestaurantMaterialTemplate,downloadProductImportErrors} from '@/lib/productSpreadsheet';
export const materialImportCopy=lang=>({
 en:{title:'Import raw materials',template:'Download Excel template',choose:'Choose Excel or CSV',hint:'Create only · max 500 products · existing categories, units and brands required. No opening stock or sales menu changes.',preview:'Validate preview',commit:'Create products',ready:'Ready',errors:'Errors',done:'Products created',close:'Close',retry:'Choose another file',failed:'Import failed. No success has been confirmed. Check the catalog before retrying.',report:'Download error report',working:'Processing…'},
 ar:{title:'استيراد المواد الخام',template:'تنزيل قالب إكسل',choose:'اختر إكسل أو CSV',hint:'إنشاء فقط · 500 منتج كحد أقصى · يجب تسجيل الفئات والوحدات والعلامات مسبقاً. لا تغيير للمخزون الافتتاحي أو قائمة البيع.',preview:'معاينة والتحقق',commit:'إنشاء المنتجات',ready:'جاهزة',errors:'الأخطاء',done:'تم إنشاء المنتجات',close:'إغلاق',retry:'اختر ملفاً آخر',failed:'تعذر تأكيد الاستيراد. تحقق من الدليل قبل إعادة المحاولة.',report:'تنزيل تقرير الأخطاء',working:'جارٍ المعالجة…'},
 fa:{title:'امپورت مواد اولیه',template:'دانلود قالب اکسل',choose:'انتخاب Excel یا CSV',hint:'فقط ایجاد · حداکثر ۵۰۰ محصول · دسته‌بندی، واحد و برند باید از قبل ثبت شده باشند. بدون تغییر موجودی اولیه یا منوی فروش.',preview:'اعتبارسنجی و پیش‌نمایش',commit:'ثبت محصولات',ready:'آماده',errors:'خطاها',done:'محصول ثبت شد',close:'بستن',retry:'انتخاب فایل دیگر',failed:'موفقیت امپورت تأیید نشد؛ پیش از تلاش مجدد کاتالوگ را بررسی کنید.',report:'دانلود گزارش خطا',working:'در حال پردازش…'}
}[lang]||materialImportCopy('en'));
export default function RestaurantMaterialImport({restaurantId,lang,onClose,onImported}){
 const t=materialImportCopy(lang),c=catalogCopy(lang),ref=useRef(null),lock=useRef(false);
 const [defaultSupplier,setDefaultSupplier]=useState('');
 const suppliers=useQuery({queryKey:['restaurant-import-suppliers',restaurantId],queryFn:()=>readAllPortalRows(()=>supabase.from('suppliers').select('id,name').eq('restaurant_id',restaurantId).eq('status',true).is('branch_id',null).order('id')),enabled:!!restaurantId});
 const [busy,setBusy]=useState(false),[file,setFile]=useState(null),[rows,setRows]=useState([]),[errors,setErrors]=useState([]),[ready,setReady]=useState(false),[created,setCreated]=useState(null),[message,setMessage]=useState('');
 const rpc=async(rows,file,commit)=>{
  const {data,error}=await supabase.rpc('erp_import_restaurant_materials_v2',{p_restaurant_id:restaurantId,p_rows:rows.map(r=>({...r,supplier:r.supplier||defaultSupplier})),p_file_name:file.name,p_commit:commit});
  if(error)throw error;
  if(!data||!Array.isArray(data.errors))throw Error('Invalid import response');
  return data;
 };
 const read=async f=>{
  if(!f||lock.current)return;
  lock.current=true;setBusy(true);setReady(false);setCreated(null);setErrors([]);setRows([]);setMessage('');setFile(f);
  try{
   const result=await parseRestaurantMaterialSpreadsheet(f);setRows(result.validRows);
   if(result.errors.length){setErrors(result.errors);return;}
   const data=await rpc(result.validRows,f,false);setErrors(data.errors);setReady(data.ready===result.validRows.length&&!data.errors.length);
  }catch(e){setMessage(t.failed+' '+(e.message||''));}
  finally{lock.current=false;setBusy(false);if(ref.current)ref.current.value='';}
 };
 const commit=async()=>{
  if(!ready||!file||lock.current)return;
  lock.current=true;setBusy(true);setReady(false);setMessage('');
  try{
   const data=await rpc(rows,file,true);setErrors(data.errors);
   if(!data.errors.length&&data.created===rows.length){setCreated(data.created);await onImported?.();}
   else if(!data.errors.length)setMessage(t.failed);
  }catch(e){setMessage(t.failed+' '+(e.message||''));}
  finally{lock.current=false;setBusy(false);}
 };
 return <Dialog open onOpenChange={v=>{if(!v&&!busy)onClose();}}><DialogContent dir={lang==='en'?'ltr':'rtl'} className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
 <DialogHeader><DialogTitle>{t.title}</DialogTitle><DialogDescription>{t.hint}</DialogDescription></DialogHeader>
 <div className="space-y-1"><label className="text-sm font-semibold" htmlFor="import-primary-supplier">{c.defaultSupplier}</label><select id="import-primary-supplier" value={defaultSupplier} disabled={busy||suppliers.isPending||suppliers.isError} onChange={e=>{setDefaultSupplier(e.target.value);setReady(false);setErrors([]);setRows([]);setFile(null);setCreated(null);setMessage('');}} className="h-11 w-full rounded-lg border bg-background px-2"><option value="">{c.fromFile}</option>{(suppliers.data||[]).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><p className="text-xs text-muted-foreground">{c.importHint}</p>{suppliers.isError&&<p role="alert">{c.error} <Button type="button" variant="outline" onClick={()=>suppliers.refetch()}>{c.retry}</Button></p>}</div>
 <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={downloadRestaurantMaterialTemplate}>{t.template}</Button><Button type="button" disabled={busy} onClick={()=>ref.current?.click()}>{file?t.retry:t.choose}</Button><input ref={ref} type="file" accept=".xlsx,.csv" className="hidden" onChange={e=>read(e.target.files?.[0])}/></div>
 {file&&<p className="break-all text-xs">{file.name}</p>}{busy&&<p role="status">{t.working}</p>}{message&&<p role="alert" className="break-words text-sm text-red-700">{message}</p>}
 {created!==null?<p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{created} · {t.done}</p>:<>
 {ready&&<p role="status" className="font-bold text-emerald-700">{rows.length} · {t.ready}</p>}
 {errors.length>0&&<div role="alert" className="rounded-xl border border-red-200 p-3"><p className="font-bold">{errors.length} · {t.errors}</p>{errors.slice(0,30).map((e,i)=><p key={i} className="break-words text-xs">{e.row} · {e.sku} · {e.message}</p>)}<Button type="button" variant="outline" onClick={()=>downloadProductImportErrors(errors)}>{t.report}</Button></div>}
 <div className="max-h-72 overflow-y-auto space-y-2">{rows.slice(0,50).map(r=><article key={r._rowNumber} className="rounded-lg border p-2 text-sm"><strong>{r.name}</strong><p className="text-xs text-muted-foreground">{r.sku} · {r.category} / {r.subcategory} · {r.unit} · {r.brand} · {r.supplier||(suppliers.data||[]).find(s=>s.id===defaultSupplier)?.name||c.required}</p><p className="text-xs">{r.purchase_cost} / {r.selling_price}</p></article>)}</div>
 <Button type="button" disabled={!ready||busy} onClick={commit}>{t.commit} ({rows.length})</Button></>}
 <Button type="button" variant="outline" disabled={busy} onClick={onClose}>{t.close}</Button>
 </DialogContent></Dialog>;
}
