import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {restaurantRpc} from '@/lib/restaurantPOS';
import {downloadFoodFile,foodExport,foodTemplate} from '@/lib/restaurantFoodImport';
import {restaurantProductCopy} from '@/lib/restaurantProducts';
import {customizationCopy} from '@/lib/restaurantCustomization';
import {Setup,button,primary} from '@/pages/restaurant/RestaurantPOS';
import RestaurantFoodImport from './RestaurantFoodImport';
import RestaurantMenuGroupEditor from './RestaurantMenuGroupEditor';

export function posProductsCopy(lang){return ({
 en:{title:'Master / Add product',hint:'Manage the selected branch’s POS menu. Add one food, configure sizes, or import products together.',import:'Bulk import · Excel / CSV',export:'Export all products · Excel',template:'Download import template',notice:'Exports include inactive foods and all sizes. Keep food_id to update the same branch without duplicates. Import up to 500 rows at a time; keep each food group together.',loading:'Loading products…',retry:'Retry'},
 ar:{title:'الماستر / إضافة منتج',hint:'إدارة قائمة POS للفرع المحدد: أضف طعاماً أو أحجاماً وخيارات أو استورد المنتجات بالجملة.',import:'استيراد جماعي · Excel / CSV',export:'تصدير جميع المنتجات · Excel',template:'تحميل قالب الاستيراد',notice:'يشمل التصدير الأطعمة غير النشطة وكل الأحجام. احتفظ بـ food_id لتحديث نفس الفرع دون تكرار. الاستيراد حتى ٥٠٠ صف؛ أبقِ خيارات كل طعام معاً.',loading:'جارٍ تحميل المنتجات…',retry:'إعادة المحاولة'},
 fa:{title:'ماستر / افزودن محصول',hint:'محصولات POS فرع انتخاب‌شده: افزودن تکی، تنظیم سایز و گزینه‌ها، یا امپورت گروهی.',import:'امپورت گروهی · Excel / CSV',export:'اکسپورت تمام محصولات · Excel',template:'دانلود تمپلت امپورت',notice:'فایل شامل محصولات غیرفعال و تمام سایزها است. برای به‌روزرسانی همین فرع بدون تکرار، food_id را نگه دارید. هر امپورت تا ۵۰۰ سطر؛ گزینه‌های هر غذا را با هم وارد کنید.',loading:'در حال دریافت محصولات…',retry:'تلاش دوباره'}
 })[lang]||posProductsCopy('en');}
const xlsx='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export default function RestaurantPOSProducts({tenant,branch,lang,c,close}){
 const t=posProductsCopy(lang),qc=useQueryClient();const [mode,setMode]=useState('home');
 const q=useQuery({queryKey:['restaurant-menu-catalog',tenant,branch],queryFn:()=>restaurantRpc('pos_catalog',{p_restaurant_id:tenant,p_branch_id:branch,p_search:''}),enabled:Boolean(tenant&&branch)});
 const refresh=()=>Promise.all(['restaurant-menu-catalog','restaurant-pos','restaurant-pos-setup','products'].map(key=>qc.invalidateQueries({queryKey:[key]})));
 if(mode==='add')return <Setup tenant={tenant} branch={branch} c={c} menuOnly close={close} refresh={refresh}/>;
 if(mode==='sizes'&&q.data)return <RestaurantMenuGroupEditor tenant={tenant} branch={branch} catalog={q.data} reload={q.refetch} refresh={refresh} close={close}/>;
 if(mode==='import'&&q.data)return <RestaurantFoodImport tenant={tenant} branch={branch} catalog={q.data} lang={lang} close={close} refresh={refresh}/>;
 return <Dialog open onOpenChange={open=>{if(!open)close();}}><DialogContent dir={lang==='en'?'ltr':'rtl'} className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{t.title}</DialogTitle><DialogDescription>{t.hint}</DialogDescription></DialogHeader>
  <div className="grid gap-3 sm:grid-cols-2">
   <button type="button" className={primary} onClick={()=>setMode('add')}>{restaurantProductCopy(lang).add}</button>
   <button type="button" className={button} disabled={!q.data||q.isFetching||q.isError} onClick={()=>setMode('sizes')}>{customizationCopy(lang).new}</button>
   <button type="button" className={button} disabled={!q.data||q.isFetching||q.isError} onClick={()=>setMode('import')}>{t.import}</button>
   <button type="button" className={button} disabled={!q.data?.menu?.length||q.isFetching||q.isError} onClick={()=>downloadFoodFile(foodExport(q.data.menu),'restaurant-products-'+branch+'.xlsx',xlsx)}>{t.export}</button>
   <button type="button" className={button+' sm:col-span-2'} onClick={()=>downloadFoodFile(foodTemplate(),'restaurant-food-import.xlsx',xlsx)}>{t.template}</button>
  </div>
  <p className="text-sm leading-6 text-slate-500">{t.notice}</p>
  {q.isLoading&&<p role="status">{t.loading}</p>}
  {q.isError&&<div role="alert"><p>{q.error.message}</p><button className={button} onClick={()=>void q.refetch()}>{t.retry}</button></div>}
 </DialogContent></Dialog>;
}
