import { restaurantMaterialFilter } from '@/lib/restaurantProducts';
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/LanguageContext';
import { useTenant } from '@/lib/TenantContext';
import { usePurchaseCategories } from '@/hooks/usePurchaseCategories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import BranchSelect from '@/components/shared/BranchSelect';
import { format } from 'date-fns';
import { Upload, X, Loader2, Tag, Settings2, PlusCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

const UI = {
  en: {
    date: 'Date', branch: 'Branch', category: 'Category', product: 'Product',
    quantity: 'Quantity', price: 'Price (optional)', notes: 'Notes (optional)',
    receipt: 'Receipt / Invoice', upload: 'Upload receipt photo',
    save: 'Save', cancel: 'Cancel', estimated_total: 'Estimated Total',
    select_category: 'Select category...',
    no_categories: 'No categories yet',
    manage_categories: 'Manage Categories',
    add_category: 'Add Category',
    select_product: 'Select product',
    supplier_hint: 'Supplier name, invoice ref...',
  },
  ar: {
    date: 'التاريخ', branch: 'الفرع', category: 'الفئة', product: 'المنتج',
    quantity: 'الكمية', price: 'السعر (اختياري)', notes: 'ملاحظات (اختياري)',
    receipt: 'الإيصال / الفاتورة', upload: 'رفع صورة الإيصال',
    save: 'حفظ', cancel: 'إلغاء', estimated_total: 'الإجمالي التقديري',
    select_category: 'اختر الفئة...',
    no_categories: 'لا توجد فئات بعد',
    manage_categories: 'إدارة الفئات',
    add_category: 'إضافة فئة',
    select_product: 'اختر المنتج',
    supplier_hint: 'اسم المورد، رقم الفاتورة...',
  },
  fa: {
    date: 'تاریخ', branch: 'فرع', category: 'دسته‌بندی', product: 'محصول',
    quantity: 'مقدار', price: 'قیمت (اختیاری)', notes: 'یادداشت (اختیاری)',
    receipt: 'رسید / فاکتور', upload: 'آپلود رسید',
    save: 'ذخیره', cancel: 'لغو', estimated_total: 'جمع تخمینی',
    select_category: 'انتخاب دسته...',
    no_categories: 'هنوز دسته‌ای ندارید',
    manage_categories: 'مدیریت دسته‌ها',
    add_category: 'افزودن دسته',
    select_product: 'انتخاب محصول',
    supplier_hint: 'نام تامین‌کننده، شماره فاکتور...',
  },
};

export default function PurchaseForm({ initial, onSubmit, onCancel }) {
  const { lang, currency } = useLanguage();
  const u = UI[lang] || UI.en;
  const { managerBranch, branches, activeRestaurant, activeRestaurantId } = useTenant();

  const { data: products = [] } = useQuery({
    queryKey: ['products', activeRestaurantId, 'purchase-materials'],
    queryFn: () => base44.entities.Product.filter({ restaurant_id: activeRestaurantId, ...restaurantMaterialFilter(activeRestaurant) }, 'name', 10000), enabled: Boolean(activeRestaurantId),
  });

  const { options: categoryOptions, isLoading: loadingCats } = usePurchaseCategories();

  const defaultBranch = initial?.branch || managerBranch || branches[0]?.key || '';

  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    branch: defaultBranch,
    product_id: '',
    qty: '',
    current_price: '',
    category: '',
    notes: '',
    receipt_url: '',
    ...initial,
  });
  const [uploading, setUploading] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState(initial?.receipt_url || '');

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const selectedProduct = products.find(p => p.product_id === form.product_id);

  const handleReceiptUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setReceiptPreview(file_url);
    handleChange('receipt_url', file_url);
    setUploading(false);
  };

  const clearReceipt = () => {
    setReceiptPreview('');
    handleChange('receipt_url', '');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const usedPrice = form.current_price ? Number(form.current_price) : (selectedProduct?.default_price || 0);
    // Store category as the category name for display, using the ID as value
    const selectedCat = categoryOptions.find(c => c.value === form.category);
    onSubmit({
      ...form,
      qty: Number(form.qty) || 0,
      current_price: form.current_price ? Number(form.current_price) : null,
      used_price: usedPrice,
      product_name: selectedProduct?.name || '',
      category: selectedCat ? (selectedCat.cat.name || selectedCat.cat.name_ar || selectedCat.cat.name_fa) : form.category,
    });
  };

  const total = (Number(form.qty) || 0) * (Number(form.current_price) || selectedProduct?.default_price || 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">{u.date}</Label>
          <Input type="date" value={form.date} onChange={e => handleChange('date', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">{u.branch}</Label>
          <BranchSelect value={form.branch} onChange={v => handleChange('branch', v)} />
        </div>
      </div>

      {/* Category — owner-created only */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs flex items-center gap-1">
            <Tag className="w-3 h-3" /> {u.category}
          </Label>
          <Link
            to="/product-management"
            className="text-[10px] text-primary hover:underline flex items-center gap-1"
            onClick={() => onCancel?.()}
          >
            <Settings2 className="w-3 h-3" />
            {u.manage_categories}
          </Link>
        </div>

        {loadingCats ? (
          <div className="h-9 bg-muted animate-pulse rounded-md" />
        ) : categoryOptions.length === 0 ? (
          <div className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-border bg-muted/30">
            <span className="text-xs text-muted-foreground flex-1">{u.no_categories}</span>
            <Link
              to="/product-management"
              className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
              onClick={() => onCancel?.()}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              {u.add_category}
            </Link>
          </div>
        ) : (
          <Select value={form.category} onValueChange={v => handleChange('category', v)}>
            <SelectTrigger>
              <SelectValue placeholder={u.select_category} />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Product */}
      <div>
        <Label className="text-xs">{u.product}</Label>
        <Select value={form.product_id} onValueChange={v => handleChange('product_id', v)}>
          <SelectTrigger>
            <SelectValue placeholder={u.select_product} />
          </SelectTrigger>
          <SelectContent>
            {products.map(p => (
              <SelectItem key={p.product_id} value={p.product_id}>
                {p.name} ({p.unit})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">{u.quantity}</Label>
          <Input type="number" step="0.01" min="0.01" value={form.qty}
            onChange={e => handleChange('qty', e.target.value)} required />
        </div>
        <div>
          <Label className="text-xs">{u.price}</Label>
          <Input type="number" step="0.01" value={form.current_price}
            onChange={e => handleChange('current_price', e.target.value)}
            placeholder={selectedProduct ? String(selectedProduct.default_price) : ''} />
        </div>
      </div>

      {/* Live total */}
      {total > 0 && (
        <div className="bg-secondary/50 rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{u.estimated_total}</span>
          <span className="text-sm font-bold text-foreground">{currency}{total.toLocaleString()}</span>
        </div>
      )}

      {/* Notes */}
      <div>
        <Label className="text-xs">{u.notes}</Label>
        <Textarea
          value={form.notes}
          onChange={e => handleChange('notes', e.target.value)}
          placeholder={u.supplier_hint}
          className="h-16 text-xs resize-none"
        />
      </div>

      {/* Receipt Upload */}
      <div>
        <Label className="text-xs flex items-center gap-1"><Upload className="w-3 h-3" /> {u.receipt}</Label>
        {receiptPreview ? (
          <div className="relative mt-1">
            <img src={receiptPreview} alt="Receipt" className="w-full h-32 object-cover rounded-lg border" />
            <button type="button" onClick={clearReceipt}
              className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 shadow">
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <label className="mt-1 flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : (
              <>
                <Upload className="w-4 h-4 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">{u.upload}</span>
              </>
            )}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleReceiptUpload} />
          </label>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1"
          disabled={!form.product_id || !form.qty || uploading}>
          {u.save}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="flex-1">{u.cancel}</Button>
        )}
      </div>
    </form>
  );
}