import { fieldGuide, guideField } from './helpFieldGuideBuilders';

function fields(text) {
  return text.trim().split('\n').filter(Boolean).map(line => {
    const [key, status, en, ar, fa, enDetail, arDetail, faDetail] = line.split('|');
    if (!key || !faDetail) throw new Error('Incomplete product field reference: ' + line);
    return guideField(key, status, [en, ar, fa], [enDetail, arDetail, faDetail]);
  });
}

export const PRODUCT_MASTER_FIELD_GUIDES = [
  fieldGuide({
    id: 'product-identity-reference', category: 'stock', roles: ['owner','manager'], route: '/product-management',
    source: 'src/components/products/ProductMasterForm.jsx',
    title: ['Product Management: Identity — every field', 'إدارة المنتجات: كل حقول التعريف', 'Product Management: تمام فیلدهای مشخصات'],
    steps: [
      ['Open Product Management → New Product → Identity and enter the primary name, type, category and base unit.',
       'Add translated names, SKU, barcode, brand, supplier, description and image where relevant; only fields marked required by Workspace settings are mandatory.',
       'Verify the product type and category, then choose Continue to move to pricing. Restaurant menu foods and raw materials are different catalogs.'],
      ['افتح إدارة المنتجات ← منتج جديد ← البيانات الأساسية ثم أدخل الاسم والنوع والتصنيف والوحدة.',
       'أضف الترجمات والرمز والباركود والعلامة والمورد والوصف والصورة حسب الحاجة؛ الإلزامية تعتمد على إعدادات المؤسسة.',
       'راجع نوع المنتج والتصنيف ثم تابع إلى التسعير؛ أطعمة قائمة المطعم تختلف عن مواد المخزون الخام.'],
      ['Product Management ← New Product ← Identity را باز و نام اصلی، نوع، دسته و واحد را وارد کنید.',
       'نام‌های دیگر، SKU، بارکد، برند، سپلایر، توضیحات و لینک عکس را در صورت نیاز درج کنید؛ فیلدهای Required تابع تنظیمات سازمان هستند.',
       'نوع محصول و دسته را بررسی و Continue کنید؛ غذای منوی رستوران با مواد خام انبار یک کاتالوگ نیست.'],
    ],
    note: ['The primary product name is always required. SKU, barcode, brand, description and status may become required through Customize Workspace.',
      'اسم المنتج الأساسي إلزامي دائماً؛ قد تصبح SKU والباركود والعلامة والوصف والحالة إلزامية بإعدادات المؤسسة.',
      'نام اصلی محصول همیشه الزامی است؛ SKU، بارکد، برند، توضیح و وضعیت فقط در صورت تنظیم Workspace اجباری می‌شوند.'],
    fields: fields(`
name|required|Product name|اسم المنتج|نام محصول|Mandatory primary name.|الاسم الأساسي إلزامي.|نام اصلی حتماً لازم است.
name_ar|optional|Arabic name|الاسم العربي|نام عربی|Localized Arabic name.|اسم العرض بالعربية.|نام نمایشی عربی.
name_fa|optional|Persian name|الاسم الفارسي|نام فارسی|Localized Persian name.|اسم العرض بالفارسية.|نام نمایشی فارسی.
name_en|optional|English name|الاسم الإنجليزي|نام انگلیسی|Additional English display name.|الاسم المعروض بالإنجليزية.|نام اضافی انگلیسی.
sku|conditional|SKU|رمز SKU|کد SKU|Stock identity; required if configured.|رمز المنتج حسب الاشتراط.|شناسه جنس؛ در صورت تنظیم الزامی.
barcode|conditional|Barcode|الباركود|بارکد|Scan or generate; mandatory only if configured.|امسحه أو أنشئه إذا كان مطلوباً.|اسکن یا ایجاد کنید؛ بسته به تنظیمات.
image_url|optional|Product image URL|رابط صورة المنتج|لینک تصویر|HTTPS image link, not uploaded file bytes.|رابط صورة HTTPS وليس ملفاً.|لینک HTTPS تصویر، نه فایل.
product_type|optional|Product type|نوع المنتج|نوع محصول|Choose stock, service or recipe.|اختر مخزوناً أو خدمة أو وصفة.|Stock، Service یا Recipe را انتخاب کنید.
category_id|conditional|Category level 1|التصنيف الأساسي|دسته اصلی|If selected, must match a valid category.|عند اختياره يجب أن يكون صالحاً.|اگر انتخاب شد باید معتبر باشد.
subcategory_id|optional|Subcategory|التصنيف الفرعي|زیر‌دسته|Appears if selected parent has children.|يظهر عند وجود تصنيفات فرعية.|اگر دسته اصلی زیرشاخه داشته باشد.
child_category_id|optional|Child category|التصنيف الثالث|دسته سوم|Third-level category if present.|التصنيف الفرعي في المستوى الثالث.|اگر مرحله سوم موجود باشد.
unit|optional|Base unit|وحدة القياس|واحد پایه|Choose kg, carton, piece or a registered unit.|كغ أو كرتون أو قطعة أو وحدة معرفة.|واحد مانند کیلو، کارتن، عدد یا واحد ثبت‌شده.
brand|conditional|Brand|العلامة التجارية|برند|Required only when workspace marks required.|مطلوبة فقط حسب إعدادات المؤسسة.|فقط اگر سازمان Required کرده باشد.
supplier_id|optional|Primary supplier|المورد الأساسي|سپلایر اصلی|Select the linked supplier from list.|اختر مورداً من القائمة.|سپلایر را از لیست انتخاب کنید.
status|conditional|Status|حالة المنتج|وضعیت|Active, inactive or discontinued; conditional mandatory.|نشط أو غير نشط أو متوقف؛ حسب الإعداد.|Active، Inactive یا Discontinued؛ بسته به تنظیم.
description|conditional|Description|وصف المنتج|توضیحات|Product details; required only when configured.|تفاصيل المنتج حسب الإلزامية.|توضیحات، در صورت Required لازم می‌شود.`),
  }),
  fieldGuide({
    id: 'product-pricing-reference', category: 'stock', roles: ['owner','manager'], route: '/product-management',
    source: 'src/components/products/ProductMasterForm.jsx',
    title: ['Product Management: Pricing & Tax — every field', 'إدارة المنتجات: جميع حقول السعر والضريبة', 'Product Management: تمام فیلدهای قیمت و مالیات'],
    steps: [
      ['Enter unit Purchase Cost, costing method and alert threshold under Purchase & Cost, then review the computed margin.',
       'Set Selling Price, Wholesale Price and Minimum Selling Price. Check that sale price never falls below a positive minimum.',
       'Review VAT Rate, price-includes-tax, discounts, branch overrides and owner price approval before continuing.'],
      ['أدخل تكلفة الوحدة وطريقة احتساب التكلفة ونسبة تنبيه تغير السعر ثم افحص هامش الربح.',
       'حدد سعر البيع والجملة والحد الأدنى؛ لا تجعل سعر البيع أقل من الحد المحدد.',
       'راجع VAT والخصومات والسعر الشامل للضريبة وسعر الفرع وموافقة المالك ثم تابع.'],
      ['در Purchase & Cost قیمت هر واحد، روش محاسبه و حد هشدار را تعیین و حاشیه سود را بررسی کنید.',
       'Selling Price، Wholesale و Minimum Selling Price را تنظیم کنید؛ قیمت فروش از حداقل مثبت کمتر نباشد.',
       'VAT، شامل‌بودن مالیات، تخفیف، قیمت شعبه و تأیید اونر را پیش از Continue بررسی کنید.'],
    ],
    note: ['Negative prices or taxes are invalid; maximum discount must be 0–100%. Margin and markup are different percentages.',
      'القيم السالبة مرفوضة؛ الحد الأعلى للخصم بين صفر ومئة، والهامش يختلف عن الزيادة على التكلفة.',
      'قیمت یا مالیات منفی رد می‌شود؛ سقف تخفیف ۰–۱۰۰ است و Margin با Markup فرق می‌کند.'],
    fields: fields(`
purchase_cost|optional|Purchase cost|تكلفة الشراء|قیمت خرید|Per unit cost for valuation and profit.|تكلفة الوحدة للمخزون والربح.|هزینه هر واحد برای انبار و سود.
costing_method|optional|Costing method|طريقة التكلفة|روش قیمت تمام‌شده|Weighted average, FIFO or standard.|المتوسط المرجح أو FIFO أو القياسي.|Weighted Average، FIFO یا Standard.
price_change_alert_percent|optional|Price-change threshold|نسبة تنبيه تغير السعر|درصد هشدار قیمت|Triggers configured price change alert.|نسبة لإشعار تغير السعر.|درصد تغییر برای هشدار.
selling_price|optional|Selling price|سعر البيع|قیمت فروش|Retail sales price.|السعر النهائي للبيع.|قیمت فروش به مشتری.
wholesale_price|optional|Wholesale price|سعر الجملة|قیمت عمده|Price for wholesale orders.|سعر الطلبات بالجملة.|قیمت مشتری عمده.
minimum_selling_price|optional|Minimum sale price|الحد الأدنى للبيع|حداقل فروش|Cannot save lower retail sale price.|لا يجوز سعر بيع أدنى منه.|فروش کمتر از این حد رد می‌شود.
profit_margin|system|Profit margin|هامش الربح|مارجین سود|Calculated profit divided by selling price.|الربح على سعر البيع.|سود تقسیم بر قیمت فروش.
markup|system|Markup|زيادة فوق التكلفة|مارک‌آپ|Calculated profit divided by purchase cost.|الربح على تكلفة الشراء.|سود تقسیم بر قیمت خرید.
tax_rate|optional|VAT rate|معدل VAT|نرخ VAT|Tax percentage between 0 and 100.|نسبة بين صفر ومئة.|درصد مالیات ۰ تا ۱۰۰.
maximum_discount|optional|Maximum discount|الحد الأعلى للخصم|سقف تخفیف|Allowed discount percent 0–100.|خصم بين صفر ومئة.|حداکثر تخفیف ۰–۱۰۰ درصد.
price_includes_tax|optional|Price includes VAT|السعر يشمل الضريبة|قیمت شامل VAT|Sale price already contains tax when on.|السعر المدخل شامل الضريبة.|وقتی فعال است قیمت شامل VAT است.
discount_allowed|optional|Discount allowed|السماح بالخصم|اجازه تخفیف|Enable discounts under ERP rules.|يسمح بالخصم حسب السياسة.|تخفیف مطابق سیاست.
branch_price_override|optional|Branch price override|تعديل سعر الفرع|قیمت متفاوت شعبه|Allow authorized branch-specific pricing.|يسمح بسعر خاص للفروع المصرح لها.|اجازه قیمت خاص شعبه.
price_change_requires_approval|optional|Owner price approval|موافقة المالك للسعر|تأیید اونر برای قیمت|Request owner approval for price changes.|مراجعة المالك لتغييرات السعر.|تغییر قیمت نیازمند تأیید اونر.`),
  }),
  fieldGuide({
    id: 'product-inventory-reference', category: 'stock', roles: ['owner','manager'], route: '/product-management',
    source: 'src/components/products/ProductMasterForm.jsx',
    title: ['Product Management: inventory and units — every field', 'إدارة المنتجات: جميع حقول المخزون والوحدات', 'Product Management: تمام فیلدهای انبار و واحدها'],
    steps: [
      ['Under Inventory Policy choose which physical goods need tracking and whether negative stock, batches, expiry or serial numbers apply.',
       'Add unit conversions with a positive factor and target unit, then record opening, reorder and Par stock values separately by branch.',
       'Set preferred supplier, delivery lead time, minimum order and purchase suggestions, then verify every unit and branch quantity.'],
      ['ضمن سياسة المخزون حدد تتبع المخزون السالب والدفعات وتواريخ الانتهاء والأرقام التسلسلية وفق نوع المنتج.',
       'أضف تحويل الوحدات بمعامل موجب ووحدة الهدف، ثم حدد مخزون البداية وحد الطلب ومستوى الهدف لكل فرع.',
       'راجع المورد المفضل ومدة التوريد والحد الأدنى للشراء والاقتراحات وتأكد من صحة وحدة وكمية كل فرع.'],
      ['در Inventory Policy ردیابی کالا، منفی‌شدن، Batch، انقضا و شماره سریال را تعیین کنید.',
       'واحدهای تبدیل با ضریب مثبت را درج و برای هر شعبه Opening Stock، Reorder و Par level را جدا وارد کنید.',
       'سپلایر مورد نظر، روزهای تحویل، حداقل سفارش و پیشنهاد خرید را تنظیم و واحد و موجودی هر شعبه را کنترل کنید.'],
    ],
    note: ['Opening stock is a starting position, not a purchase. Never add cartons, kilograms or portions without a conversion. Stock quantities must be non-negative.',
      'مخزون البداية ليس فاتورة شراء، ولا تجمع الكرتون والكيلو والحصة بلا تحويل صالح. كميات المخزون غير سالبة.',
      'Opening Stock موجودی آغاز است نه خرید. کارتن، کیلو و پرس بدون تبدیل معتبر قابل جمع نیستند؛ موجودی نباید منفی باشد.'],
    fields: fields(`
track_inventory|optional|Track inventory|تتبع المخزون|ردیابی انبار|Enabled for physical stock; services may not track.|فعّل للمواد الفعلية لا لكل الخدمات.|برای جنس فیزیکی فعال؛ خدمات معمولاً انبار ندارند.
allow_negative_stock|optional|Allow negative stock|السماح بالمخزون السالب|موجودی منفی|Risk of selling more than stock; normally disable.|قد يسمح ببيع أكثر من المتاح؛ يفضّل تعطيله.|خطر فروش بیش از موجودی؛ بهتر خاموش.
batch_tracking|optional|Batch tracking|تتبع الدفعات|ردیابی Batch|Track lot numbers for sensitive stock.|تعقب أرقام دفعات الأصناف.|شماره Batch اجناس را دنبال می‌کند.
expiry_tracking|optional|Expiry tracking|تتبع الصلاحية|ردیابی انقضا|Track expiry for perishables.|للمواد ذات تاريخ صلاحية.|برای جنس دارای تاریخ انقضا.
serial_tracking|optional|Serial tracking|الأرقام التسلسلية|شماره سریال|Identify individual serialized goods.|تعقب أرقام الوحدات المنفردة.|ردیابی هر محصول دارای Serial.
from_unit|conditional|Source unit|الوحدة الأصلية|واحد مبدأ|Required for a conversion row.|مطلوبة عند إضافة تحويل.|در صورت افزودن تبدیل لازم.
factor|conditional|Conversion factor|معامل التحويل|ضریب تبدیل|Must be positive e.g. 12 pieces per carton.|يجب أن يكون موجباً مثل ١٢ قطعة للكرتون.|باید مثبت باشد؛ مثلاً ۱۲ عدد در کارتن.
to_unit|conditional|Target unit|الوحدة الهدف|واحد مقصد|Required target for any conversion.|مطلوبة لكل تحويل.|برای هر تبدیل لازم است.
conversion_barcode|optional|Conversion barcode|باركود التحويل|بارکد تبدیل|Optional pack barcode.|باركود اختياري للعبوة.|بارکد بسته اختیاری.
opening_stock|optional|Opening stock per branch|مخزون البداية للفرع|موجودی آغاز شعبه|Starting balance, not a purchase entry.|رصيد افتتاحي وليس مشتريات.|موجودی اولیه، نه ثبت خرید.
reorder_point|optional|Reorder point|حد إعادة الطلب|حد سفارش مجدد|Alert when stock reaches the threshold.|التنبيه عند بلوغ حد الطلب.|هشدار هنگام رسیدن به حد.
par_level|optional|Par level|مستوى المخزون المستهدف|موجودی هدف|Target quantity for replenishment planning.|مقدار المخزون المستهدف للتزويد.|مقدار مطلوب برای تأمین.
preferred_supplier|optional|Preferred supplier|المورد المفضل|سپلایر ترجیحی|Select a linked supplier.|اختر مورداً مسجلاً.|سپلایر ثبت‌شده را انتخاب کنید.
lead_time_days|optional|Lead time (days)|مدة التوريد بالأيام|روزهای تأمین|Estimated days between order and receipt.|مدة وصول المواد بعد الطلب.|تعداد روز تا رسیدن سفارش.
minimum_order_qty|optional|Minimum order quantity|حد أدنى للطلب|حداقل مقدار سفارش|Minimum suggested purchase amount.|أقل كمية شراء مقترحة.|کمترین مقدار سفارش.
automatic_purchase_suggestion|optional|Automatic purchase suggestion|اقتراح شراء تلقائي|پیشنهاد خرید اتومات|Suggestion only, not an approved purchase invoice.|اقتراح وليس فاتورة شراء معتمدة.|فقط پیشنهاد است، نه فاکتور پرداخت‌شده.`),
  }),
  fieldGuide({
    id: 'product-advanced-reference', category: 'stock', roles: ['owner','manager'], route: '/product-management',
    source: 'src/components/products/ProductMasterForm.jsx',
    title: ['Product Management: advanced rules, accounting and access', 'إدارة المنتجات: القواعد والحسابات والصلاحيات', 'Product Management: تنظیمات پیشرفته، حسابداری و صلاحیت'],
    steps: [
      ['Complete organization-required Custom Fields, then choose Sellable, Purchasable, Returnable and any manager approval requirement.',
       'Check POS visibility, purchase limit and mapping to Sales, Inventory, COGS and Stock Variance accounts.',
       'Select permitted owner, manager and employee product access, then use Create/Update Product and verify the server record in the catalog.'],
      ['أكمل الحقول المخصصة المطلوبة وحدد قابلية البيع والشراء والإرجاع وحاجة موافقة المدير.',
       'راجع ظهور المنتج في POS وسقف الشراء وربط حسابات المبيعات والمخزون وتكلفة البضاعة وفروق الجرد.',
       'اختر وصول المالك والمدير والموظف ثم أنشئ أو حدّث المنتج وتحقق من السجل في الكتالوج.'],
      ['Custom Fields الزامی را کامل کنید و Sellable، Purchasable، Returnable و تأیید مدیر را مشخص کنید.',
       'نمایش POS، سقف خرید و اتصال حساب‌های Sales، Inventory، COGS و Stock Variance را بررسی کنید.',
       'دسترسی Owner، Manager و Employee را تعیین و Create/Update را بزنید؛ ثبت سروری را در کاتالوگ بررسی کنید.'],
    ],
    note: ['Product access settings never override central ERP role permissions or RLS. Save Draft saves only a local device draft; it does not post a product.',
      'صلاحيات المنتج لا تتجاوز الأدوار المركزية أو RLS. حفظ المسودة محلي على الجهاز وليس إنشاء منتج في الخادم.',
      'تنظیم دسترسی محصول از RBAC و RLS مرکزی عبور نمی‌کند. Save Draft فقط پیش‌نویس روی دستگاه است، نه ثبت محصول در سرور.'],
    fields: fields(`
custom_attributes|conditional|Custom attributes|الحقول المخصصة|فیلدهای سفارشی|Required only when defined in Workspace.|مطلوبة حسب إعدادات المؤسسة.|بسته به Workspace ممکن است الزامی شوند.
sellable|optional|Sellable|قابل للبيع|قابل فروش|Allow product in sales when authorized.|للسماح ببيع المنتج.|اجازه استفاده در فروش.
purchasable|optional|Purchasable|قابل للشراء|قابل خرید|Allow purchase workflows for this item.|للسماح بشراء المنتج.|اجازه ثبت در خرید.
returnable|optional|Returnable|قابل للإرجاع|قابل برگشت|Enable returns under business policy.|يسمح بالإرجاع وفق السياسة.|اجازه برگشت کالا.
requires_manager_approval|optional|Manager approval required|موافقة المدير مطلوبة|تأیید مدیر الزامی|Adds approval requirement to restricted actions.|تتطلب الإجراءات الحساسة موافقة.|عملیات حساس تأیید لازم دارد.
pos_visibility|optional|POS visibility|الظهور في POS|نمایش در POS|All, selected or hidden for cashier menus.|الكل أو المحدد أو مخفي.|همه، منتخب یا پنهان.
purchase_limit|optional|Purchase limit per order|حد شراء للطلب|سقف خرید هر سفارش|Sets purchase limit where applicable.|أقصى شراء لكل طلب.|حد خرید هر سفارش.
sales_account|optional|Sales account|حساب المبيعات|حساب فروش|Ledger mapping for earned product sales.|ربط حساب المبيعات.|اتصال فروش به دفترکل.
inventory_account|optional|Inventory account|حساب المخزون|حساب موجودی|Ledger stock-asset mapping.|حساب أصول المخزون.|اتصال دارایی انبار.
cogs_account|optional|COGS account|حساب تكلفة المبيعات|حساب بهای تمام‌شده|Cost of Goods Sold mapping.|تكلفة البضاعة المباعة.|حساب بهای کالای فروخته‌شده.
stock_variance_account|optional|Stock variance account|حساب فرق الجرد|حساب اختلاف انبار|Mapping for approved count adjustments.|فروقات الجرد المعتمدة.|حساب اختلافات انبار.
owner_access|system|Owner access|صلاحيات المالك|دسترسی اونر|Edit or View, subject to central role.|تعديل أو عرض تحت صلاحيات الدور.|Edit یا View تحت مجوز مرکزی.
manager_access|system|Manager access|صلاحيات المدير|دسترسی مدیر|Edit, Stock-only or View within RLS.|تعديل أو مخزون فقط أو عرض حسب RLS.|Edit، Stock یا View مطابق RLS.
employee_access|system|Employee access|صلاحيات الموظف|دسترسی کارمند|Stock-only, View or None; central role is authoritative.|مخزون أو عرض أو لا وصول.|Stock، View یا None؛ رول مرکزی معتبر است.
save_draft|optional|Save draft|حفظ المسودة|ذخیره پیش‌نویس|Local draft only; not a saved ERP product.|مسودة محلية وليست منتجاً محفوظاً.|پیش‌نویس محلی، نه محصول ذخیره‌شده.
create_product|required|Create or Update Product|إنشاء أو تحديث المنتج|ثبت یا ویرایش محصول|Final validation and server save; verify new catalog row.|الحفظ النهائي للخادم بعد التحقق.|ذخیره نهایی در سرور؛ رکورد را بررسی کنید.`),
  }),

];
