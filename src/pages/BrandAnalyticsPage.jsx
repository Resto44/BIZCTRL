import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3, Package } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import ProductBrandManager from '@/components/products/ProductBrandManager';

export default function BrandAnalyticsPage() {
  const { lang, t } = useLanguage();
  const { activeRestaurant, loadingRestaurants } = useTenant();
  const copy = lang==='ar'?{subtitle:'إدارة العلامات والشعارات وتحليل سجلات المنتجات لهذا النشاط.',scope:'كامل النشاط',missing:'لا يوجد نشاط محدد.',loading:'جارٍ تحميل النشاط…'}:lang==='fa'?{subtitle:'مدیریت برندها، لوگوها و تحلیل رکورد محصولات همین کسب‌وکار.',scope:'کل کسب‌وکار',missing:'کسب‌وکاری انتخاب نشده است.',loading:'در حال دریافت کسب‌وکار…'}:{subtitle:'Manage brands, logos and product-record analytics for this business.',scope:'Whole business',missing:'No business selected.',loading:'Loading business…'};
  return <main data-testid="brand-analytics-page" dir={lang==='en'?'ltr':'rtl'} className="mx-auto w-full max-w-6xl min-w-0 space-y-4 p-3 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border bg-card p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><BarChart3 className="h-6 w-6 shrink-0 text-blue-600"/><h1 className="text-xl font-black sm:text-2xl">{t('brand_analytics')}</h1></div>
        <p className="mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        {activeRestaurant?.id&&<p className="mt-2 break-words text-xs font-semibold">{activeRestaurant.name} · {copy.scope}</p>}
      </div>
      <Link to="/product-management" className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold"><ArrowLeft className="h-4 w-4 rtl:rotate-180"/><Package className="h-4 w-4"/>{t('product_management')}</Link>
    </header>
    {loadingRestaurants?<p role="status">{copy.loading}</p>:!activeRestaurant?.id?<p role="status">{copy.missing}</p>:<ProductBrandManager key={activeRestaurant.id} restaurantId={activeRestaurant.id} lang={lang}/>}
  </main>;
}
