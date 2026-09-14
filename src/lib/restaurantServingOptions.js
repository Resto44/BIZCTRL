export const SERVING_KEYS = ['half_plain','half_rice','whole_plain','whole_rice','quarter_plain','quarter_rice'];
export function servingCopy(lang='en') {
 const copy={
  en:{choose:'Choose serving',group:'Food group (optional)',groupHint:'Use the same group for all sizes of one food, e.g. Roast chicken. Each choice needs its own price and recipe.',kind:'Serving choice',standalone:'Separate dish',missing:'Not configured',unavailable:'Unavailable',add:'Add serving choice',configure:'Set the price and recipe in Products → Sales menu.',half_plain:'Half · plain',half_rice:'Half · with rice',whole_plain:'Whole · plain',whole_rice:'Whole · with rice',quarter_plain:'Quarter · plain',quarter_rice:'Quarter · with rice'},
  ar:{choose:'اختر الحجم والإضافة',group:'مجموعة الطعام (اختياري)',groupHint:'استخدم نفس المجموعة لأحجام الطعام، مثل شواية. لكل خيار سعر ووصفة مستقلة.',kind:'نوع الوجبة',standalone:'طبق مستقل',missing:'لم يتم إعداده',unavailable:'غير متاح',add:'إضافة خيار وجبة',configure:'حدد السعر والوصفة من المنتجات ← قائمة البيع.',half_plain:'نص سادة',half_rice:'نص مع الرز',whole_plain:'حبة سادة',whole_rice:'حبة مع الرز',quarter_plain:'ربع سادة',quarter_rice:'ربع مع الرز'},
  fa:{choose:'اندازه و نوع غذا را انتخاب کنید',group:'گروه غذا (اختیاری)',groupHint:'برای اندازه‌های یک غذا، گروه یکسان مانند شواية بنویسید. هر گزینه قیمت و دستور پخت مستقل دارد.',kind:'نوع پرس',standalone:'غذای مستقل',missing:'تنظیم نشده',unavailable:'موجود نیست',add:'افزودن نوع غذا',configure:'قیمت و دستور پخت را از محصولات ← منوی فروش تنظیم کنید.',half_plain:'نص ساده',half_rice:'نص با برنج',whole_plain:'حبه ساده',whole_rice:'حبه با برنج',quarter_plain:'ربع ساده',quarter_rice:'ربع با برنج'}
 };
 return copy[lang]||copy.en;
}
export function canSellServing(item) {
 return Boolean(item?.id&&item.active&&item.price!==null&&item.price!==''&&Number.isFinite(Number(item.price))&&Number(item.price)>0);
}
export function groupRestaurantFoods(menu,{search='',category=''}={}) {
 const groups=new Map();
 for(const item of menu||[]) {
  const grouped=Boolean(item.option_group&&SERVING_KEYS.includes(item.option_key));
  const key=grouped?JSON.stringify([item.restaurant_id,item.branch_id,item.option_group]):item.id;
  if(!groups.has(key))groups.set(key,{id:key,grouped,title:grouped?item.option_group:'',items:[]});
  groups.get(key).items.push(item);
 }
 const term=String(search).trim().toLocaleLowerCase();
 return [...groups.values()].filter(group=>group.items.some(item=>item.active&&(!category||(item.category_id||item.category)===category)&&
  [group.title,item.name,item.name_ar,item.name_fa,item.name_en].join(' ').toLocaleLowerCase().includes(term)));
}
export function servingSlots(group) {
 const keys=SERVING_KEYS.filter((key,index)=>index<4||group.items.some(item=>item.option_key===key));
 return keys.map(key=>({key,item:group.items.find(item=>item.option_key===key)||null}));
}

export const PORTIONS = ['whole','half','quarter'];
export const SIDES = ['rice','plain'];
export function touchCopy(lang='en') {
 return ({
  ar:{size:'اختر الحجم',side:'طريقة التقديم',whole:'حبة',half:'نص',quarter:'ربع',rice:'مع الرز',plain:'سادة بدون الرز',add:'إضافة إلى الطلب',quantity:'الكمية',increase:'زيادة الكمية',decrease:'تقليل الكمية',edit:'الأحجام والأسعار',group:'اسم الطعام',name:'اسم الوجبة',price:'السعر شامل الضريبة',save:'حفظ جميع الخيارات',category:'فئة بيع POS',manage:'إدارة فئات بيع POS',recipe:'الوصفة والمخزون',enable:'تفعيل',new:'طعام بأحجام متعددة',busy:'جارٍ الإضافة…',choose:'اختر الفئة',stock:'تأكيد عدم خصم مخزون للخيارات غير المتتبعة'},
  fa:{size:'اندازه را انتخاب کنید',side:'نوع غذا',whole:'حبه',half:'نص',quarter:'ربع',rice:'همراه برنج',plain:'ساده بدون برنج',add:'افزودن به سفارش',quantity:'تعداد',increase:'افزایش تعداد',decrease:'کاهش تعداد',edit:'اندازه‌ها و قیمت‌ها',group:'نام غذا',name:'نام گزینهٔ غذا',price:'قیمت با مالیات',save:'ذخیرهٔ همه گزینه‌ها',category:'کتگوری فروش POS',manage:'مدیریت کتگوری فروش POS',recipe:'دستور پخت و موجودی',enable:'فعال',new:'غذا با چند اندازه',busy:'در حال افزودن…',choose:'کتگوری را انتخاب کنید',stock:'تأیید عدم کسر موجودی برای گزینه‌های بدون پیگیری'},
  en:{size:'Choose size',side:'Serving style',whole:'Whole',half:'Half',quarter:'Quarter',rice:'With rice',plain:'Plain · no rice',add:'Add to order',quantity:'Quantity',increase:'Increase quantity',decrease:'Decrease quantity',edit:'Sizes & prices',group:'Food name',name:'Serving name',price:'Price including tax',save:'Save all choices',category:'POS sales category',manage:'POS Sales Category Management',recipe:'Recipe & stock',enable:'Enabled',new:'Food with sizes',busy:'Adding…',choose:'Choose a category',stock:'Confirm no stock deduction for untracked choices'}
 })[lang]||touchCopy('en');
}
