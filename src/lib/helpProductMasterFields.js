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
];
