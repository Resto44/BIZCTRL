import {useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {readAllPortalRows} from '@/lib/portalReliability';
import {restaurantMaterialFilter} from '@/lib/restaurantProducts';
import {normalizeProductBrand,cleanProductBrands} from '@/lib/productBrands';
import {fetchBrandMaster,brandLabel,brandKey} from '@/lib/productBrandMaster';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {searchPurchaseProducts} from '@/lib/purchaseInvoiceBrands';
export const catalogCopy=lang=>({
en:{title:'Supplier brands & products',hint:'Assign selected unassigned products to this supplier. Existing links are preserved; products assigned elsewhere cannot be transferred here.',search:'Search products or SKU',all:'All brands',select:'Select matching unassigned',clear:'Clear new selections',selected:'New selections',linked:'Already linked',other:'Another supplier',empty:'No matching products',loading:'Loading catalog…',error:'Could not load catalog',retry:'Retry',more:'Show more',none:'Without brand',required:'Supplier selection required',defaultSupplier:'Default primary supplier',fromFile:'Use supplier from file',importHint:'Each row must identify an active supplier by name or ID, or use the selected default. File values take priority.'},
ar:{title:'علامات ومنتجات المورد',hint:'اربط المنتجات غير المخصصة بهذا المورد. تبقى الروابط الحالية ولا تنقل منتجات مورد آخر هنا.',search:'بحث عن منتج أو رمز',all:'كل العلامات',select:'تحديد المنتجات المطابقة غير المرتبطة',clear:'مسح الاختيارات الجديدة',selected:'اختيارات جديدة',linked:'مرتبط مسبقاً',other:'مورد آخر',empty:'لا توجد منتجات مطابقة',loading:'جارٍ تحميل الدليل…',error:'تعذر تحميل الدليل',retry:'إعادة المحاولة',more:'عرض المزيد',none:'بدون علامة',required:'اختيار المورد مطلوب',defaultSupplier:'المورد الأساسي الافتراضي',fromFile:'استخدام المورد من الملف',importHint:'حدد مورداً نشطاً بالاسم أو المعرف لكل صف أو اختر المورد الافتراضي. الأولوية لقيمة الملف.'},
fa:{title:'برندها و محصولات سپلایر',hint:'محصولات بدون سپلایر را انتخاب و متصل کنید. ارتباط‌های قبلی حفظ می‌شوند؛ محصولات سپلایر دیگر اینجا منتقل نمی‌شوند.',search:'جستجوی محصول یا SKU',all:'همه برندها',select:'انتخاب همه محصولات مطابق بدون سپلایر',clear:'پاک کردن انتخاب‌های جدید',selected:'انتخاب جدید',linked:'قبلاً متصل',other:'سپلایر دیگر',empty:'محصول مطابق یافت نشد',loading:'در حال دریافت کاتالوگ…',error:'دریافت کاتالوگ ناموفق بود',retry:'تلاش دوباره',more:'نمایش بیشتر',none:'بدون برند',required:'انتخاب سپلایر ضروری است',defaultSupplier:'سپلایر اصلی پیش‌فرض',fromFile:'استفاده از سپلایر فایل',importHint:'در هر ردیف نام یا شناسه سپلایر فعال را وارد کنید یا سپلایر پیش‌فرض را انتخاب کنید. مقدار فایل اولویت دارد.'}
}[lang]||catalogCopy('en'));
export default function SupplierCatalogPicker({restaurant,restaurantId,supplierId,lang,selected,onChange,disabled}){
 const t=catalogCopy(lang),[brand,setBrand]=useState(''),[search,setSearch]=useState(''),[limit,setLimit]=useState(40);
 const products=useQuery({queryKey:['supplier-catalog-products',restaurantId],queryFn:()=>readAllPortalRows(()=>{let q=supabase.from('products').select('id,name,name_en,name_ar,name_fa,sku,barcode,brand,supplier_id,is_active,status').eq('restaurant_id',restaurantId);for(const [k,v] of Object.entries(restaurantMaterialFilter(restaurant)))q=q.eq(k,v);return q.order('id');}),enabled:!!restaurantId,staleTime:0});
 const master=useQuery({queryKey:['product-brand-master',restaurantId],queryFn:()=>fetchBrandMaster(supabase,restaurantId),enabled:!!restaurantId});
 const rows=useMemo(()=>(products.data||[]).filter(p=>p.is_active!==false&&!['inactive','discontinued'].includes(p.status)),[products.data]);
 const labels=new Map((master.data||[]).map(r=>[brandKey(r.brand),r]));
 const names=cleanProductBrands(rows.map(p=>p.brand));
 const filtered=searchPurchaseProducts(rows.filter(p=>brand==='__none__'?!normalizeProductBrand(p.brand):!brand||brandKey(p.brand)===brandKey(brand)),search);
 const current=rows.filter(p=>supplierId&&String(p.supplier_id)===String(supplierId)).length;
 const selectable=filtered.filter(p=>!p.supplier_id).map(p=>p.id);
 const toggle=id=>onChange(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id]);
 return <section className="space-y-2 rounded-xl border p-3" data-testid="supplier-catalog-picker">
 <h3 className="font-bold">{t.title}</h3><p className="text-xs text-muted-foreground">{t.hint}</p>
 <p className="text-xs font-semibold">{t.linked}: {current} · {t.selected}: {selected.length}</p>
 {products.isPending?<p role="status">{t.loading}</p>:products.isError?<p role="alert">{t.error} <Button type="button" variant="outline" onClick={()=>products.refetch()}>{t.retry}</Button></p>:<>
 <select aria-label={t.all} className="h-11 w-full rounded-lg border bg-background px-2" value={brand} disabled={disabled} onChange={e=>{setBrand(e.target.value);setLimit(40);}}><option value="">{t.all}</option><option value="__none__">{t.none}</option>{names.map(b=><option key={b} value={b}>{brandLabel(labels.get(brandKey(b))||{brand:b},lang)}</option>)}</select>
 <Input placeholder={t.search} aria-label={t.search} value={search} onChange={e=>{setSearch(e.target.value);setLimit(40);}}/>
 <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={disabled||!selectable.length} onClick={()=>onChange([...new Set([...selected,...selectable])])}>{t.select}</Button><Button type="button" variant="outline" size="sm" disabled={disabled||!selected.length} onClick={()=>onChange([])}>{t.clear}</Button></div>
 <div className="max-h-64 overflow-y-auto space-y-1">{filtered.slice(0,limit).map(p=>{const linked=!!p.supplier_id,own=linked&&String(p.supplier_id)===String(supplierId);return <label key={p.id} className="flex min-h-11 items-center gap-2 rounded-lg border p-2 text-sm"><input type="checkbox" checked={own||selected.includes(p.id)} disabled={disabled||linked} onChange={()=>toggle(p.id)}/><span className="min-w-0 break-words">{p['name_'+lang]||p.name}<span className="block text-xs text-muted-foreground">{p.sku||''} · {p.brand||t.none}{linked?' · '+(own?t.linked:t.other):''}</span></span></label>})}</div>
 {!filtered.length&&<p className="text-sm">{t.empty}</p>}{filtered.length>limit&&<Button type="button" variant="outline" onClick={()=>setLimit(x=>x+40)}>{t.more}</Button>}
 </>}
 </section>;
}
