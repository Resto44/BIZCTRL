// Shared by the server sender and the settings preview.
// Labels describe the actual table; unknown tables retain their own name.
const entities: Record<string, [string,string,string]> = {
 daily_sales:['Sales closing','إقفال المبيعات','بستن فروشات'],
 sales_invoices:['Sales invoice','فاتورة مبيعات','فاکتور فروش'],
 purchases:['Purchase','شراء','خرید'], supplier_invoices:['Purchase invoice','فاتورة مشتريات','فاکتور خرید'],
 purchase_orders:['Purchase order','أمر شراء','سفارش خرید'], supplier_payments:['Supplier payment','دفعة مورد','پرداخت تأمین‌کننده'], suppliers:['Supplier','مورد','تأمین‌کننده'],
 expenses:['Expense','مصروف','مصرف'], expense_categories:['Expense category','فئة مصروفات','کتگوری مصارف'],
 products:['Product','منتج','محصول'], product_categories:['Product category','فئة منتجات','کتگوری محصول'], categories:['Category','فئة','کتگوری'],
 sales_categories:['Sales category','فئة مبيعات','کتگوری فروش'], sales_sources:['Sales source','مصدر مبيعات','منبع فروش'],
 customers:['Customer','عميل','مشتری'], debt_records:['Customer credit','ائتمان عميل','کردیت مشتری'], debt_invoices:['Credit invoice','فاتورة آجلة','فاکتور کردیت'],
 debt_payments:['Debt payment','سداد دين','پرداخت بدهی'], debt_receipts:['Debt receipt','إيصال سداد دين','رسید بدهی'],
 customer_collections:['Customer collection','تحصيل عميل','دریافت از مشتری'], collection_actions:['Collection action','إجراء تحصيل','عملیات دریافت'],
 drivers:['Driver','سائق','راننده'], driver_sales_entries:['Delivery sale','مبيعات توصيل','فروش دلیوری'],
 driver_settlements:['Driver settlement','تسوية سائق','تسویهٔ راننده'], driver_debts:['Driver debt','دين سائق','بدهی راننده'], driver_shifts:['Driver shift','وردية سائق','شیفت راننده'],
 delivery_orders:['Delivery order','طلب توصيل','سفارش دلیوری'], orders:['Order','طلب','سفارش'], order_items:['Order item','صنف طلب','قلم سفارش'], payments:['Payment','دفعة','پرداخت'],
 retail_pos_transactions:['POS transaction','عملية نقطة بيع','تراکنش POS'], retail_pos_transaction_items:['POS item','صنف نقطة بيع','قلم POS'], retail_pos_transaction_payments:['POS payment','دفعة نقطة بيع','پرداخت POS'],
 retail_pos_shifts:['POS shift','وردية نقطة بيع','شیفت POS'], retail_pos_devices:['POS device','جهاز نقطة بيع','دستگاه POS'],
 network_accounts:['Network account','حساب شبكة','حساب شبکه'], network_pos_devices:['Network device','جهاز شبكة','دستگاه شبکه'],
 network_reconciliations:['Network reconciliation','مطابقة شبكة','تطبیق شبکه'], network_transfers:['Network transfer','تحويل شبكة','انتقال شبکه'],
 cash_movements:['Cash movement','حركة نقدية','حرکت نقدی'], cash_register_entries:['Cash register entry','قيد صندوق','رکورد صندوق'], cash_shortages:['Cash shortage','عجز نقدي','کسری نقدی'],
 daily_cash_settlements:['Cash settlement','تسوية نقدية','تسویهٔ نقدی'], owner_cash_injections:['Owner funding','تمويل المالك','تمویل مالک'],
 treasury_accounts:['Treasury account','حساب خزينة','حساب خزانه'], wallet_transactions:['Wallet transaction','عملية محفظة','تراکنش کیف پول'], settlement_records:['Settlement','تسوية','تسویه'],
 employees:['Employee','موظف','کارمند'], attendance:['Attendance','حضور','حاضری'], staff_attendance:['Staff attendance','حضور الموظفين','حاضری کارمندان'],
 payroll_runs:['Payroll','مسير رواتب','معاشات'], salary_advances:['Salary advance','سلفة راتب','پیش‌پرداخت معاش'], employee_bonuses:['Employee bonus','مكافأة موظف','پاداش کارمند'],
 inventory:['Inventory','مخزون','موجودی'], inventory_transactions:['Stock movement','حركة مخزون','حرکت موجودی'], inventory_transfers:['Stock transfer','تحويل مخزون','انتقال موجودی'], inventory_waste:['Stock waste','هدر مخزون','ضایعات موجودی'],
 retail_inventory_documents:['Inventory document','مستند مخزون','سند موجودی'], retail_inventory_ledger:['Inventory ledger','دفتر مخزون','دفتر موجودی'],
 ingredients:['Ingredient','مكون','مواد اولیه'], recipes:['Recipe','وصفة','دستور غذا'], production_orders:['Production order','أمر إنتاج','سفارش تولید'],
 branches:['Branch','فرع','شعبه'], payment_methods:['Payment method','طريقة دفع','روش پرداخت'],
 subscriptions:['Subscription','اشتراك','اشتراک'], subscription_payments:['Subscription payment','دفعة اشتراك','پرداخت اشتراک'],
 brand_settings:['Brand settings','إعدادات العلامة','تنظیمات برند'], app_settings:['App settings','إعدادات التطبيق','تنظیمات اپ'],
 tasks:['Task','مهمة','وظیفه'], reservations:['Reservation','حجز','رزرو'], dining_tables:['Dining table','طاولة','میز'], promotions:['Promotion','عرض','تخفیف'],
 active_alerts:['Alert','تنبيه','هشدار'], announcements:['Announcement','إعلان','اطلاعیه'], approval_policies:['Approval policy','سياسة موافقات','پالیسی تأیید'],
 batch_documents:['Batch document','مستند دفعة','سند بسته'], branch_assignments:['Branch assignment','تعيين فرع','تخصیص شعبه'], branch_product_assortments:['Branch product','منتج الفرع','محصول شعبه'],
 customer_addresses:['Customer address','عنوان عميل','آدرس مشتری'], customer_notes:['Customer note','ملاحظة عميل','یادداشت مشتری'], customer_reviews:['Customer review','تقييم عميل','نظر مشتری'],
 deduction_rules:['Deduction rule','قاعدة خصم','قاعدهٔ کسر'], driver_invites:['Driver invitation','دعوة سائق','دعوت راننده'], driver_requests:['Driver request','طلب سائق','درخواست راننده'],
 employee_invites:['Employee invitation','دعوة موظف','دعوت کارمند'], erp_invitations:['ERP invitation','دعوة ERP','دعوت ERP'], erp_registrations:['ERP registration','تسجيل ERP','ثبت‌نام ERP'], erp_role_permissions:['Role permission','صلاحية دور','صلاحیت نقش'],
 inventory_batches:['Inventory batch','دفعة مخزون','بستهٔ موجودی'], loyalty_transactions:['Loyalty transaction','عملية ولاء','تراکنش وفاداری'], manager_invites:['Manager invitation','دعوة مدير','دعوت مدیر'], network_import_batches:['Network import','استيراد الشبكة','واردکردن شبکه'],
 online_order_categories:['Online order category','فئة طلبات إلكترونية','کتگوری سفارش آنلاین'], owner_personal_finance:['Owner finance','مالية المالك','مالی مالک'], pos_reconciliation:['POS reconciliation','مطابقة نقطة بيع','تطبیق POS'],
 product_import_jobs:['Product import','استيراد منتجات','واردکردن محصولات'], product_modifier_options:['Product option','خيار منتج','گزینهٔ محصول'], product_modifiers:['Product modifier','إضافة منتج','افزودنی محصول'], product_serials:['Product serial','رقم تسلسلي للمنتج','سریال محصول'], product_sizes:['Product size','حجم منتج','اندازهٔ محصول'], product_units:['Product unit','وحدة منتج','واحد محصول'], product_variants:['Product variant','نوع منتج','نوع محصول'],
 recipe_ingredients:['Recipe ingredient','مكون وصفة','مواد دستور غذا'], retail_inventory_balances:['Inventory balance','رصيد مخزون','ماندهٔ موجودی'], retail_inventory_lines:['Inventory line','بند مخزون','قلم موجودی'], retail_inventory_lots:['Inventory lot','دفعة مخزون','محمولهٔ موجودی'], retail_inventory_warehouses:['Warehouse','مستودع','گدام'],
 retail_pos_approval_requests:['POS approval','موافقة نقطة بيع','تأیید POS'], role_templates:['Role template','قالب دور','قالب نقش'], sales_closing_config:['Sales closing settings','إعدادات إقفال المبيعات','تنظیمات بستن فروش'], sales_closing_correction_requests:['Sales correction request','طلب تصحيح المبيعات','درخواست اصلاح فروش'], sales_closing_fields:['Sales closing field','حقل إقفال المبيعات','فیلد بستن فروش'],
 scheduled_reports:['Scheduled report','تقرير مجدول','گزارش زمان‌بندی‌شده'], sponsor_transactions:['Sponsor transaction','معاملة كفيل','تراکنش کفیل'], staff_rosters:['Staff roster','جدول الموظفين','برنامهٔ کارمندان'], subscription_feature_overrides:['Subscription feature','ميزة اشتراك','قابلیت اشتراک'], support_tickets:['Support ticket','تذكرة دعم','درخواست پشتیبانی'],

};
export function entityLabel(entity: string, language: string) {
 return entities[entity]?.[language==='fa'?2:language==='ar'?1:0] || String(entity || '').replaceAll('_',' ');
}
export const EVENT_LABELS: Record<string,Record<string,string>> = {
 en:{amount:'Record amount',cash:'Cash collected',network:'Network collected',status:'Status',draft:'Draft',finalized:'Finalized',locked:'Locked',approved:'Approved',posted:'Posted',cancelled:'Cancelled',pending:'Pending',paid:'Paid',deleted:'Deleted',record:'Record'},
 ar:{amount:'مبلغ السجل',cash:'النقد المحصل',network:'الشبكة المحصلة',status:'الحالة',draft:'مسودة',finalized:'معتمد',locked:'مقفل',approved:'موافق عليه',posted:'مرحّل',cancelled:'ملغى',pending:'قيد الانتظار',paid:'مدفوع',deleted:'محذوف',record:'سجل'},
 fa:{amount:'مبلغ رکورد',cash:'نقد دریافت‌شده',network:'شبکه دریافت‌شده',status:'وضعیت',draft:'پیش‌نویس',finalized:'نهایی',locked:'قفل‌شده',approved:'تأییدشده',posted:'ثبت نهایی',cancelled:'لغوشده',pending:'در انتظار',paid:'پرداخت‌شده',deleted:'حذف‌شده',record:'رکورد'},
};
export function isFinancialEvent(event: any) {
 return !event?.entity || /^(daily_sales|sales_invoices|purchases|supplier_invoices|supplier_payments|expenses|driver_sales_entries|driver_settlements|delivery_orders|orders|payments|debt_records|debt_invoices|debt_payments|debt_receipts|cash_movements|daily_cash_settlements|retail_pos_transactions|retail_pos_transaction_payments)$/.test(event.entity);
}
export function recordDetails(event: any, language: string, currency: string, showReference: boolean) {
 const c=event.context || {};
 const t=EVENT_LABELS[language] || EVENT_LABELS.en;
 const money=(value: any)=>value!==null && value!==undefined && value!=='' && Number.isFinite(Number(value))
  ? `${new Intl.NumberFormat(language,{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value))} ${currency}` : null;
 const lines:string[]=[];
 if(showReference && event.reference) lines.push(String(event.reference).slice(0,100));
 const amount=money(c.amount);
 if(amount!==null) lines.push(`${t.amount}: ${amount}`);
 if(event.entity==='driver_sales_entries' || event.entity==='driver_settlements') {
  const cash=money(c.cash),network=money(c.network);
  if(cash!==null) lines.push(`${t.cash}: ${cash}`);
  if(network!==null) lines.push(`${t.network}: ${network}`);
 }
 if(c.status) lines.push(`${t.status}: ${t[c.status] || String(c.status).slice(0,40)}`);
 return lines;
}

export const isKnownEntity=(entity: string)=>Object.prototype.hasOwnProperty.call(entities,entity);
