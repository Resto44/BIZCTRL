import { useMemo, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  cleanProductBrands, existingProductBrand, normalizeProductBrand,
} from '@/lib/productBrands';

const copy = {
  en: {
    select: 'Select a brand', none: '— None —', add: '+ Add new brand',
    search: 'Search existing brands', new: 'New brand name',
    newHint: 'A new brand appears in this list after the product is saved.',
    empty: 'No brands have been recorded for this business yet.',
    error: 'Could not load saved brands. You can still enter a brand manually.',
    loading: 'Loading saved brands…', more: 'Refine the search to find more brands',
  },
  ar: {
    select: 'اختر العلامة التجارية', none: '— بدون علامة —', add: '+ إضافة علامة جديدة',
    search: 'بحث عن علامة تجارية', new: 'اسم العلامة الجديدة',
    newHint: 'تظهر العلامة الجديدة في القائمة بعد حفظ المنتج.',
    empty: 'لا توجد علامات تجارية مسجلة لهذا النشاط بعد.',
    error: 'تعذّر تحميل العلامات. يمكنك إدخال اسم جديد يدويًا.',
    loading: 'جارٍ تحميل العلامات…', more: 'ابحث بالاسم لعرض علامات أخرى',
  },
  fa: {
    select: 'برند را انتخاب کنید', none: '— بدون برند —', add: '+ افزودن برند جدید',
    search: 'جستجوی برندهای ثبت‌شده', new: 'نام برند جدید',
    newHint: 'برند جدید پس از ذخیره محصول در فهرست ظاهر می‌شود.',
    empty: 'هنوز برای این کسب‌وکار برندی ثبت نشده است.',
    error: 'بارگذاری برندها ناموفق بود. می‌توانید برند جدید وارد کنید.',
    loading: 'بارگذاری برندها…', more: 'برای دیدن برندهای دیگر جستجو کنید',
  },
};

/**
 * Mobile-friendly product brand selector.
 * Existing product brands are scoped in the database, not global across tenants.
 * Never guess a brand for a new product; preserve the exact saved brand on edits.
 */
export default function ProductBrandPicker({
  value = '', onChange, brands = [], loading = false, error = false, lang = 'en',
}) {
  const t = copy[lang] || copy.en;
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const options = useMemo(() => cleanProductBrands(brands, adding ? '' : value), [brands, value, adding]);
  const normalized = normalizeProductBrand(value);
  const selected = existingProductBrand(options, normalized) || normalized;
  const selectedKey = selected ? `brand:${selected}` : '__none__';
  const matching = useMemo(() => {
    const needle = normalizeProductBrand(search).toLocaleLowerCase();
    return options.filter(brand => !needle || brand.toLocaleLowerCase().includes(needle));
  }, [options, search]);
  // Keep the currently selected brand inside Radix Select even if it is
  // past the first 120 search results, so edit mode never blanks the value.
  const visible = matching.slice(0, 120);
  if (!adding && selected && !visible.some(brand => brand === selected)) visible.unshift(selected);

  const choose = key => {
    if (key === '__none__') {
      setAdding(false);
      onChange('');
    } else if (key === '__new__') {
      setAdding(true);
      setSearch('');
      onChange('');
    } else if (key.startsWith('brand:')) {
      setAdding(false);
      onChange(key.slice(6));
    }
  };
  const finishNewBrand = () => {
    const cleaned = normalizeProductBrand(value);
    const existing = existingProductBrand(brands, cleaned);
    if (existing) {
      onChange(existing);
      setAdding(false);
    } else if (value !== cleaned) {
      onChange(cleaned);
    }
  };

  return (
    <div className="min-w-0 space-y-2" data-testid="product-brand-picker">
      {options.length > 20 && !adding && <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <Input aria-label={t.search} placeholder={t.search} value={search}
          onChange={event => setSearch(event.target.value)}
          className="h-10 ps-9 text-base sm:text-sm" />
      </div>}
      <Select value={adding ? '__new__' : selectedKey} onValueChange={choose}>
        <SelectTrigger className="h-11 min-w-0 w-full bg-white text-start text-base sm:text-sm dark:bg-slate-950"
          aria-label={t.select} data-testid="product-brand-select">
          <SelectValue placeholder={t.select} />
        </SelectTrigger>
        <SelectContent className="max-h-[min(55dvh,380px)]">
          <SelectItem value="__none__">{t.none}</SelectItem>
          {visible.map(brand => (
            <SelectItem key={brand} value={`brand:${brand}`}>
              <span className="inline-flex min-w-0 items-center gap-2">
                {selected === brand && !adding ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
                <span className="truncate">{brand}</span>
              </span>
            </SelectItem>
          ))}
          <SelectItem value="__new__"><span className="inline-flex items-center gap-2 font-bold text-blue-600"><Plus className="h-4 w-4" />{t.add}</span></SelectItem>
        </SelectContent>
      </Select>
      {!adding && matching.length > 120 && <p className="text-xs text-slate-500">{t.more}</p>}
      {adding && <div className="space-y-1.5">
        <Input aria-label={t.new} value={value} maxLength={120}
          dir="auto" autoComplete="off" placeholder={t.new} className="h-11 text-base sm:text-sm"
          onChange={event => onChange(event.target.value)} onBlur={finishNewBrand} />
        <p className="text-xs text-slate-500">{t.newHint}</p>
      </div>}
      {loading && <p className="text-xs text-slate-500">{t.loading}</p>}
      {error && <p role="status" className="text-xs text-amber-700">{t.error}</p>}
      {!loading && !error && options.length === 0 && !adding &&
        <p className="text-xs text-slate-500">{t.empty}</p>}
    </div>
  );
}
