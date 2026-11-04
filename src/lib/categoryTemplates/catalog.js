// Product/inventory templates. Restaurant/café purchasing stays separate from POS food sales.
const label = value => {
  const [name, name_ar, name_fa] = value.split('|');
  return { name, name_ar, name_fa };
};
const group = (key, title, children) => ({ key, ...label(title), children: children.map((title, index) => ({ key: `${key}-${index + 1}`, ...label(title) })) });
const food = {
 rice: group('rice','Rice & grains|الأرز والحبوب|برنج و غلات',['Rice|الأرز|برنج','Flour & grains|الدقيق والحبوب|آرد و غلات']),
 meat: group('meat','Meat & poultry|اللحوم والدواجن|گوشت و مرغ',['Poultry|الدواجن|مرغ','Red meat|اللحوم الحمراء|گوشت سرخ']),
 fish: group('fish','Seafood|المأكولات البحرية|مواد دریایی',['Fish|الأسماك|ماهی','Shrimp|الروبيان|میگو']),
 produce: group('produce','Fruit & vegetables|الفواكه والخضروات|میوه و سبزیجات',['Fruit|الفواكه|میوه','Vegetables|الخضروات|سبزیجات']),
 dairy: group('dairy','Dairy & eggs|الألبان والبيض|لبنیات و تخم‌مرغ',['Milk & yogurt|الحليب والزبادي|شیر و ماست','Cheese & eggs|الأجبان والبيض|پنیر و تخم‌مرغ']),
 spice: group('spice','Spices & sauces|التوابل والصلصات|مصالحه و سس',['Spices|التوابل|مصالحه','Sauces|الصلصات|سس']),
 oil: group('oil','Oils & fats|الزيوت والدهون|روغن و چربی',['Cooking oil|زيوت الطهي|روغن پخت‌وپز','Butter & ghee|الزبدة والسمن|مسکه و روغن زرد']),
 drinks: group('drinks','Beverages|المشروبات|نوشیدنی‌ها',['Water|المياه|آب','Juice & soft drinks|العصائر والمشروبات الغازية|آب‌میوه و نوشابه']),
 bakery: group('bakery','Bakery|المخبوزات|نان و شیرینی',['Bread|الخبز|نان','Pastries|المعجنات|شیرینی']),
 pack: group('pack','Packaging|مواد التغليف|بسته‌بندی',['Containers|العبوات|ظرف‌ها','Bags & wraps|الأكياس وأغلفة التغليف|خریطه و پوشش']),
 clean: group('clean','Cleaning supplies|مستلزمات التنظيف|لوازم پاک‌کاری',['Detergents|المنظفات|مواد شوینده','Cleaning tools|أدوات التنظيف|وسایل پاک‌کاری']),
 frozen: group('frozen','Frozen foods|الأغذية المجمدة|مواد منجمد',['Frozen vegetables|خضروات مجمدة|سبزیجات منجمد','Frozen meals|وجبات مجمدة|غذاهای منجمد']),
 pantry: group('pantry','Pantry essentials|المواد الغذائية الأساسية|مواد غذایی اساسی',['Canned foods|المعلبات|کنسروها','Pasta & pulses|المعكرونة والبقوليات|ماکارونی و حبوبات']),
 snacks: group('snacks','Snacks & sweets|الوجبات الخفيفة والحلويات|تنقلات و شیرینی',['Biscuits|البسكويت|بسکویت','Chocolate & snacks|الشوكولاتة والوجبات الخفيفة|چاکلیت و تنقلات']),
};
export const CATEGORY_TEMPLATES = {
 restaurant: [food.rice,food.meat,food.fish,food.produce,food.dairy,food.spice,food.oil,food.drinks,food.pack,food.clean],
 cafe: [
  group('coffee','Coffee supplies|مستلزمات القهوة|مواد قهوه',['Coffee beans|حبوب القهوة|دانه قهوه','Ground coffee|القهوة المطحونة|قهوه آسیاب‌شده']),
  group('tea','Tea & infusions|الشاي والأعشاب|چای و دمنوش',['Tea|الشاي|چای','Herbal infusions|الأعشاب|دمنوش']),food.dairy,
  group('sweeteners','Sugar & syrups|السكر والشراب المركز|شکر و شربت',['Sugar & honey|السكر والعسل|شکر و عسل','Flavored syrups|الشراب المنكّه|شربت طعم‌دار']),food.bakery,
  group('baking','Baking ingredients|مكونات الخَبز|مواد شیرینی‌پزی',['Flour & yeast|الدقيق والخميرة|آرد و خمیرمایه','Cocoa & toppings|الكاكاو والإضافات|کاکائو و تزئینات']),food.produce,food.drinks,food.pack,food.clean],
 retail: [food.produce,food.dairy,food.meat,food.frozen,food.pantry,food.drinks,food.snacks,food.bakery,food.clean,
  group('care','Personal care|العناية الشخصية|مراقبت شخصی',['Hair care|العناية بالشعر|مراقبت مو','Body care|العناية بالجسم|مراقبت بدن'])],
 warehouse: [
  group('raw','Raw materials|المواد الخام|مواد خام',['Bulk materials|مواد سائبة|مواد فله','Components|المكونات|اجزا']),
  group('finished','Finished goods|المنتجات النهائية|محصولات نهایی',['Packaged goods|منتجات معبأة|محصولات بسته‌بندی','Bulk goods|منتجات بالجملة|محصولات عمده']),
  group('parts','Spare parts|قطع الغيار|پرزه‌جات',['Mechanical parts|قطع ميكانيكية|پرزه‌های میخانیکی','Electrical parts|قطع كهربائية|پرزه‌های برقی']),food.pack,
  group('pallets','Pallets & containers|الطبالي والحاويات|پالت و کانتینر',['Pallets|الطبالي|پالت','Reusable containers|حاويات قابلة لإعادة الاستخدام|ظرف‌های چندبارمصرف']),
  group('tools','Handling tools|أدوات المناولة|وسایل جابه‌جایی',['Hand tools|أدوات يدوية|وسایل دستی','Handling equipment|معدات المناولة|تجهیزات جابه‌جایی']),
  group('safety','Safety supplies|مستلزمات السلامة|لوازم ایمنی',['Protective wear|ملابس الوقاية|لباس محافظ','Safety equipment|معدات السلامة|تجهیزات ایمنی']),
  group('cold','Cold-chain goods|بضائع التبريد|کالاهای سردخانه',['Chilled goods|بضائع مبردة|کالاهای یخچالی','Frozen goods|بضائع مجمدة|کالاهای منجمد']),food.clean,
  group('office','Office supplies|المستلزمات المكتبية|لوازم دفتر',['Stationery|القرطاسية|قرطاسیه','Printer supplies|مستلزمات الطباعة|لوازم چاپ'])],
 factory: [
  group('raw','Raw materials|المواد الخام|مواد خام',['Primary inputs|مدخلات أساسية|مواد اصلی','Secondary inputs|مدخلات مساعدة|مواد کمکی']),
  group('components','Components|المكونات|اجزای تولید',['Purchased components|مكونات مشتراة|اجزای خریداری‌شده','Made components|مكونات مصنّعة|اجزای تولیدشده']),
  group('semi','Semi-finished goods|المنتجات نصف المصنعة|محصولات نیمه‌ساخته',['Subassemblies|تجميعات فرعية|قطعات مونتاژشده','Intermediate products|منتجات وسيطة|محصولات میانی']),
  group('finished','Finished products|المنتجات النهائية|محصولات نهایی',['Standard products|منتجات قياسية|محصولات استاندارد','Custom products|منتجات مخصصة|محصولات سفارشی']),food.pack,
  group('parts','Maintenance parts|قطع الصيانة|پرزه‌های ترمیم',['Machine parts|قطع الآلات|پرزه‌های ماشین','Electrical parts|قطع كهربائية|پرزه‌های برقی']),
  group('consumables','Production consumables|مستهلكات الإنتاج|مواد مصرفی تولید',['Lubricants|مواد التشحيم|روغن‌کاری','Adhesives|المواد اللاصقة|چسب‌ها']),
  group('tools','Production tools|أدوات الإنتاج|وسایل تولید',['Cutting tools|أدوات القطع|وسایل برش','Measuring tools|أدوات القياس|وسایل اندازه‌گیری']),
  group('safety','Protective supplies|مستلزمات الوقاية|لوازم محافظتی',['Protective wear|ملابس الوقاية|لباس محافظ','Safety equipment|معدات السلامة|تجهیزات ایمنی']),
  group('recyclable','Recyclable materials|المواد القابلة للتدوير|مواد قابل بازیافت',['Metal scrap|خردة المعادن|ضایعات فلزی','Packaging waste|مخلفات التغليف|ضایعات بسته‌بندی'])],
 pharmacy: [
  group('prescription','Prescription medicines|أدوية بوصفة طبية|دواهای نسخه‌ای',['Tablets & capsules|أقراص وكبسولات|تابلیت و کپسول','Liquids & injections|سوائل وحقن|مایعات و آمپول']),
  group('otc','Non-prescription products|منتجات دون وصفة|محصولات بدون نسخه',['Oral products|منتجات فموية|محصولات خوراکی','Topical products|منتجات موضعية|محصولات موضعی']),
  group('vitamins','Vitamins & supplements|الفيتامينات والمكملات|ویتامین و مکمل',['Vitamins|الفيتامينات|ویتامین‌ها','Minerals|المعادن|مواد معدنی']),
  group('firstaid','First aid|الإسعافات الأولية|کمک‌های اولیه',['Dressings|الضمادات|پانسمان','Antiseptics|المطهرات|مواد ضدعفونی']),
  group('devices','Medical devices|الأجهزة الطبية|دستگاه‌های طبی',['Measuring devices|أجهزة القياس|دستگاه‌های اندازه‌گیری','Device accessories|ملحقات الأجهزة|لوازم دستگاه']),
  group('skin','Skin care|العناية بالبشرة|مراقبت پوست',['Moisturizers|المرطبات|مرطوب‌کننده','Sun care|الوقاية من الشمس|محافظت آفتاب']),
  group('baby','Mother & baby|الأم والطفل|مادر و طفل',['Baby care|العناية بالطفل|مراقبت طفل','Feeding supplies|مستلزمات الرضاعة|لوازم تغذیه']),
  group('oral','Oral care|العناية بالفم|مراقبت دهان',['Toothpaste|معجون الأسنان|خمیردندان','Toothbrushes|فرش الأسنان|برس دندان']),
  group('hygiene','Hygiene|النظافة الشخصية|بهداشت شخصی',['Sanitizers|معقمات اليدين|ضدعفونی دست','Personal hygiene|مستلزمات النظافة|لوازم بهداشت']),
  group('mobility','Mobility & support|الحركة والدعامات|حرکت و حمایت',['Supports|الدعامات|بریس و حمایت','Mobility aids|وسائل المساعدة على الحركة|وسایل کمکی حرکت'])],
 clinic: [
  group('consultations','Consultations|الاستشارات|مشاوره‌ها',['Initial visits|الزيارة الأولى|مراجعه نخست','Follow-ups|المتابعات|پیگیری']),
  group('screening','Health screening|الفحوصات الصحية|بررسی سلامت',['Routine checks|فحوصات دورية|معاینه دوره‌ای','Preventive checks|فحوصات وقائية|معاینه پیشگیرانه']),
  group('lab','Laboratory services|خدمات المختبر|خدمات لابراتوار',['Sample collection|جمع العينات|نمونه‌گیری','Laboratory tests|التحاليل المخبرية|آزمایش‌ها']),
  group('imaging','Diagnostic imaging|التصوير التشخيصي|تصویربرداری تشخیصی',['Imaging services|خدمات التصوير|خدمات تصویربرداری','Imaging supplies|مستلزمات التصوير|لوازم تصویربرداری']),
  group('nursing','Nursing services|خدمات التمريض|خدمات پرستاری',['Dressing services|خدمات الضمادات|خدمات پانسمان','Nursing visits|زيارات التمريض|مراجعات پرستاری']),
  group('dental','Dental services|خدمات الأسنان|خدمات دندان',['Dental examinations|فحوصات الأسنان|معاینه دندان','Dental care|العناية بالأسنان|مراقبت دندان']),
  group('rehab','Rehabilitation|التأهيل|توان‌بخشی',['Assessment|التقييم|ارزیابی','Therapy sessions|جلسات العلاج|جلسات درمان']),
  group('disposables','Medical disposables|المستهلكات الطبية|مواد مصرفی طبی',['Gloves & masks|القفازات والكمامات|دستکش و ماسک','Dressings & gauze|الضمادات والشاش|پانسمان و گاز']),
  group('equipment','Medical equipment|المعدات الطبية|تجهیزات طبی',['Examination equipment|معدات الفحص|وسایل معاینه','Equipment accessories|ملحقات المعدات|لوازم تجهیزات']),
  group('infection','Infection control|مكافحة العدوى|کنترول عفونت',['Disinfectants|المطهرات|ضدعفونی‌کننده','Sterilization supplies|مستلزمات التعقيم|لوازم استریل'])],
 wholesale: [food.rice,food.pantry,food.meat,food.frozen,food.dairy,food.drinks,food.snacks,food.produce,food.pack,food.clean],
 services: [
  group('consulting','Consulting|الاستشارات|مشاوره',['Business consulting|استشارات الأعمال|مشاوره کسب‌وکار','Technical consulting|استشارات فنية|مشاوره فنی']),
  group('maintenance','Maintenance|الصيانة|ترمیم و نگهداری',['Scheduled maintenance|صيانة دورية|ترمیم دوره‌ای','Emergency repairs|إصلاحات طارئة|ترمیم اضطراری']),
  group('installation','Installation|التركيب|نصب',['Equipment installation|تركيب المعدات|نصب تجهیزات','Setup services|خدمات الإعداد|خدمات راه‌اندازی']),
  group('cleaning','Cleaning services|خدمات التنظيف|خدمات پاک‌کاری',['Regular cleaning|تنظيف دوري|پاک‌کاری دوره‌ای','Deep cleaning|تنظيف عميق|پاک‌کاری کامل']),
  group('design','Design|التصميم|طراحی',['Graphic design|التصميم الجرافيكي|طراحی گرافیک','Digital design|التصميم الرقمي|طراحی دیجیتال']),
  group('technology','Technology services|خدمات التقنية|خدمات تکنالوژی',['Software support|دعم البرمجيات|پشتیبانی نرم‌افزار','Hardware support|دعم الأجهزة|پشتیبانی سخت‌افزار']),
  group('training','Training|التدريب|آموزش',['Individual training|تدريب فردي|آموزش فردی','Group training|تدريب جماعي|آموزش گروهی']),
  group('delivery','Delivery services|خدمات التوصيل|خدمات تحویل',['Local delivery|توصيل محلي|تحویل محلی','Scheduled delivery|توصيل مجدول|تحویل برنامه‌ریزی‌شده']),
  group('rental','Rental services|خدمات التأجير|خدمات کرایه',['Equipment rental|تأجير المعدات|کرایه تجهیزات','Accessory rental|تأجير الملحقات|کرایه لوازم']),
  group('supplies','Service supplies|مستلزمات الخدمات|لوازم خدمات',['Consumables|المستهلكات|مواد مصرفی','Replacement parts|قطع بديلة|پرزه‌های تعویضی'])],
 other: [
  group('goods','General goods|البضائع العامة|اجناس عمومی',['Standard goods|بضائع قياسية|اجناس معمولی','Custom goods|بضائع مخصصة|اجناس سفارشی']),
  group('services','General services|الخدمات العامة|خدمات عمومی',['One-time services|خدمات لمرة واحدة|خدمات یک‌باره','Recurring services|خدمات دورية|خدمات دوره‌ای']),
  group('office','Office supplies|المستلزمات المكتبية|لوازم دفتر',['Stationery|القرطاسية|قرطاسیه','Printing supplies|مستلزمات الطباعة|لوازم چاپ']),
  group('equipment','Equipment|المعدات|تجهیزات',['Small equipment|معدات صغيرة|تجهیزات کوچک','Large equipment|معدات كبيرة|تجهیزات بزرگ']),
  group('parts','Parts & accessories|القطع والملحقات|پرزه و لوازم',['Spare parts|قطع الغيار|پرزه‌جات','Accessories|الملحقات|لوازم جانبی']),food.pack,food.clean,
  group('safety','Safety supplies|مستلزمات السلامة|لوازم ایمنی',['Protective wear|ملابس الوقاية|لباس محافظ','Safety equipment|معدات السلامة|تجهیزات ایمنی']),
  group('digital','Digital products|المنتجات الرقمية|محصولات دیجیتال',['Licenses|التراخيص|جوازها','Digital content|المحتوى الرقمي|محتوای دیجیتال']),
  group('consumables','Consumables|المستهلكات|مواد مصرفی',['Daily supplies|مستلزمات يومية|لوازم روزانه','Maintenance supplies|مستلزمات الصيانة|لوازم ترمیم'])],
};
export function categoryTemplate(mode) {
  return structuredClone(CATEGORY_TEMPLATES[mode] || CATEGORY_TEMPLATES.other);
}
export function categoryLabel(row, lang) { return row[`name_${lang}`] || row.name; }
