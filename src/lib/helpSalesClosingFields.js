import { fieldGuide, guideField } from './helpFieldGuideBuilders';

export const SALES_CLOSING_FIELD_GUIDES = [
  fieldGuide({
    id: "closing-field-builder-reference", category: "sales", roles: ["owner"],
    route: "/sales-closing-customization", source: "src/components/sales/SalesClosingCustomizationDialogs.jsx", title: ["Sales Closing — Form Builder field-by-field","منشئ نموذج إقفال المبيعات — كل حقل","Form Builder بستن فروش — تک‌تک فیلدها"],
    steps: [["Open Sales Closing Customization → Form Builder. Start with the protected branch, date, shift, cashier and cash reconciliation fields.","Select Add Field and set a stable key, field type, English label, Arabic label and help text. For dropdowns, add choices one per line.","Set Required, Active, Mobile and Desktop switches. Save the field and inspect the order and Live Preview before any real closing."],["افتح تخصيص إقفال المبيعات ← منشئ النموذج. ابدأ بالفرع والتاريخ والوردية والكاشير ومطابقة النقد المحمية.","اختر إضافة حقل وحدد المفتاح والنوع والاسم الإنجليزي والعربي ونص المساعدة؛ ضع كل خيار قائمة في سطر مستقل.","حدد الإلزام والتفعيل والعرض على الهاتف والكمبيوتر، ثم احفظ وتحقق من الترتيب والمعاينة قبل الإقفال الحقيقي."],["Sales Closing Customization ← Form Builder را باز کنید و فیلدهای اصلی شعبه، تاریخ، شیفت، صندوق‌دار و تطبیق نقد را بررسی کنید.","Add Field را بزنید و شناسه، نوع، نام انگلیسی و عربی و متن راهنما را تنظیم کنید؛ گزینه‌های Dropdown هرکدام یک خط باشند.","Required، Active، Mobile و Desktop را مشخص، ذخیره و ترتیب و Live Preview را قبل از ثبت واقعی بررسی کنید."]], note: ["Core system fields are protected; never disable a required field. Stable keys preserve the meaning of historic data.","حقول النظام الأساسية محمية؛ لا تعطّل الحقل المطلوب ولا تغيّر معنى المفتاح في السجلات القديمة.","فیلدهای اصلی محافظت‌شده‌اند؛ فیلد الزامی را غیرفعال نکنید و معنای شناسه تاریخی را تغییر ندهید."],
    fields: [
      guideField("branch", "system", ["Branch","الفرع","شعبه"], ["Closing belongs to this authorized business branch.","الإقفال لهذا الفرع المصرّح.","بستن فروش مربوط به شعبه مجاز است."]),
      guideField("date", "system", ["Business date","تاريخ العمل","تاریخ کاری"], ["Sale date can differ from the day you click Save.","تاريخ المبيعات قد يختلف عن يوم الحفظ.","تاریخ فروش ممکن است با روز Save متفاوت باشد."]),
      guideField("shift", "system", ["Shift","الوردية","شیفت"], ["Keep morning and evening closings separate.","افصل إقفالات الورديات المختلفة.","بستن فروش شیفت‌ها را جدا نگه دارید."]),
      guideField("cashier", "system", ["Cashier","الكاشير","صندوق‌دار"], ["Name of the employee accountable for the drawer.","الموظف المسؤول عن الصندوق.","شخص مسئول صندوق نقدی."]),
      guideField("cash_reconciliation", "system", ["Cash reconciliation","مطابقة النقد","تطبیق نقدی"], ["Compare expected cash against counted cash and differences.","قارن النقد المتوقع بالمعدود والفروقات.","نقد انتظارشده، شمرده‌شده و اختلاف را تطبیق کنید."]),
      guideField("field_key", "conditional", ["Field key","مفتاح الحقل","شناسه فیلد"], ["Stable key; a new key may derive from English label if empty.","مفتاح ثابت وقد يُشتق من الاسم الإنجليزي عند الإنشاء.","شناسه ثابت؛ هنگام ایجاد می‌تواند از نام انگلیسی ساخته شود."]),
      guideField("field_type", "optional", ["Field type","نوع الحقل","نوع فیلد"], ["Choose number currency text long_text dropdown date time checkbox or linked ERP type.","اختر رقماً أو عملة أو نصاً أو قائمة أو تاريخاً أو وقتاً أو نوع ERP.","نوع عدد، پول، متن، Dropdown، تاریخ، وقت یا فیلد ERP را انتخاب کنید."]),
      guideField("label_en", "required", ["English label","الاسم الإنجليزي","نام انگلیسی"], ["Required display label for custom fields.","اسم عرض مطلوب للحقل المخصص.","نام نمایشی الزامی برای فیلد سفارشی."]),
      guideField("label_ar", "optional", ["Arabic label","الاسم العربي","نام عربی"], ["Optional Arabic display name.","اسم العرض باللغة العربية.","نام نمایشی عربی اختیاری."]),
      guideField("help_text", "optional", ["Help text","نص المساعدة","متن راهنما"], ["Explain valid input and examples for the employee.","اشرح المطلوب من الموظف مع مثال.","مقدار مجاز و مثال را برای کارمند توضیح دهید."]),
      guideField("options", "conditional", ["Dropdown options","خيارات القائمة","گزینه‌های منو"], ["Required for dropdown; one option on each line.","مطلوبة للقائمة؛ كل خيار في سطر.","برای Dropdown لازم؛ هر گزینه یک خط."]),
      guideField("sort_order", "optional", ["Display order","ترتيب العرض","ترتیب نمایش"], ["Lower number appears earlier; arrows reorder fields.","الرقم الأصغر يظهر أولاً ويمكن استخدام الأسهم.","عدد کمتر زودتر نمایش داده می‌شود."]),
      guideField("is_required", "optional", ["Required","مطلوب","الزامی"], ["When on, field requires a valid value before save.","عند تفعيله يجب إدخال قيمة صالحة.","با فعال‌بودن، مقدار معتبر برای Save لازم می‌شود."]),
      guideField("is_active", "optional", ["Active","مفعّل","فعال"], ["Enables this field for new closings; required fields cannot be inactive.","يظهر في الإقفالات المقبلة ولا يجوز تعطيل المطلوب.","در بستن فروش آینده می‌آید؛ Required را غیرفعال نسازید."]),
      guideField("visible_mobile", "optional", ["Show on mobile","العرض على الجوال","نمایش موبایل"], ["Controls visibility on phone layouts.","يحدد ظهور الحقل على الجوال.","نمایش فیلد در صفحه موبایل را کنترل می‌کند."]),
      guideField("visible_desktop", "optional", ["Show on desktop","العرض على الكمبيوتر","نمایش دسکتاپ"], ["Controls visibility on desktop layouts.","يحدد ظهوره على الكمبيوتر.","نمایش فیلد در کمپیوتر را کنترل می‌کند."]),
      guideField("is_system", "system", ["System field flag","حقل نظام محمي","فیلد سیستمی"], ["Core fields have protected accounting identity.","حقول النظام محمية من التغييرات الخطرة.","فیلدهای اصلی حسابداری محافظت‌شده‌اند."]),
    ],
  }),
  fieldGuide({
    id: "closing-source-reference", category: "sales", roles: ["owner"],
    route: "/sales-closing-customization", source: "src/components/sales/SalesClosingCustomizationDialogs.jsx", title: ["Sales Sources — every input and accounting toggle","مصادر المبيعات — شرح جميع المدخلات ومفاتيح المحاسبة","Sales Sources — شرح تمام فیلدها و سوییچ‌های حسابداری"],
    steps: [["Open Sales Closing Customization → Sales Sources → Add Sales Source. Give the new source a meaningful name and category.","Set the default payment method, selected branches and whether sales enter revenue, cash drawer, profit and dashboard totals.","Review customer credit, driver and wallet rules carefully. Save once and check the source; deactivate old sources that have historical transactions."],["افتح تخصيص إقفال المبيعات ← مصادر المبيعات ← إضافة مصدر. اختر اسماً واضحاً وتصنيفاً مناسباً.","حدد طريقة الدفع الافتراضية والفروع وكيفية احتساب المصدر في الإيراد وصندوق النقد والربح والمؤشرات.","راجع قواعد الديون والسائقين والمحفظة، ثم احفظ مرة واحدة؛ عطّل المصادر التاريخية بدلاً من حذفها."],["Sales Closing Customization ← Sales Sources ← Add Sales Source را باز و نام واضح و دسته مناسب وارد کنید.","روش پرداخت، شعبه‌های مجاز و سوییچ‌های درآمد، صندوق نقد، سود و داشبورد را تعیین کنید.","قواعد قرض مشتری، راننده و والت را بررسی و یک‌بار Save کنید؛ منبع تاریخی را غیرفعال کنید نه حذف."]], note: ["Cash, card/network, customer credit and wallet transfers are different. Wrong inclusion switches can double count sales and profit.","النقد والشبكة والآجل وتحويلات المحفظة مختلفة؛ خطأ مفاتيح الاحتساب قد يكرر المبيعات والأرباح.","کاش، شبکه، قرض مشتری و انتقال والت متفاوت‌اند؛ سوییچ نادرست باعث دوباره‌شماری فروش و سود می‌شود."],
    fields: [
      guideField("name_en", "required", ["English source name","الاسم الإنجليزي للمصدر","نام انگلیسی منبع"], ["Required source identity e.g. Delivery Sales.","اسم مطلوب مثل مبيعات التوصيل.","نام الزامی مثل Delivery Sales."]),
      guideField("name_ar", "optional", ["Arabic source name","الاسم العربي","نام عربی منبع"], ["Displayed in Arabic interface.","يظهر في الواجهة العربية.","در رابط عربی نمایش داده می‌شود."]),
      guideField("name_fa", "optional", ["Persian source name","الاسم الفارسي","نام فارسی منبع"], ["Displayed in Persian interface.","يظهر في الواجهة الفارسية.","در رابط فارسی نمایش داده می‌شود."]),
      guideField("description", "optional", ["Description","الوصف","توضیحات"], ["Describe business purpose of the source.","اشرح الغرض التجاري من المصدر.","هدف تجاری منبع را شرح دهید."]),
      guideField("category", "optional", ["Category","التصنيف","دسته"], ["Choose delivery wholesale counter online corporate credit bank_transfer or Other.","اختر التوصيل أو الجملة أو الكاونتر أو الإنترنت أو الآجل أو تحويل بنكي أو أخرى.","دلیوری، عمده، کانتر، آنلاین، قرضی، انتقال بانکی یا سایر را انتخاب کنید."]),
      guideField("subcategory", "optional", ["Subcategory","التصنيف الفرعي","زیر دسته"], ["Optional finer classification e.g. Drivers.","تصنيف فرعي اختياري مثل السائقين.","تقسیم جزئی‌تر مثل Drivers."]),
      guideField("default_payment_method", "optional", ["Default payment method","طريقة الدفع الافتراضية","روش پرداخت پیش‌فرض"], ["Choose cash card network or a configured method; network is not cash.","اختر نقداً أو بطاقة أو طريقة أخرى؛ الشبكة ليست نقداً.","کاش، کارت/شبکه یا روش تعریف‌شده؛ شبکه نقد نیست."]),
      guideField("icon", "optional", ["Source icon","أيقونة المصدر","آیکون منبع"], ["Visual icon; does not affect accounting.","أيقونة شكلية لا تغير المحاسبة.","نشانه ظاهری، بدون تأثیر حسابداری."]),
      guideField("color", "optional", ["Color","اللون","رنگ"], ["Visual marker for distinguishing sources.","لون للتمييز بين المصادر.","رنگ برای تمایز منابع."]),
      guideField("sort_order", "optional", ["Display order","ترتيب العرض","ترتیب"], ["Smaller number comes first in source lists.","الرقم الأصغر يظهر أولاً.","عدد کمتر زودتر نمایش داده می‌شود."]),
      guideField("allows_driver_entries", "optional", ["Driver-linked entries","إدخالات السائقين","رکورد راننده"], ["Links branch Driver Master records when relevant.","يربط سجلات السائقين الخاصة بالفرع.","در صورت استفاده Driver Master وصل می‌شود."]),
      guideField("customer_credit", "optional", ["Customer credit-linked entries","البيع الآجل للعملاء","فروش قرضی مشتری"], ["Finalized credit sale creates receivable; collection is not a new sale.","البيع الآجل ينشئ ديناً؛ التحصيل ليس بيعاً جديداً.","فروش قرضی طلب می‌سازد؛ دریافت طلب فروش تازه نیست."]),
      guideField("is_global", "optional", ["All branches","جميع الفروع","تمام شعبه‌ها"], ["When off, select particular branches below.","عند تعطيله اختر فروعاً محددة.","وقتی خاموش است، شعبه‌های مشخص را انتخاب کنید."]),
      guideField("branch_ids", "conditional", ["Selected branches","الفروع المختارة","شعبه‌های انتخابی"], ["Required when All branches is off.","مطلوبة عند إلغاء جميع الفروع.","وقتی All branches خاموش است لازم است."]),
      guideField("is_active", "optional", ["Active for new closings","مفعّل للإقفالات الجديدة","فعال برای بستن فروش"], ["Deactivate used historical sources instead of deleting them.","عطّل المصدر التاريخي بدلاً من حذفه.","منبع دارای تاریخچه را غیرفعال کنید، نه حذف."]),
      guideField("included_in_revenue", "optional", ["Include in revenue","احتساب الإيرادات","شامل درآمد"], ["Count real sales, never duplicate internal wallet transfers.","احتسب البيع الحقيقي دون تكرار تحويلات المحفظة.","تنها فروش واقعی؛ انتقال داخلی والت فروش نیست."]),
      guideField("included_in_cash_register", "optional", ["Include in cash register","احتساب في صندوق النقد","شامل صندوق نقد"], ["Enable only when source actually increases physical drawer cash.","فعّله عند دخول النقد فعلاً في الصندوق.","فقط وقتی پول نقد وارد صندوق می‌شود."]),
      guideField("included_in_dashboard_kpi", "optional", ["Include in dashboard KPI","احتساب في مؤشرات اللوحة","شامل KPI داشبورد"], ["Show eligible source totals in dashboard KPIs.","اعرض المجاميع المؤهلة في مؤشرات اللوحة.","مجموع منبع در شاخص‌های داشبورد."]),
      guideField("included_in_profit_calc", "optional", ["Include in profit","احتساب في الربح","شامل سود"], ["Use only for eligible earned income, not internal settlements.","استخدمه لإيراد مستحق وليس تسوية داخلية.","فقط درآمد واقعی، نه تسویه داخلی."]),
      guideField("requires_customer", "optional", ["Require customer","اشتراط عميل","مشتری الزامی"], ["Require customer selection for this source.","اشترط اختيار العميل عند استخدام المصدر.","برای این منبع مشتری باید انتخاب شود."]),
      guideField("requires_pos_device", "optional", ["Require POS device","اشتراط جهاز POS","دستگاه POS الزامی"], ["Require register terminal for traceable settlement.","اشترط جهاز POS للمطابقة.","برای تطبیق، دستگاه POS باید انتخاب شود."]),
      guideField("requires_reference", "optional", ["Require reference","اشتراط رقم مرجع","شماره مرجع الزامی"], ["Require receipt transfer or bank reference number.","اشترط رقم الإيصال أو التحويل.","شماره رسید یا حواله لازم می‌شود."]),
      guideField("requires_wallet", "optional", ["Require wallet","اشتراط محفظة","والت الزامی"], ["Require linked wallet for wallet-related source; wallet transfer is not another sale.","اشترط المحفظة للمصدر المرتبط بها؛ التحويل ليس بيعاً.","برای منبع والت‌محور، اتصال والت لازم؛ انتقال فروش تازه نیست."]),
    ],
  }),
  fieldGuide({
    id: "closing-payment-reference", category: "sales", roles: ["owner"],
    route: "/sales-closing-customization", source: "src/pages/SalesClosingCustomization.jsx", title: ["Payment Methods — all fields and channel mapping","طرق الدفع — جميع الحقول والتصنيف المحاسبي","Payment Methods — تمام فیلدها و طبقه‌بندی حسابداری"],
    steps: [["Select Payment Methods → Add Payment Method. Set a machine-readable code and an English display name.","Add optional Arabic name and display order, then verify the displayed accounting channel.","Switch Active on only for valid methods and save. Use card or mada codes for network payments, not an arbitrary custom code."],["اختر طرق الدفع ← إضافة طريقة دفع، ثم أدخل رمزاً ثابتاً واسم عرض إنجليزياً.","أضف الاسم العربي والترتيب إن أردت، وتحقق من قناة المحاسبة المعروضة.","فعّل الطرق المطلوبة واحفظها؛ استخدم card أو mada لمبيعات الشبكة لا رمزاً عشوائياً."],["Payment Methods ← Add Payment Method را باز کنید؛ کد ثابت و نام انگلیسی را بنویسید.","نام عربی و ترتیب اختیاری است؛ کانال حسابداری نمایش‌داده‌شده را کنترل کنید.","روش لازم را Active و Save کنید؛ برای شبکه کد card یا mada به‌کار ببرید، نه کد دلخواه ناشناخته."]], note: ["Unknown custom codes can appear as Other; payment-channel labels do not convert a cash receipt into a card settlement.","الأكواد المخصصة المجهولة تُعامل كأخرى؛ تغيير الاسم لا يحول النقد إلى شبكة.","کد سفارشی ناشناخته ممکن است Other شود؛ تغییر نام، مبلغ نقد را شبکه نمی‌کند."],
    fields: [
      guideField("code", "required", ["Payment method code","رمز طريقة الدفع","کد روش پرداخت"], ["Use English letters numbers underscore; card and mada are network codes.","حروف إنجليزية وأرقام وشرطة سفلية؛ card و mada للشبكة.","حروف انگلیسی عدد زیرخط؛ card و mada برای شبکه."]),
      guideField("name_en", "required", ["English display name","الاسم الإنجليزي","نام انگلیسی"], ["A payment method must have an English name.","يجب أن يكون لطريقة الدفع اسم إنجليزي.","روش پرداخت باید نام انگلیسی داشته باشد."]),
      guideField("name_ar", "optional", ["Arabic display name","الاسم العربي","نام عربی"], ["Localized name for Arabic operators.","الاسم المعروض بالعربية.","نام برای کاربران عربی."]),
      guideField("sort_order", "optional", ["Display order","ترتيب العرض","ترتیب"], ["Smaller numbers display earlier.","الأصغر يظهر أولاً.","عدد کمتر مقدم است."]),
      guideField("is_active", "optional", ["Active for new closings","مفعّل للإقفالات الجديدة","فعال برای بستن فروش"], ["Enable only methods available to staff.","فعّل طرق الدفع المتاحة للموظفين.","فقط روش در دسترس را فعال کنید."]),
      guideField("accounting_channel", "system", ["Accounting channel preview","قناة المحاسبة","کانال حسابداری"], ["Channel is derived from method code; custom codes may be Other.","القناة مشتقة من الرمز؛ المخصص قد يكون أخرى.","کانال از کد ساخته می‌شود؛ کد ناشناس ممکن است Other باشد."]),
    ],
  }),
  fieldGuide({
    id: "closing-configuration-reference", category: "sales", roles: ["owner"],
    route: "/sales-closing-customization", source: "src/pages/SalesClosingCustomization.jsx", title: ["Calculations, Layouts, Validation, Permissions and Live Preview","الحسابات والتخطيط والتحقق والصلاحيات والمعاينة","محاسبات، Layout، اعتبارسنجی، صلاحیت‌ها و Preview"],
    steps: [["Review Form Builder, Sales Sources and Payment Methods first, then open Calculations and choose automatic ERP totals.","Under Layout and Validation, choose summaries per device and decide whether cash reconciliation is mandatory.","Read Permissions, test Live Preview and press Save Configuration; Reload only fetches saved settings and does not save changes."],["راجع الحقول ومصادر المبيعات وطرق الدفع، ثم اختر استخدام مجموع المبيعات الآلي من قسم الحسابات.","من التخطيط والتحقق حدد ملخص الهاتف والكمبيوتر وهل مطابقة النقد إلزامية.","راجع الصلاحيات والمعاينة الحية واضغط حفظ الإعدادات؛ إعادة التحميل لا تحفظ تغييراتك."],["ابتدا Form Builder، Sales Sources و Payment Methods را بررسی، بعد در Calculations مجموع اتومات فروش را تعیین کنید.","در Layout و Validation خلاصه موبایل/دسکتاپ و الزام تطبیق نقد را تنظیم کنید.","Permissions و Live Preview را ببینید و Save Configuration را بزنید؛ Reload تغییرات ذخیره‌نشده را نگه نمی‌دارد."]], note: ["Live Preview is illustrative and posts no closing. Automated totals still require reconciliation of cash, network and customer credit.","المعاينة تجريبية ولا ترحّل إقفالاً؛ المجاميع التلقائية لا تلغي مطابقة النقد والشبكة والآجل.","Live Preview فقط نمونه است و فروش ثبت نمی‌کند؛ مجموع اتومات جای تطبیق نقد، شبکه و قرض مشتری نیست."],
    fields: [
      guideField("automatic_totals", "optional", ["Automatic ERP totals","مجاميع ERP الآلية","مجموع اتومات ERP"], ["Uses recorded ERP sales to fill totals instead of manual duplication.","يستخدم المبيعات المسجلة بدل التكرار اليدوي.","فروش ثبت‌شده ERP را برای مجموع استفاده می‌کند."]),
      guideField("mobile_summary", "optional", ["Show mobile summary","عرض ملخص الجوال","خلاصه موبایل"], ["Show running closing summary on narrow screens.","اعرض ملخص الإقفال على الجوال.","خلاصه بستن فروش در موبایل."]),
      guideField("desktop_summary", "optional", ["Show desktop summary","عرض ملخص الكمبيوتر","خلاصه دسکتاپ"], ["Show running closing summary on wide screens.","اعرض الملخص على الكمبيوتر.","خلاصه بستن فروش در کمپیوتر."]),
      guideField("require_cash_reconciliation", "optional", ["Cash reconciliation required","مطابقة النقد إلزامية","تطبیق نقدی الزامی"], ["Require checking counted cash against expected cash.","ألزم فحص النقد المعدود مقابل المتوقع.","شمرده‌شده را با نقد انتظارشده بررسی می‌کند."]),
      guideField("owner_only_customization", "system", ["Owner or admin permissions","صلاحيات المالك أو المسؤول","صلاحیت اونر یا ادمین"], ["Only Owner or delegated administrator configures closings.","التهيئة للمالك أو المسؤول المفوض فقط.","فقط اونر یا ادمین مجاز تنظیم می‌کند."]),
      guideField("live_preview", "system", ["Live Preview","المعاينة المباشرة","پیش‌نمایش"], ["Shows a sample without saving a real closing.","عرض تجريبي دون حفظ إقفال فعلي.","نمایش نمونه، بدون ذخیره معامله."]),
      guideField("save_configuration", "required", ["Save Configuration","حفظ الإعدادات","ذخیره تنظیمات"], ["Persists calculation layout and validation switches; Reload does not save.","يحفظ الإعدادات؛ إعادة التحميل لا تحفظ التغييرات.","تنظیمات را ذخیره می‌کند؛ Reload جای Save نیست."]),
    ],
  }),

  fieldGuide({
    id: 'closing-physical-cash-reconciliation',
    category: 'sales', roles: ['owner','manager'],
    route: '/sales',
    source: 'src/components/sales/CashReconciliationPanel.jsx',
    title: [
      'Sales Closing: Opening, Actual, Closing and variance',
      'إقفال المبيعات: النقد الافتتاحي والفعلي والختامي والفروقات',
      'بستن فروش: Opening، Actual، Closing و اختلاف صندوق'
    ],
    steps: [
      [
        'Select the correct branch, date, shift and cashier. Opening Cash comes from a verified prior physical count; an unknown value is not zero.',
        'Review cash sales, cash in and cash out. Count actual cash physically; expected = opening + cash sales + in - out. Network, credit and wallet transfers are not physical cash.',
        'Compare Actual vs Expected. Closing Cash is the counted physical amount. If the opening is missing or ambiguous, ask the Owner to verify a documented start-of-shift count with a reason. An overdrawn cash ledger requires correction before Finalize.'
      ],
      [
        'اختر الفرع والتاريخ والوردية والكاشير الصحيحين. النقد الافتتاحي يأتي من عد فعلي موثق للسابق؛ المبلغ غير المعروف ليس صفراً.',
        'راجع النقد المباع والوارد والصادر وعدّ النقد الفعلي. المتوقع = الافتتاحي + المبيعات النقدية + الوارد - الصادر. الشبكة والآجل والمحفظة ليست نقداً فعلياً.',
        'قارن الفعلي بالمتوقع؛ الختامي هو النقد المعدود. عند غياب الافتتاحي أو تعدد الصناديق، يجب على المالك توثيق العد في بداية الوردية وسبب التصحيح. الرصيد المتوقع السالب يتطلب مطابقة قبل الإقفال.'
      ],
      [
        'شعبه، تاریخ، شیفت و صندوق‌دار را درست انتخاب کنید. Opening فقط از شمارش واقعی معتبر شیفت قبل می‌آید؛ نامعلوم مساوی صفر نیست.',
        'Cash Sales، Cash In و Cash Out را بررسی و مبلغ صندوق را بشمارید. Expected = Opening + Cash Sales + In − Out؛ شبکه، قرض و انتقال والت پول نقد نیستند.',
        'Actual را با Expected تطبیق کنید؛ Closing همان مبلغ واقعی شمرده‌شده است. اگر Opening نامعلوم یا چندصندوقی است، Owner با سند معتبر آغاز شیفت و دلیل آن را تأیید کند. Expected منفی قبل از Finalize باید اصلاح شود.'
      ]
    ],
    note: [
      'Owner verification is an immutable audited starting count, never permission to invent SAR 0 or replace current Actual Cash. Legacy counts remain intact. Shortage/overage does not alter sales or profit.',
      'تأكيد المالك سجل افتتاحي غير قابل للتعديل ولا يسمح بتخمين صفر أو استبدال النقد الفعلي. تبقى السجلات القديمة كما هي؛ العجز والزيادة لا يغيران البيع أو الربح.',
      'تأیید Owner یک سند افتتاحیه غیرقابل‌ویرایش است، نه اجازه درج صفر ساختگی یا جایگزینی Actual. تاریخچه قدیمی دست‌نخورده می‌ماند؛ کسری و اضافه مبلغ فروش را تغییر نمی‌دهد.'
    ],
    fields: [
      guideField('opening_cash','conditional',['Opening Cash','النقد الافتتاحي','موجودی آغاز'],['Verified physical count carried from the preceding relevant shift, or owner-certified count at shift start.','النقد المعدود بالوردية السابقة أو الموثق من المالك عند بداية الوردية.','مبلغ واقعی شمارش‌شده قبلی یا تأییدشده توسط Owner در آغاز شیفت.']),
      guideField('cash_sales','optional',['Cash Sales','المبيعات النقدية','فروش نقدی'],['Actual cash sales only; card and credit are excluded.','المبيعات النقدية فقط دون الشبكة والآجل.','فقط فروش نقدی؛ نه شبکه و قرض.']),
      guideField('cash_in','optional',['Cash In','النقد الوارد','ورودی نقد'],['Posted cash funding and collections for the correct drawer; not automatic sales revenue.','حركات النقد الواردة المثبتة، وليست إيراد بيع تلقائياً.','پول ورودی ثبت‌شده، نه درآمد فروش اتومات.']),
      guideField('cash_out','optional',['Cash Out','النقد الصادر','خروجی نقد'],['Posted payments/handovers physically removed from drawer.','المدفوعات والتسليمات الخارجة فعلياً من الصندوق.','پرداخت یا تحویل واقعی خارج‌شده از صندوق.']),
      guideField('expected_cash','system',['Expected Cash','النقد المتوقع','نقد مورد انتظار'],['Opening + cash sales + posted cash in - posted cash out; negative is an error to investigate.','الافتتاحي + النقد المباع + الوارد - الصادر؛ السالب يحتاج مراجعة.','Opening + Cash Sales + Cash In − Cash Out؛ مقدار منفی نیاز به بررسی دارد.']),
      guideField('actual_cash','required',['Actual Cash','النقد الفعلي','نقد واقعی'],['Physically counted cash at closing. A real zero is different from no count.','النقد المعدود عند الإقفال؛ الصفر المعدود يختلف عن عدم العد.','پول نقد شمرده‌شده هنگام بستن؛ صفر واقعی با شمارش‌نشدن فرق دارد.']),
      guideField('cash_variance','system',['Variance','فرق النقد','اختلاف صندوق'],['Actual minus Expected; positive overage, negative shortage; not another sale.','الفعلي ناقص المتوقع؛ موجب زيادة وسالب عجز، وليس بيعاً جديداً.','Actual − Expected؛ مثبت اضافه و منفی کسری، نه فروش جدید.']),
      guideField('closing_cash','system',['Closing Cash','النقد الختامي','موجودی پایان'],['Verified physical drawer count for shift end, distinct from wallet settlement.','عد النقد الفعلي في ختام الوردية بعيداً عن تسوية المحفظة.','مبلغ واقعی صندوق در پایان شیفت، جدا از تسویه والت.']),
      guideField('opening_owner_verification','conditional',['Owner opening verification','توثيق الافتتاح من المالك','تأیید افتتاحیه اونر'],['If no reliable prior count exists, require recorded shift-start amount, reason and owner permission.','عند غياب العد السابق يلزم مبلغ بداية الوردية والسبب وموافقة المالك.','اگر شمارش قبلی معتبر نیست، سند مبلغ آغاز شیفت، دلیل و تأیید Owner لازم است.'])
    ]
  }),
];
