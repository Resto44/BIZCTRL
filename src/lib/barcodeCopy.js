const copy = {
  create: ['Create Barcode', 'إنشاء باركود', 'ساخت بارکد'],
  generate: ['Generate barcode', 'توليد باركود', 'تولید بارکد'],
  generateSave: ['Generate & save barcode', 'توليد وحفظ الباركود', 'تولید و ذخیرهٔ بارکد'],
  busy: ['Creating…', 'جارٍ الإنشاء…', 'در حال ساخت…'],
  search: ['Search product name, SKU or barcode', 'ابحث بالاسم أو SKU أو الباركود', 'جستجوی نام محصول، SKU یا بارکد'],
  choose: ['Choose a product', 'اختر المنتج', 'محصول را انتخاب کنید'],
  change: ['Change product', 'تغيير المنتج', 'تغییر محصول'],
  empty: ['No products found.', 'لم يتم العثور على منتجات.', 'محصولی پیدا نشد.'],
  loading: ['Loading products…', 'جارٍ تحميل المنتجات…', 'در حال بارگذاری محصولات…'],
  previous: ['Previous', 'السابق', 'قبلی'],
  next: ['Next', 'التالي', 'بعدی'],
  internal: ['Internal store barcode · CODE128', 'باركود داخلي للمتجر · CODE128', 'بارکد داخلی فروشگاه · CODE128'],
  preserved: ['Existing barcode is preserved.', 'تم الاحتفاظ بالباركود الحالي.', 'بارکد موجود حفظ می‌شود.'],
  noCode: ['This product has no barcode yet.', 'هذا المنتج بدون باركود.', 'این محصول هنوز بارکد ندارد.'],
  saved: ['Barcode saved to product', 'تم حفظ الباركود للمنتج', 'بارکد روی محصول ذخیره شد'],
  draft: ['Save the product before printing its label.', 'احفظ المنتج قبل طباعة الملصق.', 'پیش از چاپ لیبل، محصول را ذخیره کنید.'],
  size: ['Label size', 'مقاس الملصق', 'اندازهٔ لیبل'],
  copies: ['Copies (1–100)', 'النسخ (١–١٠٠)', 'تعداد (۱–۱۰۰)'],
  price: ['Show price', 'إظهار السعر', 'نمایش قیمت'],
  print: ['Print labels', 'طباعة الملصقات', 'چاپ لیبل‌ها'],
  download: ['Download barcode PNG', 'تنزيل الباركود PNG', 'دانلود بارکد PNG'],
  popup: ['Allow pop-up windows to print labels.', 'اسمح بالنوافذ المنبثقة لطباعة الملصقات.', 'برای چاپ لیبل، پنجره‌های بازشونده را اجازه دهید.'],
  invalid: ['This value cannot be rendered as CODE128.', 'لا يمكن طباعة هذه القيمة بصيغة CODE128.', 'این مقدار به صورت CODE128 قابل چاپ نیست.'],
};

export function barcodeText(lang = 'en') {
  const index = lang === 'ar' ? 1 : lang === 'fa' ? 2 : 0;
  return Object.fromEntries(Object.entries(copy).map(([key, values]) => [key, values[index]]));
}
